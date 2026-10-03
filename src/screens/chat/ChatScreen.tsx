import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  StatusBar,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius } from '../../lib/theme';
import { useAuth } from '../../hooks/useAuth';
import { apiClient } from '../../lib/apiClient';
import { saveBookingChat, getBookingChat, deleteBookingChat } from '../../lib/chatStorage';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl } from '../../lib/cycleUtils';
import {
  onChatMessageReceived,
  joinConversationRoom,
  leaveConversationRoom,
  connectSocket,
} from '../../lib/socket';
import { getAccessToken } from '../../lib/secureStorage';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export interface RawChatMessage {
  id: string;
  conversation_id?: string;
  message: string;
  message_type?: string;
  created_at: string;
  updated_at?: string;
  read_at?: string | null;
  sent_by: string; // 'owner' | 'renter' or user id
  imageUrl?: string;
}

const QUICK_REPLIES = [
  '👍 Got it',
  '📍 On my way',
  '🔧 Any issues?',
  "⏰ I'll return on time",
];

// Helper to reliably parse timestamp from ISO strings, SQL dates, or numeric epochs
const getMessageTime = (created_at?: string): number => {
  if (!created_at) return 0;
  if (/^\d+$/.test(created_at)) {
    return Number(created_at);
  }
  const parsed = new Date(created_at).getTime();
  return isNaN(parsed) ? 0 : parsed;
};

// Sort messages strictly in chronological order (oldest at top, newest at bottom)
const sortMessagesByTime = (msgs: RawChatMessage[]): RawChatMessage[] => {
  return [...msgs].sort((a, b) => {
    const timeA = getMessageTime(a.created_at);
    const timeB = getMessageTime(b.created_at);
    if (timeA !== timeB) return timeA - timeB; // Earliest timestamp first
    return String(a.id).localeCompare(String(b.id));
  });
};

export default function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { user } = useAuth();

  const {
    id: routeId,
    conversationId: routeConvId,
    bookingId,
    otherUserId,
    otherUserName = 'User',
    otherUserAvatar,
    isOwner,
    myRole = isOwner ? 'owner' : 'renter',
    cycleName = 'Rockrider ST 100',
    cycleImage = '',
    location = 'Block-8, Trishul',
    rentalStatus = 'Active Rental',
    startTime,
    endTime,
    totalAmount = 180,
  } = route.params;

  // The conversation id collected from notification payload
  const conversationId = routeConvId || routeId;

  const otherRole = myRole.toLowerCase() === 'owner' ? 'Renter' : 'Owner';

  const [messages, setMessages] = useState<RawChatMessage[]>([]);
  const [currentConvId, setCurrentConvId] = useState<string | null>(
    conversationId ? String(conversationId) : null
  );
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);
  const currentConvIdRef = useRef<string | null>(null);
  const bookingIdRef = useRef<string>(bookingId);
  const myRoleRef = useRef<string>(myRole);

  useEffect(() => {
    currentConvIdRef.current = currentConvId;
  }, [currentConvId]);

  useEffect(() => {
    bookingIdRef.current = bookingId;
  }, [bookingId]);

  useEffect(() => {
    myRoleRef.current = myRole;
  }, [myRole]);

  const hasFetchedOnceRef = useRef(false);

  // Fetch messages from backend via GET only once when entering room or pull-to-refresh
  const fetchMessages = useCallback(async (isPullRefresh = false) => {
    const targetId = conversationId || currentConvIdRef.current || bookingId;
    if (!targetId) {
      setLoading(false);
      return;
    }
    if (isPullRefresh) {
      setRefreshing(true);
    }

    try {
      console.log(`[ChatScreen] 🚀 Fetching messages for conversation: "${targetId}"`);
      const remoteMessages = await apiClient.getConversations(targetId);
      console.log(`[ChatScreen] 📨 Received ${remoteMessages?.length || 0} messages from backend:`, remoteMessages);

      if (Array.isArray(remoteMessages) && remoteMessages.length > 0) {
        // Normalize EVERY message object to ensure all required fields are guaranteed strings/proper types
        const normalized: RawChatMessage[] = remoteMessages.map((m: any, idx: number) => {
          const rawId = m.id !== undefined && m.id !== null ? String(m.id) : (m._id ? String(m._id) : `msg_${Date.now()}_${idx}`);
          const rawConvId = m.conversation_id || m.conversationId || targetId || '';
          const rawText = m.message !== undefined && m.message !== null
            ? String(m.message)
            : m.text !== undefined && m.text !== null
            ? String(m.text)
            : m.msg !== undefined && m.msg !== null
            ? String(m.msg)
            : m.body !== undefined && m.body !== null
            ? String(m.body)
            : m.content !== undefined && m.content !== null
            ? String(m.content)
            : '';
          const rawSender = String(m.sent_by || m.sender_id || m.senderId || '').trim();
          const rawCreated = m.created_at || m.createdAt || new Date().toISOString();
          const rawType = m.message_type || (m.imageUrl || m.image_url ? 'image' : 'text');
          const rawImg = m.imageUrl || m.image_url || undefined;

          return {
            id: rawId,
            conversation_id: String(rawConvId),
            message: rawText,
            message_type: rawType,
            imageUrl: rawImg,
            sent_by: rawSender,
            created_at: rawCreated,
            read_at: m.read_at || null,
          };
        });

        // Ensure chronological ordering: oldest first at top, newest at bottom
        const sorted = sortMessagesByTime(normalized);
        console.log(`[ChatScreen] 🎯 Displaying ${sorted.length} message(s) chronologically:`, sorted);
        setMessages(sorted);
        await saveBookingChat(bookingId, sorted);
      } else {
        console.log(`[ChatScreen] ℹ️ 0 messages returned from backend for booking ${bookingId}`);
        setMessages([]);
      }
    } catch (err: any) {
      console.warn('[ChatScreen] Error fetching conversations from backend:', err?.message || err);
      // Fallback to local cache if network error
      const cached = await getBookingChat(bookingId);
      if (cached && cached.length > 0) {
        setMessages(sortMessagesByTime(cached));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [bookingId, conversationId]);

  useEffect(() => {
    console.log(`[ChatScreen] 💬 Chat opened with conversation_id: "${conversationId}", booking_id: "${bookingId}"`);

    // 1. Initial load: show cached immediately (if any exists) so user sees UI instantly
    (async () => {
      const cached = await getBookingChat(bookingId);
      if (cached && cached.length > 0) {
        // Exclude unconfirmed or failed temporary messages that were never acknowledged by the server
        const confirmedCached = cached.filter((m) => !m.id.startsWith('msg_') && !m.id.startsWith('temp_'));
        if (confirmedCached.length > 0) {
          setMessages(sortMessagesByTime(confirmedCached));
          setLoading(false);
        }
      }
      // 2. Fetch fresh messages via GET request strictly ONCE when entering the room
      if (!hasFetchedOnceRef.current) {
        hasFetchedOnceRef.current = true;
        fetchMessages(false);
      }
    })();

    // 3. Ensure socket is actively connected in foreground
    getAccessToken().then((token) => {
      if (token) {
        connectSocket(token, true);
      }
    });

    // 4. Leaving room cleanup: CLEAR local cache as requested
    return () => {
      console.log(`[ChatScreen] 🧹 Leaving room - clearing local cache for booking: ${bookingIdRef.current}`);
      hasFetchedOnceRef.current = false;
      deleteBookingChat(bookingIdRef.current).catch((err) => {
        console.warn('[ChatScreen] Error clearing cache on leaving room:', err);
      });
    };
  }, [bookingId, conversationId, fetchMessages]);

  // Join and leave conversation room strictly using the same conversation id from notification payload
  useEffect(() => {
    const roomToJoin = currentConvId || conversationId;
    if (!roomToJoin) {
      console.log('[ChatScreen] ⏳ Waiting for conversationId before joining room...');
      return;
    }

    console.log(`[ChatScreen] 🚪 Joining room with conversation id: "${roomToJoin}"`);
    joinConversationRoom(roomToJoin);

    return () => {
      console.log(`[ChatScreen] 🚪 Leaving room with conversation id: "${roomToJoin}"`);
      leaveConversationRoom(roomToJoin);
    };
  }, [currentConvId, conversationId]);

  // Subscribe strictly to real-time chat messages via WebSocket "message:new"
  useEffect(() => {
    const unsubscribe = onChatMessageReceived((newMsg) => {
      const msgText = newMsg?.message ?? (newMsg as any)?.text ?? (newMsg as any)?.msg;
      if (!newMsg || !msgText) return;

      console.log(`[ChatScreen] 💬 Received message in room "conversation:${newMsg.conversation_id}":`, {
        id: newMsg.id,
        conversation_id: newMsg.conversation_id,
        sender_id: newMsg.sender_id,
        sent_by: (newMsg as any).sent_by,
        message: msgText,
        created_at: newMsg.created_at,
        currentRoom: currentConvIdRef.current,
      });

      const msgId = String(newMsg.id ?? `msg_${Date.now()}`);
      const text = String(msgText);
      const senderId = String(newMsg.sender_id || (newMsg as any).sent_by || '').trim();
      const createdAt = newMsg.created_at || new Date().toISOString();
      const convId = String(newMsg.conversation_id || '');

      if (convId && !currentConvIdRef.current) {
        setCurrentConvId(convId);
      }

      setMessages((prev) => {
        // Prevent duplicate if already in state
        if (prev.some((m) => String(m.id) === msgId)) {
          return prev;
        }

        const incomingItem: RawChatMessage = {
          id: msgId,
          conversation_id: convId,
          message: text,
          message_type: 'text',
          sent_by: senderId,
          created_at: createdAt,
          read_at: null,
        };

        // If this matches an optimistic message waiting for confirmation, reconcile it
        const myRoleVal = myRoleRef.current?.toLowerCase();
        const optimisticIndex = prev.findIndex(
          (m) =>
            m.id.startsWith('msg_') &&
            m.message === text &&
            (m.sent_by?.toLowerCase() === myRoleVal ||
              senderId.toLowerCase() === myRoleVal ||
              (user?.id && senderId === String(user.id)))
        );

        let updated: RawChatMessage[];
        if (optimisticIndex !== -1) {
          updated = [...prev];
          updated[optimisticIndex] = incomingItem;
        } else {
          updated = [...prev, incomingItem];
        }

        const sorted = sortMessagesByTime(updated);

        // Store updated message list in frontend cache immediately
        saveBookingChat(bookingIdRef.current, sorted).catch((e) => {
          console.warn('[ChatScreen] Failed saving websocket message to cache:', e);
        });

        return sorted;
      });

      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 80);
    });

    return () => {
      unsubscribe();
    };
  }, [user?.id]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || sending) return;

    setSending(true);
    const convIdToUse = currentConvIdRef.current || conversationId || undefined;

    try {
      console.log(`[ChatScreen] Sending message via POST /api/messages for booking ${bookingId} (conv: ${convIdToUse || 'none'})...`);
      const response = await apiClient.sendMessage({
        booking_id: bookingId,
        message: text,
        conversation_id: convIdToUse,
      });
      console.log('[ChatScreen] Message sent response from backend:', response);

      // Successfully confirmed by server - clear text input
      setInputText('');

      const createdRecord = response?.data || response?.message || response?.row || response?.msg || response;
      const sentId = String(
        (createdRecord && typeof createdRecord === 'object' && (createdRecord.id || createdRecord._id)) ||
        `sent_${Date.now()}`
      );
      const sentSender = String(
        (createdRecord && typeof createdRecord === 'object' && (createdRecord.sent_by || createdRecord.sender_id)) ||
        (user?.id ? String(user.id) : myRole)
      );
      const sentCreatedAt =
        (createdRecord && typeof createdRecord === 'object' && (createdRecord.created_at || createdRecord.createdAt)) ||
        new Date().toISOString();

      const confirmedMsg: RawChatMessage = {
        id: sentId,
        conversation_id: String(convIdToUse || ''),
        message: text,
        message_type: 'text',
        sent_by: sentSender,
        created_at: sentCreatedAt,
        read_at: null,
      };

      setMessages((prev) => {
        // Prevent duplicate if socket already delivered it
        if (
          prev.some(
            (m) =>
              m.id === sentId ||
              (m.message === text &&
                m.sent_by === sentSender &&
                Math.abs(new Date(m.created_at).getTime() - new Date(sentCreatedAt).getTime()) < 4000)
          )
        ) {
          return prev;
        }
        const updated = sortMessagesByTime([...prev, confirmedMsg]);
        saveBookingChat(bookingId, updated).catch((e) => {
          console.warn('[ChatScreen] Failed saving sent message to cache:', e);
        });
        return updated;
      });

      // Check for conversation_id from response
      const convId =
        response?.conversation_id ||
        response?.data?.conversation_id ||
        response?.message?.conversation_id ||
        (createdRecord && typeof createdRecord === 'object' && createdRecord.conversation_id);
      if (convId && !currentConvIdRef.current) {
        setCurrentConvId(String(convId));
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    } catch (err: any) {
      console.error('[ChatScreen] Failed to send message due to server issue:', err);
      // Do NOT show unsent message in chatscreen on server issues.
      // Leave inputText intact so the user can re-send without retyping.
      Alert.alert(
        'Message Not Sent',
        err?.message || 'Could not send message due to a server issue. Please try again.'
      );
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (reply: string) => {
    setInputText(reply);
  };

  const handleStartCall = () => {
    const targetConvId = conversationId || currentConvIdRef.current;
    if (!targetConvId) {
      Alert.alert('Call Unavailable', 'Waiting for active conversation session.');
      return;
    }

    console.log(`[ChatScreen] 📞 User initiated call. Opening CallModal with conversationId: "${targetConvId}"`);
    navigation.navigate('CallModal', {
      targetUserId: otherUserId,
      targetUserName: otherUserName,
      targetUserAvatar: otherUserAvatar,
      bookingId,
      conversationId: targetConvId,
    });
  };

  const handleMenuPress = () => {
    Alert.alert(
      otherUserName,
      `Cycle: ${cycleName}\nLocation: ${location}\nStatus: ${rentalStatus}`,
      [
        {
          text: 'Call ' + otherRole,
          onPress: handleStartCall,
        },
        {
          text: 'Report Issue',
          style: 'destructive',
          onPress: () =>
            Alert.alert(
              'Report Issue',
              'To report an issue with this rental, please use the Report button on the Ongoing Rentals screen.'
            ),
        },
        { text: 'Close', style: 'cancel' },
      ]
    );
  };

  // Format started & ends times
  const formatTime = (timeVal?: string, fallback = '') => {
    if (!timeVal) return fallback;
    try {
      const d = new Date(timeVal);
      if (isNaN(d.getTime())) return timeVal;
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return timeVal;
    }
  };

  const formattedStarted = startTime
    ? `Today, ${formatTime(startTime, '10:30 AM')}`
    : 'Today, 10:30 AM';

  const formattedEnds = endTime
    ? `Today, ${formatTime(endTime, '06:30 PM')}`
    : 'Today, 06:30 PM';

  // Calculate remaining hours
  const calculateRemainingLabel = () => {
    if (!endTime) return '(7h left)';
    try {
      const diffMs = new Date(endTime).getTime() - Date.now();
      if (diffMs <= 0) return '(Expired)';
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return hours > 0 ? `(${hours}h left)` : `(${mins}m left)`;
    } catch {
      return '(7h left)';
    }
  };

  // Determine if a message was sent by the current user
  const isMessageFromMe = (msg: RawChatMessage): boolean => {
    const rawSender = String(msg.sent_by || (msg as any).sender_id || (msg as any).senderId || '').trim();
    const senderLower = rawSender.toLowerCase();
    const myRoleLower = String(myRole || '').trim().toLowerCase();
    const myUserIdStr = user?.id ? String(user.id).trim().toLowerCase() : '';
    const otherUserIdStr = otherUserId ? String(otherUserId).trim().toLowerCase() : '';

    if (otherUserIdStr && senderLower === otherUserIdStr) {
      return false;
    }
    if (myUserIdStr && senderLower === myUserIdStr) {
      return true;
    }
    if (myRoleLower && senderLower === myRoleLower) {
      return true;
    }
    return false;
  };

  const renderMessageItem = ({ item }: { item: RawChatMessage }) => {
    const isMine = isMessageFromMe(item);
    const timeStr = (() => {
      if (!item.created_at) return '';
      try {
        const ms = getMessageTime(item.created_at);
        if (!ms) return '';
        const d = new Date(ms);
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
      } catch {
        return '';
      }
    })();

    const msgContent = String(
      item.message ??
      (item as any).text ??
      (item as any).msg ??
      (item as any).body ??
      (item as any).content ??
      ''
    );

    const isImage =
      item.message_type === 'image' ||
      /\.(jpe?g|png|webp|gif)/i.test(msgContent || item.imageUrl || '');

    return (
      <View style={[styles.messageWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}>
        {!isMine && (
          <View style={styles.senderAvatarContainer}>
            {otherUserAvatar ? (
              <Image source={{ uri: otherUserAvatar }} style={styles.senderAvatar} />
            ) : (
              <View style={styles.senderAvatarFallback}>
                <Ionicons name="person" size={16} color="#475569" />
              </View>
            )}
            <View style={styles.senderOnlineDot} />
          </View>
        )}

        <View style={styles.bubbleAndMeta}>
          <View
            style={[
              styles.bubble,
              isMine ? styles.myBubble : styles.theirBubble,
              isImage ? styles.imageBubble : null,
            ]}
          >
            {isImage && (
              <Image
                source={{ uri: getCycleImageUrl(item.imageUrl || msgContent) }}
                style={styles.messageImage}
                resizeMode="cover"
              />
            )}
            {(!isImage || (msgContent && !msgContent.startsWith('http'))) && (
              <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
                {msgContent}
              </Text>
            )}
          </View>

          <View style={[styles.metaRow, isMine ? styles.myMetaRow : styles.theirMetaRow]}>
            <Text style={styles.timeText}>{timeStr}</Text>
            {isMine && (
              <Ionicons
                name="checkmark-done"
                size={14}
                color="#0084FF"
                style={{ marginLeft: 3 }}
              />
            )}
          </View>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />

      {/* Top Header Bar */}
      <View style={styles.headerBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="arrow-back" size={24} color="#0F172A" />
        </TouchableOpacity>

        <View style={styles.headerAvatarContainer}>
          {otherUserAvatar ? (
            <Image source={{ uri: otherUserAvatar }} style={styles.headerAvatar} />
          ) : (
            <View style={styles.headerAvatarFallback}>
              <Ionicons name="person" size={20} color="#475569" />
            </View>
          )}
          <View style={styles.headerOnlineBadge} />
        </View>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Chat with {otherUserName}
          </Text>
          <View style={styles.headerSubtitleRow}>
            <Text style={styles.headerSubtitle}>
              {otherRole} • Online
            </Text>
            <View style={styles.inlineGreenDot} />
          </View>
        </View>

        {/* Call and Menu Icons */}
        <View style={styles.headerActionsRow}>
          <TouchableOpacity
            style={styles.callActionButton}
            onPress={handleStartCall}
          >
            <View style={styles.callIconCircle}>
              <Ionicons name="call" size={17} color="#0284C7" />
            </View>
            <Text style={styles.callActionLabel}>Call</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.menuActionButton}
            onPress={handleMenuPress}
          >
            <Ionicons name="ellipsis-vertical" size={20} color="#475569" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Pinned Rental Summary Card */}
      <View style={styles.rentalSummaryCard}>
        <View style={styles.cardTopRow}>
          <View style={styles.cycleThumbContainer}>
            {cycleImage ? (
              <Image
                source={{ uri: getCycleImageUrl(cycleImage) }}
                style={styles.cycleThumb}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.cycleThumbFallback}>
                <Ionicons name="bicycle" size={32} color="#0284C7" />
              </View>
            )}
          </View>

          <View style={styles.cycleDetailsColumn}>
            <View style={styles.cycleNameRow}>
              <Text style={styles.cycleNameText} numberOfLines={1}>
                {cycleName}
              </Text>
              <Ionicons name="checkmark-circle" size={16} color="#0284C7" style={{ marginLeft: 5 }} />
            </View>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={13} color="#64748B" />
              <Text style={styles.locationText} numberOfLines={1}>
                {location}
              </Text>
            </View>
          </View>

          <View style={styles.statusPill}>
            <View style={styles.statusPillDot} />
            <Text style={styles.statusPillText}>
              {rentalStatus === 'slot_booked'
                ? 'Slot Booked'
                : rentalStatus === 'return_pending'
                ? 'Return Pending'
                : 'Active Rental'}
            </Text>
          </View>
        </View>

        <View style={styles.cardDivider} />

        <View style={styles.cardBottomRow}>
          <View style={styles.statColumn}>
            <View style={styles.statLabelRow}>
              <Ionicons name="time-outline" size={12} color="#64748B" />
              <Text style={styles.statLabel}>Started</Text>
            </View>
            <Text style={styles.statValue}>{formattedStarted}</Text>
          </View>

          <View style={styles.statColumnCenter}>
            <View style={styles.statLabelRow}>
              <Ionicons name="calendar-outline" size={12} color="#64748B" />
              <Text style={styles.statLabel}>Ends</Text>
            </View>
            <Text style={styles.statValue}>
              {formattedEnds}{' '}
              <Text style={styles.statSubValue}>{calculateRemainingLabel()}</Text>
            </Text>
          </View>

          <View style={styles.statColumnRight}>
            <View style={styles.statLabelRow}>
              <Text style={styles.statCurrencySymbol}>₹</Text>
              <Text style={styles.statLabel}>Total Amount</Text>
            </View>
            <Text style={styles.statAmountValue}>₹{totalAmount}</Text>
          </View>
        </View>
      </View>

      {/* Main Chat Area */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
        style={styles.keyboardContainer}
      >
        {/* Date Divider Pill */}
        <View style={styles.dateDividerContainer}>
          <View style={styles.dateDividerPill}>
            <Text style={styles.dateDividerText}>
              Today, {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#0284C7" />
            <Text style={styles.loadingText}>Loading conversations...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item, idx) => String(item?.id ?? idx)}
            renderItem={renderMessageItem}
            contentContainerStyle={[styles.messagesList, { flexGrow: 1 }]}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchMessages(true)}
                colors={['#0284C7']}
              />
            }
            onContentSizeChange={() => {
              if (messages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>No messages yet</Text>
                <Text style={styles.emptySubtitle}>
                  Coordinate cycle pickup, drop-off, or ask questions directly with {otherUserName}.
                </Text>
              </View>
            }
          />
        )}

        {/* Quick Reply Pills Carousel */}
        <View style={styles.quickRepliesContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRepliesScroll}
          >
            {QUICK_REPLIES.map((reply, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.quickReplyPill}
                onPress={() => handleQuickReply(reply)}
                activeOpacity={0.7}
              >
                <Text style={styles.quickReplyText}>{reply}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Input Bar */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            style={styles.attachmentButton}
            onPress={() => Alert.alert('Attachment', 'Select photo from gallery or take a picture with camera.')}
          >
            <Ionicons name="attach-outline" size={24} color="#475569" />
          </TouchableOpacity>

          <View style={styles.textInputBox}>
            <TextInput
              style={styles.textInput}
              placeholder="Type a message..."
              placeholderTextColor="#94A3B8"
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={styles.emojiButton}
              onPress={() => setInputText((prev) => prev + ' 😊')}
            >
              <Ionicons name="happy-outline" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim() || sending}
            onPress={handleSendMessage}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" style={{ marginLeft: 2 }} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  backButton: {
    padding: 4,
    marginRight: 4,
  },
  headerAvatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E2E8F0',
  },
  headerAvatarFallback: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerOnlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 5.5,
    backgroundColor: '#22C55E',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  headerSubtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  inlineGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
    marginLeft: 5,
  },
  headerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  callActionButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  callIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  callActionLabel: {
    fontSize: 10,
    color: '#0284C7',
    fontWeight: '600',
    marginTop: 2,
  },
  menuActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Rental Summary Card */
  rentalSummaryCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cycleThumbContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cycleThumb: {
    width: '100%',
    height: '100%',
  },
  cycleThumbFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F9FF',
  },
  cycleDetailsColumn: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  cycleNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cycleNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  locationText: {
    fontSize: 12,
    color: '#64748B',
    marginLeft: 3,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  statusPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#16A34A',
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  cardDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  statColumn: {
    flex: 1,
  },
  statColumnCenter: {
    flex: 1.3,
    paddingHorizontal: 4,
  },
  statColumnRight: {
    flex: 0.9,
    alignItems: 'flex-end',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  statLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginLeft: 4,
  },
  statCurrencySymbol: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  statSubValue: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  statAmountValue: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },

  /* Chat Container */
  keyboardContainer: {
    flex: 1,
  },
  dateDividerContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  dateDividerPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 14,
  },
  dateDividerText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  messageWrapper: {
    marginVertical: 6,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  myWrapper: {
    justifyContent: 'flex-end',
  },
  theirWrapper: {
    justifyContent: 'flex-start',
  },
  senderAvatarContainer: {
    position: 'relative',
    marginRight: 8,
    marginBottom: 16,
  },
  senderAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
  },
  senderAvatarFallback: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  senderOnlineDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#22C55E',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bubbleAndMeta: {
    maxWidth: '78%',
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  myBubble: {
    backgroundColor: '#0084FF',
    borderBottomRightRadius: 4,
    alignSelf: 'flex-end',
  },
  theirBubble: {
    backgroundColor: '#F1F5F9',
    borderBottomLeftRadius: 4,
    alignSelf: 'flex-start',
  },
  imageBubble: {
    padding: 4,
    backgroundColor: '#E0F2FE',
  },
  messageImage: {
    width: 220,
    height: 140,
    borderRadius: 12,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 14.5,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#FFFFFF',
    fontWeight: '400',
  },
  theirMessageText: {
    color: '#0F172A',
    fontWeight: '400',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  myMetaRow: {
    alignSelf: 'flex-end',
  },
  theirMetaRow: {
    alignSelf: 'flex-start',
  },
  timeText: {
    fontSize: 11,
    color: '#94A3B8',
  },

  /* Quick Replies */
  quickRepliesContainer: {
    paddingVertical: 6,
    backgroundColor: '#F8FAFC',
  },
  quickRepliesScroll: {
    paddingHorizontal: 14,
  },
  quickReplyPill: {
    backgroundColor: '#E0F2FE',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  quickReplyText: {
    fontSize: 12.5,
    color: '#0284C7',
    fontWeight: '600',
  },

  /* Input Bar */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  attachmentButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  textInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14.5,
    color: '#0F172A',
    maxHeight: 90,
  },
  emojiButton: {
    padding: 4,
    marginLeft: 4,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#0084FF',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#0084FF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
    elevation: 0,
    shadowOpacity: 0,
  },

  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748B',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
});

