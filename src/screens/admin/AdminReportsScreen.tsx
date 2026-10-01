import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { apiClient } from '../../lib/apiClient';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

/**
 * Matches backend query:
 * select * from reports
 *
 * Schema:
 * - id: uuid (PK)
 * - reported_by: uuid
 * - reported_user_id: uuid | null
 * - cycle_id: uuid | null
 * - booking_id: uuid | null
 * - reporter_role: text
 * - reason: text
 * - description: text
 * - status: text ('pending', 'investigating', 'resolved', 'completed', 'closed')
 * - admin_note: text | null
 * - resolved_by: uuid | null
 * - created_at: timestamp with time zone
 * - updated_at: timestamp with time zone
 */
export interface CampusReportItem {
  id: string;
  reported_by: string;
  reported_user_id: string | null;
  cycle_id: string | null;
  booking_id: string | null;
  reporter_role: string;
  reason: string;
  description: string;
  status: 'pending' | 'investigating' | 'resolved' | 'completed' | 'closed' | string;
  admin_note: string | null;
  resolved_by: string | null;
  created_at: string;
  updated_at: string;
}

function formatReportDateTime(dateStr?: string | null): string {
  if (!dateStr) return 'Not set';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('en-IN', {
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch (_) {
    return dateStr;
  }
}

function formatReportDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch (_) {
    return dateStr;
  }
}

function getReportStatusConfig(status: string): {
  label: string;
  variant: 'warning' | 'primary' | 'success' | 'neutral' | 'danger';
  color: string;
  bgColor: string;
} {
  const s = String(status || '').toLowerCase().trim();
  switch (s) {
    case 'pending':
      return {
        label: 'Pending',
        variant: 'warning',
        color: '#F59E0B',
        bgColor: '#FFFBEB',
      };
    case 'investigating':
      return {
        label: 'Investigating',
        variant: 'primary',
        color: '#3B82F6',
        bgColor: '#EFF6FF',
      };
    case 'resolved':
    case 'completed':
      return {
        label: 'Resolved',
        variant: 'success',
        color: '#10B981',
        bgColor: '#ECFDF5',
      };
    case 'closed':
    case 'rejected':
      return {
        label: 'Closed',
        variant: 'neutral',
        color: colors.textSecondary,
        bgColor: '#F1F5F9',
      };
    default:
      return {
        label: status ? status.toUpperCase() : 'PENDING',
        variant: 'neutral',
        color: colors.primary,
        bgColor: '#EFF6FF',
      };
  }
}

function getReasonCategory(reason: string): {
  category: 'Damage' | 'Parking' | 'Payment' | 'Overdue' | 'Other';
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  bgColor: string;
} {
  const r = String(reason || '').toLowerCase();
  if (r.includes('damage') || r.includes('puncture') || r.includes('brake') || r.includes('broken')) {
    return {
      category: 'Damage',
      icon: 'construct-outline',
      color: '#EF4444',
      bgColor: '#FEF2F2',
    };
  }
  if (r.includes('park') || r.includes('stand') || r.includes('locked')) {
    return {
      category: 'Parking',
      icon: 'navigate-outline',
      color: '#3B82F6',
      bgColor: '#EFF6FF',
    };
  }
  if (r.includes('pay') || r.includes('amount') || r.includes('money') || r.includes('fee')) {
    return {
      category: 'Payment',
      icon: 'cash-outline',
      color: '#F59E0B',
      bgColor: '#FFFBEB',
    };
  }
  if (r.includes('late') || r.includes('overdue') || r.includes('delay') || r.includes('return')) {
    return {
      category: 'Overdue',
      icon: 'time-outline',
      color: '#8B5CF6',
      bgColor: '#F5F3FF',
    };
  }
  return {
    category: 'Other',
    icon: 'alert-circle-outline',
    color: '#F97316',
    bgColor: '#FFF7ED',
  };
}

const MOCK_REPORTS: CampusReportItem[] = [
  {
    id: 'rep-881a-4921-99af-1029ba880011',
    reported_by: 'usr-1102-441a-88ff-992211aa8810',
    reported_user_id: 'usr-5541-229c-77dd-110022bb9933',
    cycle_id: 'cyc-3321-7788-9900-112233445566',
    booking_id: 'bk-9901-4433-2211-556677889900',
    reporter_role: 'renter',
    reason: 'Rear disc brake malfunctioning',
    description: 'During my ride to Central Library, the rear brake lever felt loose and failed to engage properly on downhill slope.',
    status: 'pending',
    admin_note: null,
    resolved_by: null,
    created_at: '2026-09-25T11:45:00.000Z',
    updated_at: '2026-09-25T11:45:00.000Z',
  },
  {
    id: 'rep-442b-7711-22cc-990022aa3322',
    reported_by: 'usr-9944-1122-33aa-445566778899',
    reported_user_id: null,
    cycle_id: 'cyc-5544-2211-8899-334455667788',
    booking_id: null,
    reporter_role: 'owner',
    reason: 'Cycle parked outside designated stand',
    description: 'My cycle was returned and left outside Block-8 Trishul stand near the emergency staircase instead of Stand Slot #04.',
    status: 'investigating',
    admin_note: 'Assigned campus guard to inspect location.',
    resolved_by: null,
    created_at: '2026-09-25T09:30:00.000Z',
    updated_at: '2026-09-25T10:15:00.000Z',
  },
  {
    id: 'rep-110c-3399-55ee-667788990011',
    reported_by: 'usr-3322-1144-55bb-667788990011',
    reported_user_id: 'usr-7766-5544-33cc-221100998877',
    cycle_id: 'cyc-1122-3344-5566-778899001122',
    booking_id: 'bk-5544-3322-1100-998877665544',
    reporter_role: 'owner',
    reason: 'Overdue ride return by more than 2 hours',
    description: 'Renter booked for 2 hours and did not initiate return or respond to call. Cycle has been secured back at Mega Tower stand.',
    status: 'resolved',
    admin_note: 'Cycle verified and returned. Fine applied to renter account.',
    resolved_by: 'adm-0001-9988-7766-554433221100',
    created_at: '2026-09-24T16:20:00.000Z',
    updated_at: '2026-09-24T19:00:00.000Z',
  },
];

export default function AdminReportsScreen() {
  const navigation = useNavigation<NavigationProp>();

  const [items, setItems] = useState<CampusReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'investigating'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'Damage' | 'Parking' | 'Payment' | 'Overdue' | 'Other'>('all');
  const [refreshing, setRefreshing] = useState(false);
  const hasLoadedRef = useRef(false);

  const fetchReports = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      console.log('[AdminReportsScreen] Calling GET /api/admin/reports with raw access token...');
      const res = await apiClient.getAdminReports();
      console.log('[AdminReportsScreen] Received GET /api/admin/reports response:', res);
      try {
        console.log('[AdminReportsScreen] Full reports JSON:\n', JSON.stringify(res, null, 2));
      } catch (_) {}

      const rawList =
        res?.data?.rows ||
        res?.data ||
        res?.reports?.rows ||
        res?.reports ||
        res?.reports_data?.rows ||
        res?.reports_data ||
        res?.rows ||
        (Array.isArray(res) ? res : []);

      if (Array.isArray(rawList) && rawList.length > 0) {
        const mapped: CampusReportItem[] = rawList.map((item: any, idx: number) => {
          return {
            id: String(item.id || `rep-${idx}`),
            reported_by: String(item.reported_by || ''),
            reported_user_id: item.reported_user_id ? String(item.reported_user_id) : null,
            cycle_id: item.cycle_id ? String(item.cycle_id) : null,
            booking_id: item.booking_id ? String(item.booking_id) : null,
            reporter_role: String(item.reporter_role || 'student').toLowerCase(),
            reason: item.reason || item.title || 'Campus Incident',
            description: item.description || 'No description provided.',
            status: String(item.status || 'pending').toLowerCase().trim(),
            admin_note: item.admin_note || null,
            resolved_by: item.resolved_by ? String(item.resolved_by) : null,
            created_at: item.created_at || '',
            updated_at: item.updated_at || '',
          };
        });
        setItems(mapped);
      } else if (Array.isArray(rawList) && rawList.length === 0) {
        setItems([]);
      } else {
        // Fallback mock
        setItems(MOCK_REPORTS);
      }
    } catch (err: any) {
      console.warn('[AdminReportsScreen] Error fetching admin reports from GET /api/admin/reports:', err?.message || err);
      setItems((prev) => (prev.length > 0 ? prev : MOCK_REPORTS));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchReports(false);
    }
  }, [fetchReports]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchReports(true);
  };

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleCopyId = (title: string, value: string) => {
    Alert.alert(title, `Reference UUID:\n\n${value}`);
  };

  const filteredItems = items.filter((item) => {
    // Status filter
    if (statusFilter !== 'all') {
      if (statusFilter === 'pending' && item.status !== 'pending') return false;
      if (statusFilter === 'investigating' && item.status !== 'investigating') return false;
      if (statusFilter === 'completed') {
        if (item.status === 'pending' || item.status === 'investigating') return false;
      }
    }

    // Category filter
    if (categoryFilter !== 'all') {
      const cat = getReasonCategory(item.reason).category;
      if (cat !== categoryFilter) return false;
    }

    // Search query
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.reason.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.reporter_role.toLowerCase().includes(q) ||
      item.status.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.cycle_id ? item.cycle_id.toLowerCase().includes(q) : false) ||
      (item.booking_id ? item.booking_id.toLowerCase().includes(q) : false) ||
      (item.admin_note ? item.admin_note.toLowerCase().includes(q) : false)
    );
  });

  const pendingCount = items.filter((i) => i.status === 'pending').length;
  const investigatingCount = items.filter((i) => i.status === 'investigating').length;
  const completedCount = items.filter((i) => i.status !== 'pending' && i.status !== 'investigating').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Screen Header */}
      <Header
        title="Issue Reports"
        showBack={true}
        onBack={() => navigation.goBack()}
        rightComponent={
          <View style={styles.headerBadge}>
            <Ionicons name="warning" size={14} color={colors.danger} />
            <Text style={styles.headerBadgeText}>{filteredItems.length} Reports</Text>
          </View>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.danger]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Search Bar */}
        <View style={styles.searchSection}>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by reason, description, role, ID..."
              placeholderTextColor={colors.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={{ padding: 4 }}>
                <Ionicons name="close-circle" size={16} color={colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Status Filters: All, Pending, Completed, Investigating */}
        <View style={styles.filterSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsRow}>
            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'all' && styles.filterPillActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterPillText, statusFilter === 'all' && styles.filterPillTextActive]}>
                All ({items.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'pending' && styles.filterPillWarningActive]}
              onPress={() => setStatusFilter('pending')}
            >
              <View style={[styles.statusDot, { backgroundColor: colors.warning }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'pending' && styles.filterPillWarningTextActive,
                ]}
              >
                Pending ({pendingCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'investigating' && styles.filterPillBlueActive]}
              onPress={() => setStatusFilter('investigating')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#3B82F6' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'investigating' && styles.filterPillBlueTextActive,
                ]}
              >
                Investigating ({investigatingCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, statusFilter === 'completed' && styles.filterPillGreenActive]}
              onPress={() => setStatusFilter('completed')}
            >
              <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
              <Text
                style={[
                  styles.filterPillText,
                  statusFilter === 'completed' && styles.filterPillGreenTextActive,
                ]}
              >
                Completed ({completedCount})
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Category Pills: All, Damage, Parking, Payment, Overdue, Other */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.filterPillsRow, { marginTop: 6 }]}
          >
            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'all' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('all')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'all' && styles.categoryPillTextActive]}>
                All Issues
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'Damage' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('Damage')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'Damage' && styles.categoryPillTextActive]}>
                🛠️ Damage
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'Parking' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('Parking')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'Parking' && styles.categoryPillTextActive]}>
                📍 Parking
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'Payment' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('Payment')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'Payment' && styles.categoryPillTextActive]}>
                💳 Payment
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'Overdue' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('Overdue')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'Overdue' && styles.categoryPillTextActive]}>
                ⏰ Overdue
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.categoryPill, categoryFilter === 'Other' && styles.categoryPillActive]}
              onPress={() => setCategoryFilter('Other')}
            >
              <Text style={[styles.categoryPillText, categoryFilter === 'Other' && styles.categoryPillTextActive]}>
                ⚠️ Other
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Loading Banner */}
        {loading && items.length > 0 && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.danger} />
            <Text style={styles.loadingBannerText}>Refreshing campus reports...</Text>
          </View>
        )}

        {/* Reports List */}
        <View style={styles.listContainer}>
          {loading && items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <ActivityIndicator size="large" color={colors.danger} />
              <Text style={styles.emptyTitle}>Fetching Issue Reports</Text>
              <Text style={styles.emptySubtitle}>Connecting to campus administration server...</Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.accent} />
              <Text style={styles.emptyTitle}>No Reports Found</Text>
              <Text style={styles.emptySubtitle}>
                No incident reports match your current search or filter selection.
              </Text>
            </View>
          ) : (
            filteredItems.map((item) => {
              const isExpanded = expandedId === item.id;
              const statusCfg = getReportStatusConfig(item.status);
              const catCfg = getReasonCategory(item.reason);
              const isResolved = item.status === 'resolved' || item.status === 'completed';

              return (
                <View key={item.id} style={[styles.stripCard, isExpanded && styles.stripCardExpanded]}>
                  {/* Single Compact Strip Header */}
                  <TouchableOpacity
                    style={styles.stripHeaderRow}
                    onPress={() => handleToggleExpand(item.id)}
                    activeOpacity={0.8}
                  >
                    {/* Category Icon Badge with Status Dot */}
                    <View style={styles.stripIconWrapper}>
                      <View style={[styles.categoryIconCircle, { backgroundColor: catCfg.bgColor }]}>
                        <Ionicons name={catCfg.icon} size={20} color={catCfg.color} />
                      </View>
                      <View style={[styles.statusCornerDot, { backgroundColor: statusCfg.color }]} />
                    </View>

                    {/* Main Info Column */}
                    <View style={styles.stripMainCol}>
                      <View style={styles.stripTitleRow}>
                        <Text style={styles.stripReasonTitle} numberOfLines={1}>
                          {item.reason}
                        </Text>
                        <Badge variant={statusCfg.variant} label={statusCfg.label} size="sm" />
                      </View>

                      {/* Reporter Role & Entity Meta */}
                      <View style={styles.stripMetaRow}>
                        <View style={styles.roleBadge}>
                          <Ionicons name="person-outline" size={10} color={colors.primary} />
                          <Text style={styles.roleBadgeText}>
                            {item.reporter_role ? item.reporter_role.toUpperCase() : 'STUDENT'}
                          </Text>
                        </View>
                        {Boolean(item.cycle_id) && (
                          <Text style={styles.entitySnippet} numberOfLines={1}>
                            Cycle #{item.cycle_id?.slice(0, 6)}
                          </Text>
                        )}
                        {Boolean(item.booking_id) && (
                          <Text style={styles.entitySnippet} numberOfLines={1}>
                            Ride #{item.booking_id?.slice(0, 6)}
                          </Text>
                        )}
                      </View>

                      {/* Description Preview & Date */}
                      <View style={styles.stripBottomRow}>
                        <Text style={styles.stripDescPreview} numberOfLines={1}>
                          {item.description}
                        </Text>
                        <Text style={styles.stripDateText}>
                          {formatReportDate(item.created_at)}
                        </Text>
                      </View>
                    </View>

                    {/* Chevron Indicator */}
                    <View style={styles.stripChevronWrapper}>
                      <Ionicons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={isExpanded ? colors.danger : colors.textLight}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Card View */}
                  {isExpanded && (
                    <View style={styles.stripExpandedBody}>
                      <View style={styles.divider} />

                      {/* Overview Row: Status, Role, Report ID */}
                      <View style={styles.overviewBox}>
                        <View style={styles.overviewItem}>
                          <Text style={styles.overviewLabel}>Report Status</Text>
                          <View style={styles.overviewStatusRow}>
                            <View style={[styles.statusMiniDot, { backgroundColor: statusCfg.color }]} />
                            <Text style={[styles.overviewStatusText, { color: statusCfg.color }]}>
                              {statusCfg.label}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.overviewItem}>
                          <Text style={styles.overviewLabel}>Filed By Role</Text>
                          <Text style={styles.overviewValueText}>
                            {item.reporter_role ? item.reporter_role.toUpperCase() : 'STUDENT'}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.overviewItem}
                          onPress={() => handleCopyId('Report ID', item.id)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.overviewLabel}>Report ID</Text>
                          <View style={styles.idCopyRow}>
                            <Text style={styles.idCopyText}>#{item.id.slice(0, 8)}</Text>
                            <Ionicons name="copy-outline" size={11} color={colors.primary} />
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Full Issue Description */}
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionBlockTitle}>Issue Description</Text>
                        <View style={styles.descriptionBox}>
                          <Text style={styles.descriptionText}>{item.description}</Text>
                        </View>
                      </View>

                      {/* Associated References Grid */}
                      <View style={styles.sectionBlock}>
                        <Text style={styles.sectionBlockTitle}>Associated Reference Entities</Text>
                        <View style={styles.referencesGrid}>
                          {/* Reported By */}
                          <TouchableOpacity
                            style={styles.refCard}
                            onPress={() => handleCopyId('Reporter User ID', item.reported_by)}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="person-circle-outline" size={16} color={colors.primary} />
                            <View style={styles.refDetails}>
                              <Text style={styles.refLabel}>Reported By</Text>
                              <Text style={styles.refValue} numberOfLines={1}>
                                #{item.reported_by.slice(0, 8)}...
                              </Text>
                            </View>
                          </TouchableOpacity>

                          {/* Reported User (if present) */}
                          {Boolean(item.reported_user_id) && (
                            <TouchableOpacity
                              style={styles.refCard}
                              onPress={() => handleCopyId('Reported User ID', item.reported_user_id!)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="warning-outline" size={16} color={colors.danger} />
                              <View style={styles.refDetails}>
                                <Text style={styles.refLabel}>Reported User</Text>
                                <Text style={styles.refValue} numberOfLines={1}>
                                  #{item.reported_user_id!.slice(0, 8)}...
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )}

                          {/* Cycle ID */}
                          {Boolean(item.cycle_id) && (
                            <TouchableOpacity
                              style={styles.refCard}
                              onPress={() => handleCopyId('Cycle ID', item.cycle_id!)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="bicycle-outline" size={16} color={colors.accent} />
                              <View style={styles.refDetails}>
                                <Text style={styles.refLabel}>Cycle ID</Text>
                                <Text style={styles.refValue} numberOfLines={1}>
                                  #{item.cycle_id!.slice(0, 8)}...
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )}

                          {/* Booking ID */}
                          {Boolean(item.booking_id) && (
                            <TouchableOpacity
                              style={styles.refCard}
                              onPress={() => handleCopyId('Booking ID', item.booking_id!)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="receipt-outline" size={16} color={colors.info} />
                              <View style={styles.refDetails}>
                                <Text style={styles.refLabel}>Booking Ref</Text>
                                <Text style={styles.refValue} numberOfLines={1}>
                                  #{item.booking_id!.slice(0, 8)}...
                                </Text>
                              </View>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>

                      {/* Admin Note Section */}
                      {Boolean(item.admin_note) && (
                        <View style={styles.adminNoteSection}>
                          <View style={styles.adminNoteHeader}>
                            <Ionicons name="shield-checkmark-outline" size={14} color={colors.primary} />
                            <Text style={styles.adminNoteTitle}>Admin Resolution Note</Text>
                          </View>
                          <Text style={styles.adminNoteContent}>{item.admin_note}</Text>
                          {Boolean(item.resolved_by) && (
                            <Text style={styles.resolvedByText}>
                              Resolved by Admin: #{item.resolved_by?.slice(0, 8)}
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Timestamps Row */}
                      <View style={styles.timestampsRow}>
                        <Text style={styles.timestampText}>
                          Filed: {formatReportDateTime(item.created_at)}
                        </Text>
                        <Text style={styles.timestampText}>
                          Updated: {formatReportDateTime(item.updated_at)}
                        </Text>
                      </View>

                      {/* Quick Actions Footer */}
                      <View style={styles.cardActionsRow}>
                        <TouchableOpacity
                          style={styles.fullIdBtn}
                          onPress={() => handleCopyId('Full Report Reference UUID', item.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons name="copy-outline" size={13} color={colors.primary} />
                          <Text style={styles.fullIdBtnText}>Copy Report UUID</Text>
                        </TouchableOpacity>

                        {!isResolved && (
                          <TouchableOpacity
                            style={styles.resolveActionBtn}
                            onPress={() => {
                              Alert.alert(
                                'Report Resolution',
                                `Would you like to resolve issue: "${item.reason}"?`,
                                [
                                  { text: 'Cancel', style: 'cancel' },
                                  {
                                    text: 'Mark Resolved',
                                    onPress: () => {
                                      setItems((prev) =>
                                        prev.map((r) =>
                                          r.id === item.id ? { ...r, status: 'resolved' } : r
                                        )
                                      );
                                      Alert.alert('Status Updated', 'Report marked as resolved.');
                                    },
                                  },
                                ]
                              );
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="checkmark-done" size={14} color={colors.white} />
                            <Text style={styles.resolveActionBtnText}>Resolve</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.danger,
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  /* Search */
  searchSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: colors.textPrimary,
    padding: 0,
  },

  /* Filters */
  filterSection: {
    marginTop: spacing.sm,
  },
  filterPillsRow: {
    paddingHorizontal: spacing.md,
    gap: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  filterPillActive: {
    backgroundColor: colors.danger,
    borderColor: colors.danger,
  },
  filterPillWarningActive: {
    backgroundColor: colors.warning,
    borderColor: colors.warning,
  },
  filterPillBlueActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterPillGreenActive: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  filterPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillWarningTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillBlueTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  filterPillGreenTextActive: {
    color: colors.white,
    fontWeight: '700',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  categoryPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
    backgroundColor: '#EDF2F7',
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
  },
  categoryPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  categoryPillTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  /* Loading Banner */
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    marginTop: spacing.xs,
  },
  loadingBannerText: {
    fontSize: 12,
    color: colors.textSecondary,
  },

  /* List */
  listContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: 10,
  },

  /* Strip Card */
  stripCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
    overflow: 'hidden',
  },
  stripCardExpanded: {
    borderColor: '#FCA5A5',
    backgroundColor: colors.white,
    ...shadows.md,
  },
  stripHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md - 2,
  },
  stripIconWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  categoryIconCircle: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusCornerDot: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.white,
  },
  stripMainCol: {
    flex: 1,
  },
  stripTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  stripReasonTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  stripMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  roleBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.primary,
  },
  entitySnippet: {
    fontSize: 10,
    color: colors.textLight,
  },
  stripBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 3,
  },
  stripDescPreview: {
    fontSize: 11,
    color: colors.textSecondary,
    flex: 1,
    marginRight: 8,
  },
  stripDateText: {
    fontSize: 10,
    color: colors.textLight,
  },
  stripChevronWrapper: {
    paddingLeft: 6,
  },

  /* Expanded */
  stripExpandedBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginBottom: spacing.sm + 2,
  },
  overviewBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    justifyContent: 'space-around',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  overviewItem: {
    alignItems: 'center',
  },
  overviewLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 2,
  },
  overviewStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusMiniDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  overviewStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  overviewValueText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  idCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  idCopyText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },

  /* Section Block */
  sectionBlock: {
    marginTop: spacing.sm + 2,
  },
  sectionBlockTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  descriptionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  descriptionText: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 18,
  },

  /* References Grid */
  referencesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  refCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.md,
    padding: 6,
    borderWidth: 1,
    borderColor: colors.borderLight,
    gap: 6,
    minWidth: '47%',
    flex: 1,
  },
  refDetails: {
    flex: 1,
  },
  refLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  refValue: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textPrimary,
  },

  /* Admin Note */
  adminNoteSection: {
    backgroundColor: '#EFF6FF',
    borderRadius: borderRadius.md,
    padding: 10,
    marginTop: spacing.sm + 2,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  adminNoteHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  adminNoteTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.primary,
  },
  adminNoteContent: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 17,
  },
  resolvedByText: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 4,
  },

  /* Timestamps */
  timestampsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: spacing.sm,
    paddingTop: 6,
  },
  timestampText: {
    fontSize: 9,
    color: colors.textLight,
  },

  /* Actions */
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  fullIdBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  fullIdBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },
  resolveActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
  },
  resolveActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.white,
  },

  /* Empty State */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
    marginTop: 4,
  },
});
