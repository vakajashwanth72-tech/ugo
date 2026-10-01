import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { ChatMessage } from '../../types';
import Header from '../../components/ui/Header';
import { RootStackParamList } from '../../navigation/navigationTypes';

type ChatRouteProp = RouteProp<RootStackParamList, 'Chat'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ChatScreen() {
  const route = useRoute<ChatRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { bookingId, otherUserId, otherUserName } = route.params;
  const { user } = useAuth();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!user || !otherUserId) return;

    let cancelled = false;

    const initChat = async () => {
      setLoading(true);
      try {
        // 1. Check for existing conversation between user and otherUser
        const { data: convs, error: convErr } = await supabase
          .from('chat_conversations')
          .select('id')
          .or(
            `and(user_id.eq.${user.id},owner_id.eq.${otherUserId}),and(user_id.eq.${otherUserId},owner_id.eq.${user.id})`
          )
          .limit(1);

        if (convErr) throw convErr;

        let activeConvId = convs && convs.length > 0 ? convs[0].id : null;

        // If not found, create new conversation
        if (!activeConvId) {
          const { data: newConv, error: createErr } = await supabase
            .from('chat_conversations')
            .insert({
              user_id: user.id,
              owner_id: otherUserId})
            .select('id')
            .single();

          if (!createErr && newConv) {
            activeConvId = newConv.id;
          }
        }

        if (cancelled) return;

        if (activeConvId) {
          setConversationId(activeConvId);

          // 2. Fetch past messages
          const { data: pastMessages, error: msgErr } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('conversation_id', activeConvId)
            .order('created_at', { ascending: true });

          if (msgErr) console.warn('Messages fetch error:', msgErr);
          setMessages(pastMessages || []);
        }
      } catch (err) {
        console.error('Chat init error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    initChat();

    return () => {
      cancelled = true;
    };
  }, [user, otherUserId]);

  // Periodic message polling (replacing Supabase realtime channel)
  useEffect(() => {
    if (!conversationId) return;

    const pollMessages = async () => {
      try {
        const { data: latestMessages, error } = await supabase
          .from('chat_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        if (!error && latestMessages) {
          setMessages(latestMessages);
        }
      } catch (e) {
        // silent catch
      }
    };

    const interval = setInterval(pollMessages, 3000);
    return () => clearInterval(interval);
  }, [conversationId]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || !conversationId || !user || sending) return;

    setSending(true);
    setInputText('');

    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          conversation_id: conversationId,
          sender_id: user.id,
          message: text})
        .select()
        .single();

      if (error) throw error;

      setMessages((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setSending(false);
    }
  };

  const renderMessageItem = ({ item }: { item: ChatMessage }) => {
    const isMine = item.sender_id === user?.id;

    return (
      <View style={[styles.messageRow, isMine ? styles.myRow : styles.theirRow]}>
        <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
          <Text style={[styles.messageText, isMine ? styles.myMessageText : styles.theirMessageText]}>
            {item.message}
          </Text>
          <Text style={[styles.timeText, isMine ? styles.myTimeText : styles.theirTimeText]}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header
        title={otherUserName}
        showBack
        rightAction={{
          icon: 'call',
          onPress: () =>
            navigation.navigate('CallModal', {
              targetUserId: otherUserId,
              targetUserName: otherUserName,
              bookingId})}}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        style={styles.container}
      >
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Opening conversation...</Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessageItem}
            contentContainerStyle={styles.messagesList}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={56} color={colors.textLight} />
                <Text style={styles.emptyTitle}>Start Coordinating</Text>
                <Text style={styles.emptySubtitle}>
                  Say hi to {otherUserName} to coordinate cycle pickup or ask any questions!
                </Text>
              </View>
            }
          />
        )}

        {/* Input Bar */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder="Type your message..."
            placeholderTextColor={colors.textLight}
            value={inputText}
            onChangeText={setInputText}
            multiline
            maxLength={500}
          />

          <TouchableOpacity
            style={[styles.sendButton, !inputText.trim() && styles.sendButtonDisabled]}
            disabled={!inputText.trim() || sending}
            onPress={handleSendMessage}
          >
            {sending ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="send" size={18} color={colors.white} />
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
    backgroundColor: colors.backgroundDark},
  container: {
    flex: 1,
    backgroundColor: colors.surface},
  messagesList: {
    padding: spacing.md,
    paddingBottom: spacing.lg},
  messageRow: {
    marginVertical: 4,
    flexDirection: 'row'},
  myRow: {
    justifyContent: 'flex-end'},
  theirRow: {
    justifyContent: 'flex-start'},
  bubble: {
    maxWidth: '78%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.lg},
  myBubble: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 2},
  theirBubble: {
    backgroundColor: colors.surfaceLight,
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: colors.borderLight},
  messageText: {
    fontSize: typography.body1.fontSize,
    lineHeight: 20},
  myMessageText: {
    color: colors.white},
  theirMessageText: {
    color: colors.textPrimary},
  timeText: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end'},
  myTimeText: {
    color: 'rgba(255, 255, 255, 0.7)'},
  theirTimeText: {
    color: colors.textLight},
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    gap: spacing.sm},
  textInput: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: typography.body2.fontSize,
    color: colors.textPrimary,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.borderLight},
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center'},
  sendButtonDisabled: {
    backgroundColor: colors.border},
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'},
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize},
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    paddingTop: spacing.xxl * 2},
  emptyTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.md},
  emptySubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260}});
