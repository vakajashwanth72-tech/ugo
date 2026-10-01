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
  Image,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { Cycle } from '../../types';
import Header from '../../components/ui/Header';
import Badge from '../../components/ui/Badge';
import NotificationBell from '../../components/NotificationBell';
import { useNotifications } from '../../hooks/useNotifications';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { apiClient } from '../../lib/apiClient';
import { getCycleImageUrl } from '../../lib/cycleUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

// Helper to safely parse count from raw number, string, array, or node-pg QueryResult
function parseCount(val: any): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val === 'string') {
    const num = parseInt(val, 10);
    return isNaN(num) ? 0 : num;
  }
  if (Array.isArray(val) && val.length > 0) {
    const first = val[0];
    if (typeof first === 'object' && first !== null) {
      return parseCount(Object.values(first)[0]);
    }
    return parseCount(first);
  }
  if (typeof val === 'object' && val !== null) {
    if (val.rows && Array.isArray(val.rows)) {
      return parseCount(val.rows);
    }
    const vals = Object.values(val);
    if (vals.length > 0) {
      return parseCount(vals[0]);
    }
  }
  return 0;
}

// Report interface matching PostgreSQL public.reports schema
export interface AdminReport {
  id: string;
  title: string;
  type: 'Damage' | 'Parking' | 'Overdue' | 'Payment';
  priority: 'urgent' | 'medium' | 'low';
  cycle_id?: string;
  cycle_name: string;
  reporter_name: string;
  reporter_role?: string;
  reporter_hostel: string;
  location: string;
  description: string;
  created_at: string;
  status: 'pending' | 'resolved' | string;
  admin_note?: string;
  booking_id?: string;
}

// Initial mock data ready to be connected with backend later
const INITIAL_PENDING_CYCLES: (Cycle & { owner_name?: string; phone?: string; email?: string; description?: string })[] = [
  {
    id: 'b3056f6f-496c-4bdf-a64b-a3b4617c58a2',
    brand: 'B-Twin',
    model: 'Riverside 120',
    cycle_type: 'gear',
    location: 'Central Library Stand',
    price_per_hour: 4,
    price_per_day: 35,
    is_verified: false,
    owner_id: 'user-001',
    owner_name: 'Jaswanth V.',
    phone: '+91 97412 34567',
    email: 'vakareddyjaswanth.251cs164@nitk.edu.in',
    hostel: 'Mega Tower Block-A',
    description: '7-speed hybrid cycle with Shimano shifters, comfortable saddle, and front suspension.',
    created_at: new Date().toISOString(),
  } as any,
  {
    id: 'af4850ef-8ed7-49c9-a1a8-613eebe35ba0',
    brand: 'Hero',
    model: 'Sprint Pro',
    cycle_type: 'non-gear',
    location: 'Block-4 Satpura',
    price_per_hour: 3,
    price_per_day: 25,
    is_verified: false,
    owner_id: 'user-002',
    owner_name: 'Rahul Sharma',
    phone: '+91 98451 23456',
    email: 'rahul.sharma@nitk.edu.in',
    hostel: 'Block-4 Satpura',
    description: 'Single-speed campus commuter with dual disc brakes, ideal for quick campus trips.',
    created_at: new Date().toISOString(),
  } as any,
  {
    id: '80d3efc5-1c72-4ffc-a4af-7aa05cb21216',
    brand: 'Btwin',
    model: 'Rockrider 340',
    cycle_type: 'gear',
    location: 'Aravali Hostel Stand',
    price_per_hour: 5,
    price_per_day: 45,
    is_verified: false,
    owner_id: 'user-003',
    owner_name: 'Ananya Rao',
    phone: '+91 99003 45678',
    email: 'ananya.rao@nitk.edu.in',
    hostel: 'Aravali Hostel',
    description: '21-speed mountain bike with front suspension, recently serviced brakes and gears.',
    created_at: new Date().toISOString(),
  } as any,
];

const INITIAL_REPORTS: AdminReport[] = [
  {
    id: 'rep-1',
    title: 'Rear Chain Detached & Bent Mudguard',
    type: 'Damage',
    priority: 'urgent',
    cycle_name: 'B-Twin Riverside 120 (CYC-881)',
    reporter_name: 'Siddharth M.',
    reporter_hostel: 'Mega Tower',
    location: 'Near CCC Stand B',
    description: 'Chain slipped off the sprocket and is jammed against the frame. Cycle is immobilized.',
    created_at: '10m ago',
    status: 'pending',
  },
  {
    id: 'rep-2',
    title: 'Improper Parking Outside Gate',
    type: 'Parking',
    priority: 'medium',
    cycle_name: 'Hero Sprint Pro (CYC-304)',
    reporter_name: 'Campus Security',
    reporter_hostel: 'Main Gate',
    location: 'Main Gate Pedestrian Walkway',
    description: 'Cycle left unlocked blocking pedestrian path outside NITK main entrance.',
    created_at: '45m ago',
    status: 'pending',
  },
  {
    id: 'rep-3',
    title: 'Overdue Rental Not Returned',
    type: 'Overdue',
    priority: 'urgent',
    cycle_name: 'Hercules Roadeo (CYC-109)',
    reporter_name: 'System Alert',
    reporter_hostel: 'Automated',
    location: 'Last seen: Health Center',
    description: 'Rental exceeded maximum duration by 4 hours. Automated reminder sent to student.',
    created_at: '2h ago',
    status: 'pending',
  },
  {
    id: 'rep-4',
    title: 'Flat Front Tire',
    type: 'Damage',
    priority: 'low',
    cycle_name: 'Avon Ranger (CYC-512)',
    reporter_name: 'Kiran Patel',
    reporter_hostel: 'Satpura Block-3',
    location: 'Satpura Stand',
    description: 'Front tire has low pressure and requires air pump inspection.',
    created_at: 'Yesterday',
    status: 'resolved',
  },
];

const MOCK_ANALYSIS_DATA = {
  totalRides: 1420,
  activeRides: 4,
  totalCycles: 22,
  fleetUtilization: '82%',
  revenueMonth: '₹28,450',
  avgDuration: '34 min',
  weeklyRides: [
    { day: 'Mon', count: 184, height: 55 },
    { day: 'Tue', count: 210, height: 68 },
    { day: 'Wed', count: 245, height: 80 },
    { day: 'Thu', count: 260, height: 85 },
    { day: 'Fri', count: 295, height: 100 },
    { day: 'Sat', count: 140, height: 45 },
    { day: 'Sun', count: 86, height: 30 },
  ],
  peakHours: [
    { label: 'Morning Rush (8:00 - 10:00 AM)', pct: '38%', desc: 'Hostels to Academic Departments' },
    { label: 'Evening Peak (5:00 - 8:30 PM)', pct: '44%', desc: 'Central Library & Sports Ground to Hostels' },
    { label: 'Afternoon Lull (11:00 AM - 4:00 PM)', pct: '18%', desc: 'Inter-department short trips' },
  ],
  topStations: [
    { name: 'Mega Hostel Tower Stand', rides: 420, available: 6 },
    { name: 'Satpura Hostel Hub', rides: 365, available: 4 },
    { name: 'Central Library Stand', rides: 288, available: 5 },
    { name: 'Main Gate & Guest House', rides: 212, available: 3 },
  ],
  fleetHealth: { excellent: 15, good: 5, maintenance: 2 },
};

const MOCK_REVIEWS_DATA = {
  averageRating: 4.7,
  totalReviews: 148,
  starDistribution: [
    { stars: 5, pct: '72%', count: 106 },
    { stars: 4, pct: '18%', count: 27 },
    { stars: 3, pct: '6%', count: 9 },
    { stars: 2, pct: '3%', count: 4 },
    { stars: 1, pct: '1%', count: 2 },
  ],
  categoryScores: [
    { label: 'Riding Comfort', score: '4.8', icon: 'bicycle-outline' },
    { label: 'Brakes & Safety', score: '4.6', icon: 'shield-checkmark-outline' },
    { label: 'Value for Money', score: '4.9', icon: 'pricetag-outline' },
    { label: 'App Experience', score: '4.7', icon: 'phone-portrait-outline' },
  ],
  recentReviews: [
    {
      id: 'rev-1',
      student: 'Arun Kumar',
      hostel: 'Satpura Block-4',
      rating: 5,
      cycle: 'Btwin Riverside 120',
      time: '2h ago',
      comment: 'Super smooth ride to Chemical Engg dept! Gears shift cleanly and seat height was very comfortable.',
      tag: 'Smooth Ride',
    },
    {
      id: 'rev-2',
      student: 'Divya Sharma',
      hostel: 'Aravali Hostel',
      rating: 4,
      cycle: 'Hero Sprint Pro',
      time: '5h ago',
      comment: 'Cycle was clean and tire pressure was optimal. Bell was slightly loose but overall great ride.',
      tag: 'Clean Bike',
    },
    {
      id: 'rev-3',
      student: 'Mohit Rao',
      hostel: 'Mega Tower',
      rating: 3,
      cycle: 'Hercules Roadeo',
      time: '1d ago',
      comment: 'Rear brakes needed a bit more grip. Recommend tightening the brake cable during next stand inspection.',
      tag: 'Brake Check',
    },
    {
      id: 'rev-4',
      student: 'Pooja Hegde',
      hostel: 'PG Block',
      rating: 5,
      cycle: 'Btwin Riverside 120',
      time: '2d ago',
      comment: 'Loved the hassle-free checkout! Very reliable cycle for commuting across campus between lectures.',
      tag: 'Excellent',
    },
  ],
};

export default function AdminDashboardScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { notifications } = useNotifications();
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  // View state: 'dashboard' (first page), 'analysis', or 'reviews'
  const [currentView, setCurrentView] = useState<'dashboard' | 'analysis' | 'reviews'>('dashboard');

  // Sub-tabs on first page: 'all' | 'pending' | 'reports'
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'reports'>('all');

  // Counts from backend GET /api/admin/dashboard
  const [totalCycles, setTotalCycles] = useState(0);
  const [activeRides, setActiveRides] = useState(0);
  const [totalUsers, setTotalUsers] = useState(0);
  const [totalCycleVerifications, setTotalCycleVerifications] = useState(0);
  const [totalReports, setTotalReports] = useState(0);
  const [loadingDashboard, setLoadingDashboard] = useState(true);

  // Local state for cycles and reports
  const [pendingCycles, setPendingCycles] = useState<(Cycle & { owner_name?: string })[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved'>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | '5star' | 'attention'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const pendingReportsCount = reports.filter((r) => r.status === 'pending').length;

  // Track initial load so endpoint is called only once when opened for the first time
  const hasLoadedRef = useRef(false);

  const fetchDashboardData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoadingDashboard(true);
    try {
      console.log('[AdminDashboardScreen] Calling GET /api/admin/dashboard...');
      const res = await apiClient.getAdminDashboardData();
      console.log('[AdminDashboardScreen] Received GET /api/admin/dashboard data:', res);
      try {
        console.log('[AdminDashboardScreen] Full dashboard response JSON:\n', JSON.stringify(res, null, 2));
      } catch (_) {}

      if (res) {
        // 1. Parse Counts from res.counts, res.data?.counts, or res directly
        const countsObj = res.counts || res.data?.counts || res.data || res;
        console.log('[AdminDashboardScreen] Extracted countsObj:', countsObj);

        const hasCyclesKey = countsObj.cycles_count !== undefined || countsObj.total_cycles_count !== undefined || res.cycles_count !== undefined;
        const hasRidesKey = countsObj.bookings_count !== undefined || countsObj.total_active_rides_count !== undefined || res.bookings_count !== undefined;
        const hasUsersKey = countsObj.profiles_count !== undefined || countsObj.profile_count !== undefined || countsObj.total_users_count !== undefined || res.profiles_count !== undefined;
        const hasVerifKey = countsObj.cycle_verifications_count !== undefined || countsObj.active_bookings_count !== undefined || countsObj.total_cycle_verifications_count !== undefined || res.cycle_verifications_count !== undefined;
        const hasReportsKey = countsObj.reports_count !== undefined || countsObj.total_reports_count !== undefined || res.reports_count !== undefined;

        const cyclesCount = parseCount(
          countsObj.cycles_count ?? countsObj.total_cycles_count ?? res.cycles_count ?? res.total_cycles_count
        );
        const ridesCount = parseCount(
          countsObj.bookings_count ?? countsObj.total_active_rides_count ?? res.bookings_count ?? res.total_active_rides_count
        );
        const usersCount = parseCount(
          countsObj.profiles_count ?? countsObj.profile_count ?? countsObj.total_users_count ?? res.profiles_count ?? res.profile_count ?? res.total_users_count
        );
        const verifCount = parseCount(
          countsObj.cycle_verifications_count ?? countsObj.active_bookings_count ?? countsObj.total_cycle_verifications_count ?? res.cycle_verifications_count ?? res.active_bookings_count ?? res.total_cycle_verifications_count
        );
        const repCount = parseCount(
          countsObj.reports_count ?? countsObj.total_reports_count ?? res.reports_count ?? res.total_reports_count
        );

        console.log('[AdminDashboardScreen] Parsed counts:', {
          cyclesCount,
          ridesCount,
          usersCount,
          verifCount,
          repCount,
          hasCyclesKey,
          hasRidesKey,
          hasUsersKey,
          hasVerifKey,
          hasReportsKey,
        });

        if (hasCyclesKey || cyclesCount > 0) setTotalCycles(cyclesCount);
        if (hasRidesKey || ridesCount > 0) setActiveRides(ridesCount);
        if (hasUsersKey || usersCount > 0) setTotalUsers(usersCount);
        if (hasVerifKey || verifCount > 0) setTotalCycleVerifications(verifCount);
        if (hasReportsKey || repCount > 0) setTotalReports(repCount);

        // 2. Parse Cycle Verification Data
        const rawVerifications =
          res.cycle_verification_data?.rows ||
          res.cycle_verification_data ||
          res.cycles_to_verify ||
          [];

        if (Array.isArray(rawVerifications) && rawVerifications.length > 0) {
          const mappedCycles = rawVerifications.map((item: any, idx: number) => {
            let images: string[] = [];
            let rawImgs = item.images || item.coalesce || item.json_agg || item.cycle_images || item.image_urls;
            if (!rawImgs) {
              // Check any field that might hold the JSON image array
              for (const k of Object.keys(item)) {
                if (Array.isArray(item[k]) && item[k].length > 0 && (item[k][0]?.image_url || typeof item[k][0] === 'string')) {
                  rawImgs = item[k];
                  break;
                }
              }
            }
            if (typeof rawImgs === 'string' && rawImgs.trim().startsWith('[')) {
              try {
                rawImgs = JSON.parse(rawImgs);
              } catch (_) {}
            }
            if (Array.isArray(rawImgs)) {
              images = rawImgs
                .map((img: any) => {
                  if (!img) return null;
                  if (typeof img === 'string') return getCycleImageUrl(img);
                  return getCycleImageUrl(img.image_url || img.imageUrl || img.url || img.storage_path);
                })
                .filter(Boolean) as string[];
            } else if (item.image_url || item.image) {
              images = [getCycleImageUrl(item.image_url || item.image)];
            }

            const cId = String(item.id || item.cycle_id || `cv-${idx}`);

            return {
              id: cId,
              brand: item.brand || 'Campus Cycle',
              model: item.model || '',
              cycle_type: item.cycle_type || 'gear',
              condition: item.condition || 'Good',
              location: item.location || 'NITK Campus Stand',
              price_per_hour: Number(item.price_per_hour) || 0,
              price_per_day: Number(item.price_per_day) || 0,
              is_verified: item.status === 'approved' || item.status === 'verified',
              owner_id: item.owner_id || '',
              owner_name: item.owner_name || 'Student Owner',
              phone: item.phone || '',
              email: item.email || '',
              description: item.description || '',
              rating: item.rating ? Number(item.rating) : 0,
              images,
              image: images[0] || undefined,
              status: item.status || 'pending',
              created_at: item.updated_at || item.created_at || new Date().toISOString(),
            } as any;
          });
          setPendingCycles(mappedCycles);
          if (!hasVerifKey && !verifCount) setTotalCycleVerifications(mappedCycles.length);
        } else if (Array.isArray(rawVerifications) && rawVerifications.length === 0 && res.cycle_verification_data) {
          setPendingCycles([]);
          if (!hasVerifKey) setTotalCycleVerifications(0);
        }

        // 3. Parse Reports Data
        const rawReports =
          res.reports_data?.rows ||
          res.reports_data ||
          res.reports ||
          [];

        if (Array.isArray(rawReports) && rawReports.length > 0) {
          const mappedReports: AdminReport[] = rawReports.map((r: any, idx: number) => {
            const reasonText = r.reason || r.title || 'Campus Report';
            const roleText = r.reporter_role ? ` (${r.reporter_role})` : '';
            const reporterDisplay = r.reporter_name || (r.reported_by ? `User #${String(r.reported_by).slice(0, 6)}${roleText}` : `Student${roleText}`);
            const cycleDisplay = r.cycle_name || (r.cycle_id ? `Cycle #${String(r.cycle_id).slice(0, 8)}` : 'Campus Cycle');

            let reportType: 'Damage' | 'Parking' | 'Overdue' | 'Payment' = 'Damage';
            const lowerReason = reasonText.toLowerCase();
            if (lowerReason.includes('park')) reportType = 'Parking';
            else if (lowerReason.includes('overdue') || lowerReason.includes('delay') || lowerReason.includes('return')) reportType = 'Overdue';
            else if (lowerReason.includes('pay') || lowerReason.includes('money') || lowerReason.includes('fee')) reportType = 'Payment';

            return {
              id: String(r.id || `rep-${idx}`),
              title: reasonText,
              type: reportType,
              priority: (r.priority as any) || (reportType === 'Damage' ? 'urgent' : 'medium'),
              cycle_name: cycleDisplay,
              cycle_id: r.cycle_id ? String(r.cycle_id) : undefined,
              reporter_name: reporterDisplay,
              reporter_role: r.reporter_role || undefined,
              reporter_hostel: r.reporter_hostel || 'NITK Campus',
              location: r.location || 'Campus Stand',
              description: r.description || 'No additional issue description provided.',
              created_at: r.created_at ? new Date(r.created_at).toLocaleString() : 'Recently',
              status: r.status === 'resolved' ? 'resolved' : 'pending',
              admin_note: r.admin_note || undefined,
              booking_id: r.booking_id ? String(r.booking_id) : undefined,
            };
          });
          setReports(mappedReports);
          if (!hasReportsKey && !repCount) setTotalReports(mappedReports.length);
        } else if (Array.isArray(rawReports) && rawReports.length === 0 && res.reports_data) {
          setReports([]);
          if (!hasReportsKey) setTotalReports(0);
        }
      }
    } catch (err: any) {
      console.warn('[AdminDashboardScreen] Error fetching dashboard data from GET /api/admin/dashboard:', err?.message || err);
    } finally {
      setLoadingDashboard(false);
      setRefreshing(false);
    }
  }, []);

  // Fetch once upon screen open
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      fetchDashboardData(false);
    }
  }, [fetchDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboardData(true);
  };

  const handleResolveReport = (reportId: string) => {
    setReports((prev) =>
      prev.map((r) => {
        if (r.id === reportId) {
          const newStatus = r.status === 'pending' ? 'resolved' : 'pending';
          Alert.alert(
            newStatus === 'resolved' ? 'Report Resolved ✅' : 'Report Reopened',
            `Report #${reportId} has been marked as ${newStatus}.`
          );
          return { ...r, status: newStatus };
        }
        return r;
      })
    );
  };

  const handleInvestigateReport = (report: AdminReport) => {
    Alert.alert(
      report.title,
      `Cycle: ${report.cycle_name}\nLocation: ${report.location}\nReporter: ${report.reporter_name} (${report.reporter_hostel})\n\nIssue Details:\n${report.description}`,
      [
        { text: 'Close', style: 'cancel' },
        {
          text: report.status === 'pending' ? 'Mark Resolved' : 'Mark Pending',
          onPress: () => handleResolveReport(report.id),
        },
      ]
    );
  };

  const handleCyclePress = (cycle: Cycle) => {
    navigation.navigate('CycleVerification', { cycleId: cycle.id, cycle });
  };

  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'pending' && r.status !== 'pending') return false;
    if (reportFilter === 'resolved' && r.status !== 'resolved') return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.title.toLowerCase().includes(q) ||
      r.cycle_name.toLowerCase().includes(q) ||
      r.location.toLowerCase().includes(q) ||
      r.reporter_name.toLowerCase().includes(q)
    );
  });

  const filteredCycles = pendingCycles.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.brand.toLowerCase().includes(q) ||
      c.model.toLowerCase().includes(q) ||
      (c.location && c.location.toLowerCase().includes(q))
    );
  });

  const filteredReviews = MOCK_REVIEWS_DATA.recentReviews.filter((rev) => {
    if (reviewFilter === '5star') return rev.rating === 5;
    if (reviewFilter === 'attention') return rev.rating <= 3;
    return true;
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />

      {/* Main Header */}
      <Header
        title="Admin Portal"
        showBack={true}
        onBack={() => {
          if (currentView !== 'dashboard') {
            setCurrentView('dashboard');
          } else if (navigation.canGoBack()) {
            navigation.goBack();
          } else {
            navigation.navigate('Home');
          }
        }}
        rightComponent={
          <View style={styles.headerRightGroup}>
            <NotificationBell
              unreadCount={unreadCount}
              onPress={() => navigation.navigate('Notifications')}
            />
            {/* Student View Button: Navigates to regular user dashboard */}
            <TouchableOpacity
              style={styles.studentViewBtn}
              onPress={() => navigation.navigate('Home')}
              activeOpacity={0.8}
            >
              <Ionicons name="bicycle" size={16} color={colors.white} />
              <Text style={styles.studentViewText}>Student View</Text>
            </TouchableOpacity>
          </View>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Action Navigation Grid: Cycle Verifications, Reports, Analysis & Reviews */}
        <View style={styles.actionGrid}>
          {/* Row 1: Operational Queues (Cycle Verifications & Reports) */}
          <View style={styles.actionRow}>
            {/* Cycle Verifications Button */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('AdminCycleVerifications')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.actionIconCircle,
                  { backgroundColor: '#EFF6FF' },
                ]}
              >
                <Ionicons
                  name="shield-checkmark"
                  size={18}
                  color={colors.primary}
                />
              </View>
              <View style={styles.actionBtnTextCol}>
                <View style={styles.actionBtnTitleRow}>
                  <Text style={styles.actionBtnTitle} numberOfLines={1}>
                    Cycle Verifications
                  </Text>
                  {(totalCycleVerifications > 0 || pendingCycles.length > 0) && (
                    <View style={styles.actionBadgePill}>
                      <Text style={styles.actionBadgeText}>
                        {totalCycleVerifications || pendingCycles.length}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.actionBtnSub} numberOfLines={1}>
                  {totalCycleVerifications || pendingCycles.length} assigned records
                </Text>
              </View>
            </TouchableOpacity>

            {/* Reports Button */}
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('AdminReports')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.actionIconCircle,
                  { backgroundColor: '#FEF2F2' },
                ]}
              >
                <Ionicons
                  name="alert-circle"
                  size={18}
                  color={colors.danger}
                />
              </View>
              <View style={styles.actionBtnTextCol}>
                <View style={styles.actionBtnTitleRow}>
                  <Text style={styles.actionBtnTitle} numberOfLines={1}>
                    Reports
                  </Text>
                  {(totalReports > 0 || pendingReportsCount > 0) && (
                    <View style={[styles.actionBadgePill, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.actionBadgeText, { color: colors.danger }]}>
                        {totalReports || pendingReportsCount}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.actionBtnSub} numberOfLines={1}>
                  {totalReports || pendingReportsCount} issue tickets
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Row 2: Insights (Analysis & Reviews) */}
          <View style={styles.actionRow}>
            {/* Analysis Button */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                currentView === 'analysis' && styles.actionBtnActive,
              ]}
              onPress={() => setCurrentView(currentView === 'analysis' ? 'dashboard' : 'analysis')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.actionIconCircle,
                  { backgroundColor: currentView === 'analysis' ? colors.primary : '#E0F2FE' },
                ]}
              >
                <Ionicons
                  name="bar-chart"
                  size={18}
                  color={currentView === 'analysis' ? colors.white : colors.info}
                />
              </View>
              <View style={styles.actionBtnTextCol}>
                <Text
                  style={[
                    styles.actionBtnTitle,
                    currentView === 'analysis' && styles.actionBtnTitleActive,
                  ]}
                  numberOfLines={1}
                >
                  Analysis
                </Text>
                <Text style={styles.actionBtnSub} numberOfLines={1}>
                  Rides & utilization
                </Text>
              </View>
              <Ionicons
                name={currentView === 'analysis' ? 'chevron-up' : 'chevron-forward'}
                size={14}
                color={currentView === 'analysis' ? colors.primary : colors.textLight}
              />
            </TouchableOpacity>

            {/* Reviews Button */}
            <TouchableOpacity
              style={[
                styles.actionBtn,
                currentView === 'reviews' && styles.actionBtnActiveReviews,
              ]}
              onPress={() => setCurrentView(currentView === 'reviews' ? 'dashboard' : 'reviews')}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.actionIconCircle,
                  { backgroundColor: currentView === 'reviews' ? colors.accent : '#DCFCE7' },
                ]}
              >
                <Ionicons
                  name="star"
                  size={18}
                  color={currentView === 'reviews' ? colors.white : colors.accent}
                />
              </View>
              <View style={styles.actionBtnTextCol}>
                <Text
                  style={[
                    styles.actionBtnTitle,
                    currentView === 'reviews' && styles.actionBtnTitleActiveAccent,
                  ]}
                  numberOfLines={1}
                >
                  Reviews
                </Text>
                <Text style={styles.actionBtnSub} numberOfLines={1}>
                  Ratings & feedback
                </Text>
              </View>
              <Ionicons
                name={currentView === 'reviews' ? 'chevron-up' : 'chevron-forward'}
                size={14}
                color={currentView === 'reviews' ? colors.accent : colors.textLight}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Subtle Loading indicator during initial fetch */}
        {loadingDashboard && !refreshing && (
          <View style={styles.loadingBanner}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingBannerText}>Updating campus dashboard...</Text>
          </View>
        )}

        {/* ---------------- VIEW 1: ANALYSIS VIEW ---------------- */}
        {currentView === 'analysis' && (
          <View style={styles.viewContainer}>
            <View style={styles.viewHeader}>
              <View>
                <Text style={styles.viewTitle}>Campus Operations Analysis</Text>
                <Text style={styles.viewSubtitle}>
                  Real-time analytics across NITK cycle fleet
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeViewBtn}
                onPress={() => setCurrentView('dashboard')}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Analysis KPI Cards */}
            <View style={styles.analyticsGrid}>
              <View style={styles.analyticsCard}>
                <View style={styles.analyticsCardHeader}>
                  <Text style={styles.analyticsCardLabel}>Total Rides</Text>
                  <Ionicons name="bicycle" size={16} color={colors.primary} />
                </View>
                <Text style={styles.analyticsCardValue}>{MOCK_ANALYSIS_DATA.totalRides}</Text>
                <Text style={styles.analyticsGrowth}>↗ +14% vs last week</Text>
              </View>

              <View style={styles.analyticsCard}>
                <View style={styles.analyticsCardHeader}>
                  <Text style={styles.analyticsCardLabel}>Utilization</Text>
                  <Ionicons name="speedometer-outline" size={16} color={colors.accent} />
                </View>
                <Text style={styles.analyticsCardValue}>{MOCK_ANALYSIS_DATA.fleetUtilization}</Text>
                <Text style={styles.analyticsSub}>Peak: 94% at 5:30 PM</Text>
              </View>

              <View style={styles.analyticsCard}>
                <View style={styles.analyticsCardHeader}>
                  <Text style={styles.analyticsCardLabel}>Revenue</Text>
                  <Ionicons name="cash-outline" size={16} color={colors.warning} />
                </View>
                <Text style={styles.analyticsCardValue}>{MOCK_ANALYSIS_DATA.revenueMonth}</Text>
                <Text style={styles.analyticsSub}>Month-to-date</Text>
              </View>

              <View style={styles.analyticsCard}>
                <View style={styles.analyticsCardHeader}>
                  <Text style={styles.analyticsCardLabel}>Avg Duration</Text>
                  <Ionicons name="time-outline" size={16} color={colors.info} />
                </View>
                <Text style={styles.analyticsCardValue}>{MOCK_ANALYSIS_DATA.avgDuration}</Text>
                <Text style={styles.analyticsSub}>Per rental trip</Text>
              </View>
            </View>

            {/* Weekly Ride Distribution Bar Chart */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionBoxTitle}>Weekly Ride Volume</Text>
              <Text style={styles.sectionBoxSub}>Trips completed across the last 7 days</Text>
              <View style={styles.chartContainer}>
                {MOCK_ANALYSIS_DATA.weeklyRides.map((item, index) => (
                  <View key={index} style={styles.chartColumn}>
                    <Text style={styles.chartBarValue}>{item.count}</Text>
                    <View style={styles.chartBarWrapper}>
                      <View
                        style={[
                          styles.chartBar,
                          { height: `${item.height}%` },
                          item.day === 'Fri' && styles.chartBarPeak,
                        ]}
                      />
                    </View>
                    <Text style={[styles.chartDay, item.day === 'Fri' && styles.chartDayPeak]}>
                      {item.day}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Peak Hours Breakdown */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionBoxTitle}>Peak Campus Rental Hours</Text>
              <View style={styles.peakHoursList}>
                {MOCK_ANALYSIS_DATA.peakHours.map((item, idx) => (
                  <View key={idx} style={styles.peakHourItem}>
                    <View style={styles.peakHourTop}>
                      <Text style={styles.peakHourLabel}>{item.label}</Text>
                      <Text style={styles.peakHourPct}>{item.pct}</Text>
                    </View>
                    <Text style={styles.peakHourDesc}>{item.desc}</Text>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: item.pct as any }]} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Top Stations */}
            <View style={styles.sectionBox}>
              <Text style={styles.sectionBoxTitle}>Busiest Cycle Stands</Text>
              {MOCK_ANALYSIS_DATA.topStations.map((st, i) => (
                <View key={i} style={styles.stationRow}>
                  <View style={styles.stationRank}>
                    <Text style={styles.stationRankText}>#{i + 1}</Text>
                  </View>
                  <View style={styles.stationInfo}>
                    <Text style={styles.stationName}>{st.name}</Text>
                    <Text style={styles.stationSub}>
                      {st.rides} rides • {st.available} cycles ready
                    </Text>
                  </View>
                  <Badge variant="primary" label={`${st.rides} rides`} size="sm" />
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------- VIEW 2: REVIEWS VIEW ---------------- */}
        {currentView === 'reviews' && (
          <View style={styles.viewContainer}>
            <View style={styles.viewHeader}>
              <View>
                <Text style={styles.viewTitle}>Cycle & Service Reviews</Text>
                <Text style={styles.viewSubtitle}>
                  Feedback submitted by campus riders
                </Text>
              </View>
              <TouchableOpacity
                style={styles.closeViewBtn}
                onPress={() => setCurrentView('dashboard')}
              >
                <Ionicons name="close" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            {/* Rating Summary Card */}
            <View style={styles.ratingSummaryCard}>
              <View style={styles.ratingBigCol}>
                <Text style={styles.ratingBigScore}>{MOCK_REVIEWS_DATA.averageRating}</Text>
                <View style={styles.starsRow}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Ionicons key={s} name="star" size={16} color="#F59E0B" />
                  ))}
                </View>
                <Text style={styles.ratingTotalText}>
                  Based on {MOCK_REVIEWS_DATA.totalReviews} reviews
                </Text>
              </View>

              <View style={styles.ratingBarsCol}>
                {MOCK_REVIEWS_DATA.starDistribution.map((dist) => (
                  <View key={dist.stars} style={styles.starDistRow}>
                    <Text style={styles.starDistLabel}>{dist.stars}★</Text>
                    <View style={styles.starDistBarWrapper}>
                      <View style={[styles.starDistBarFill, { width: dist.pct as any }]} />
                    </View>
                    <Text style={styles.starDistCount}>{dist.count}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Category Scores */}
            <View style={styles.categoryScoresRow}>
              {MOCK_REVIEWS_DATA.categoryScores.map((cat, idx) => (
                <View key={idx} style={styles.catScoreCard}>
                  <Ionicons name={cat.icon as any} size={18} color={colors.primary} />
                  <Text style={styles.catScoreNum}>{cat.score} ★</Text>
                  <Text style={styles.catScoreLabel} numberOfLines={1}>
                    {cat.label}
                  </Text>
                </View>
              ))}
            </View>

            {/* Review Filter Pills */}
            <View style={styles.filterPillsRow}>
              <TouchableOpacity
                style={[styles.filterPill, reviewFilter === 'all' && styles.filterPillActive]}
                onPress={() => setReviewFilter('all')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    reviewFilter === 'all' && styles.filterPillTextActive,
                  ]}
                >
                  All ({MOCK_REVIEWS_DATA.recentReviews.length})
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, reviewFilter === '5star' && styles.filterPillActive]}
                onPress={() => setReviewFilter('5star')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    reviewFilter === '5star' && styles.filterPillTextActive,
                  ]}
                >
                  5 Stars Only
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.filterPill, reviewFilter === 'attention' && styles.filterPillActive]}
                onPress={() => setReviewFilter('attention')}
              >
                <Text
                  style={[
                    styles.filterPillText,
                    reviewFilter === 'attention' && styles.filterPillTextActive,
                  ]}
                >
                  Needs Attention (≤3★)
                </Text>
              </TouchableOpacity>
            </View>

            {/* Reviews List */}
            <View style={styles.reviewsList}>
              {filteredReviews.map((rev) => (
                <View key={rev.id} style={styles.reviewCard}>
                  <View style={styles.reviewCardHeader}>
                    <View style={styles.reviewerAvatar}>
                      <Text style={styles.avatarLetter}>
                        {rev.student.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.reviewerInfo}>
                      <Text style={styles.reviewerName}>{rev.student}</Text>
                      <Text style={styles.reviewerHostel}>{rev.hostel}</Text>
                    </View>
                    <View style={styles.reviewStarsTime}>
                      <View style={styles.starsInline}>
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Ionicons
                            key={s}
                            name={s <= rev.rating ? 'star' : 'star-outline'}
                            size={13}
                            color={s <= rev.rating ? '#F59E0B' : colors.textLight}
                          />
                        ))}
                      </View>
                      <Text style={styles.reviewTime}>{rev.time}</Text>
                    </View>
                  </View>

                  <Text style={styles.reviewComment}>{rev.comment}</Text>

                  <View style={styles.reviewFooter}>
                    <View style={styles.cycleTag}>
                      <Ionicons name="bicycle" size={13} color={colors.primary} />
                      <Text style={styles.cycleTagText}>{rev.cycle}</Text>
                    </View>
                    <Badge
                      variant={rev.rating >= 4 ? 'success' : 'warning'}
                      label={rev.tag}
                      size="sm"
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ---------------- VIEW 3: MAIN DASHBOARD FIRST PAGE ---------------- */}
        {currentView === 'dashboard' && (
          <View>
            {/* KPI Stats Grid: Total Cycles, Active Rides, Total Users */}
            <View style={styles.statsGrid}>
              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('AdminAllCycles')}
                activeOpacity={0.8}
              >
                <View style={[styles.statIconBadge, { backgroundColor: '#EFF6FF' }]}>
                  <Ionicons name="cube-outline" size={20} color={colors.info} />
                </View>
                <Text style={styles.statNumber}>{totalCycles}</Text>
                <Text style={styles.statLabel}>Total Cycles</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('AdminActiveRides')}
                activeOpacity={0.8}
              >
                <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <Ionicons name="bicycle-outline" size={20} color={colors.accent} />
                </View>
                <Text style={styles.statNumber}>{activeRides}</Text>
                <Text style={styles.statLabel}>Active Rides</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statCard}
                onPress={() => navigation.navigate('AdminAllUsers')}
                activeOpacity={0.8}
              >
                <View style={[styles.statIconBadge, { backgroundColor: '#F5F3FF' }]}>
                  <Ionicons name="people-outline" size={20} color="#7C3AED" />
                </View>
                <Text style={[styles.statNumber, { color: '#7C3AED' }]}>
                  {totalUsers}
                </Text>
                <Text style={styles.statLabel}>Total Users</Text>
              </TouchableOpacity>
            </View>

            {/* Segmented Tab Switcher: Replaces 'All Users' with 'Reports' */}
            <View style={styles.tabSwitcher}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
                onPress={() => setActiveTab('all')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="grid-outline"
                  size={15}
                  color={activeTab === 'all' ? colors.white : colors.textSecondary}
                />
                <Text
                  style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}
                >
                  All Overview
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'pending' && styles.tabBtnActive]}
                onPress={() => setActiveTab('pending')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="checkmark-circle-outline"
                  size={15}
                  color={activeTab === 'pending' ? colors.white : colors.textSecondary}
                />
                <Text
                  style={[styles.tabBtnText, activeTab === 'pending' && styles.tabBtnTextActive]}
                >
                  Cycle Verifications ({totalCycleVerifications || pendingCycles.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'reports' && styles.tabBtnActive]}
                onPress={() => setActiveTab('reports')}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={15}
                  color={activeTab === 'reports' ? colors.white : colors.textSecondary}
                />
                <Text
                  style={[styles.tabBtnText, activeTab === 'reports' && styles.tabBtnTextActive]}
                >
                  Reports ({totalReports || pendingReportsCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Search Bar for First Page */}
            <View style={styles.searchSection}>
              <View style={styles.searchBar}>
                <Ionicons name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={
                    activeTab === 'reports'
                      ? 'Search reports by title, cycle, location...'
                      : activeTab === 'pending'
                      ? 'Search cycle verifications by brand, model, stand...'
                      : 'Search cycle verifications or reports...'
                  }
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

            {/* SECTION A: PENDING VERIFICATION CYCLES */}
            {(activeTab === 'all' || activeTab === 'pending') && (
              <View style={styles.sectionContainer}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderTitleRow}>
                    <Ionicons name="bicycle" size={18} color={colors.primary} />
                    <Text style={styles.sectionTitle}>Pending Verification Cycles</Text>
                    <View style={styles.countBadge}>
                      <Text style={styles.countBadgeText}>{filteredCycles.length}</Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('AdminCycleVerifications')}>
                    <Text style={styles.seeAllText}>All Verifications →</Text>
                  </TouchableOpacity>
                </View>

                {filteredCycles.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="checkmark-done-circle-outline" size={48} color={colors.accent} />
                    <Text style={styles.emptyTitle}>No Pending Cycles</Text>
                    <Text style={styles.emptySubtitle}>
                      All cycle listing requests have been verified.
                    </Text>
                  </View>
                ) : (
                  filteredCycles.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.pendingCard}
                      onPress={() => handleCyclePress(item)}
                      activeOpacity={0.85}
                    >
                      {/* Cycle Thumbnail */}
                      <View style={styles.pendingThumbWrapper}>
                        {item.image ? (
                          <Image
                            source={{ uri: item.image }}
                            style={styles.pendingThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <View style={styles.pendingThumbPlaceholder}>
                            <Ionicons name="bicycle" size={26} color={colors.primary} />
                          </View>
                        )}
                      </View>

                      {/* Cycle Info */}
                      <View style={styles.cardLeft}>
                        <View style={styles.titleRow}>
                          <Text style={styles.pendingTitle} numberOfLines={1}>
                            {item.brand} {item.model}
                          </Text>
                          <Badge variant="warning" label="Review" size="sm" />
                        </View>

                        <View style={styles.locationRow}>
                          <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                          <Text style={styles.pendingLocation} numberOfLines={1}>
                            {item.location || 'NITK Campus'}
                          </Text>
                        </View>

                        <View style={styles.cycleMetaRow}>
                          <Text style={styles.pendingPrice}>
                            ₹{item.price_per_hour}/hr • ₹{item.price_per_day}/day
                          </Text>
                          {item.owner_name && (
                            <Text style={styles.ownerText}>By {item.owner_name}</Text>
                          )}
                        </View>
                      </View>

                      <Ionicons
                        name="chevron-forward"
                        size={18}
                        color={colors.textLight}
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>
                  ))
                )}
              </View>
            )}

            {/* SECTION B: PENDING REPORTS DIRECTLY ON FIRST PAGE */}
            {(activeTab === 'all' || activeTab === 'reports') && (
              <View style={[styles.sectionContainer, { marginTop: spacing.md }]}>
                <View style={styles.sectionHeader}>
                  <View style={styles.sectionHeaderTitleRow}>
                    <Ionicons name="warning" size={18} color={colors.danger} />
                    <Text style={styles.sectionTitle}>Pending Reports</Text>
                    <View style={[styles.countBadge, { backgroundColor: '#FEE2E2' }]}>
                      <Text style={[styles.countBadgeText, { color: colors.danger }]}>
                        {filteredReports.filter((r) => r.status === 'pending').length}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity onPress={() => navigation.navigate('AdminReports')}>
                    <Text style={styles.seeAllText}>All Reports →</Text>
                  </TouchableOpacity>
                </View>

                {/* Sub-filter when reports tab is focused */}
                {activeTab === 'reports' && (
                  <View style={styles.reportPillRow}>
                    <TouchableOpacity
                      style={[
                        styles.reportPill,
                        reportFilter === 'all' && styles.reportPillActive,
                      ]}
                      onPress={() => setReportFilter('all')}
                    >
                      <Text
                        style={[
                          styles.reportPillText,
                          reportFilter === 'all' && styles.reportPillTextActive,
                        ]}
                      >
                        All ({reports.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.reportPill,
                        reportFilter === 'pending' && styles.reportPillActive,
                      ]}
                      onPress={() => setReportFilter('pending')}
                    >
                      <Text
                        style={[
                          styles.reportPillText,
                          reportFilter === 'pending' && styles.reportPillTextActive,
                        ]}
                      >
                        Pending ({pendingReportsCount})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.reportPill,
                        reportFilter === 'resolved' && styles.reportPillActive,
                      ]}
                      onPress={() => setReportFilter('resolved')}
                    >
                      <Text
                        style={[
                          styles.reportPillText,
                          reportFilter === 'resolved' && styles.reportPillTextActive,
                        ]}
                      >
                        Resolved
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}

                {filteredReports.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Ionicons name="shield-checkmark-outline" size={48} color={colors.accent} />
                    <Text style={styles.emptyTitle}>No Reports Found</Text>
                    <Text style={styles.emptySubtitle}>
                      Campus cycles and stands are running smoothly without active issues.
                    </Text>
                  </View>
                ) : (
                  filteredReports.map((report) => {
                    const isPending = report.status === 'pending';
                    return (
                      <View
                        key={report.id}
                        style={[styles.reportCard, !isPending && styles.reportCardResolved]}
                      >
                        <View style={styles.reportHeader}>
                          <View style={styles.reportHeaderLeft}>
                            <Badge
                              variant={
                                report.priority === 'urgent'
                                  ? 'danger'
                                  : report.priority === 'medium'
                                  ? 'warning'
                                  : 'primary'
                              }
                              label={report.type}
                              size="sm"
                            />
                            <Text style={styles.reportTime}>{report.created_at}</Text>
                          </View>
                          <Badge
                            variant={isPending ? 'warning' : 'success'}
                            label={isPending ? 'Pending' : 'Resolved'}
                            size="sm"
                          />
                        </View>

                        <Text style={styles.reportTitle}>{report.title}</Text>

                        <View style={styles.reportMetaGrid}>
                          <View style={styles.reportMetaItem}>
                            <Ionicons name="bicycle-outline" size={13} color={colors.textSecondary} />
                            <Text style={styles.reportMetaText} numberOfLines={1}>
                              {report.cycle_name}
                            </Text>
                          </View>
                          <View style={styles.reportMetaItem}>
                            <Ionicons name="location-outline" size={13} color={colors.textSecondary} />
                            <Text style={styles.reportMetaText} numberOfLines={1}>
                              {report.location}
                            </Text>
                          </View>
                          <View style={styles.reportMetaItem}>
                            <Ionicons name="person-outline" size={13} color={colors.textSecondary} />
                            <Text style={styles.reportMetaText} numberOfLines={1}>
                              {report.reporter_name} ({report.reporter_hostel})
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.reportDesc} numberOfLines={2}>
                          {report.description}
                        </Text>

                        {/* Actions Row */}
                        <View style={styles.reportActionsRow}>
                          <TouchableOpacity
                            style={styles.investigateBtn}
                            onPress={() => handleInvestigateReport(report)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="eye-outline" size={14} color={colors.primary} />
                            <Text style={styles.investigateBtnText}>Investigate</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[
                              styles.resolveBtn,
                              !isPending && styles.reopenBtn,
                            ]}
                            onPress={() => handleResolveReport(report.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={isPending ? 'checkmark-circle-outline' : 'refresh-outline'}
                              size={14}
                              color={isPending ? colors.white : colors.textSecondary}
                            />
                            <Text
                              style={[
                                styles.resolveBtnText,
                                !isPending && styles.reopenBtnText,
                              ]}
                            >
                              {isPending ? 'Resolve' : 'Reopen'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Note: Down navigation buttons (RentalBottomNav) have been deliberately removed as requested */}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  headerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  studentViewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.full,
    gap: 6,
  },
  studentViewText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },

  /* Top Banner */
  /* Quick Action Navigation Grid: Cycle Verifications, Reports, Analysis & Reviews */
  actionGrid: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm + 2,
    gap: spacing.xs + 2,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  actionBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#F0F9FF',
  },
  actionBtnActiveReports: {
    borderColor: colors.danger,
    backgroundColor: '#FEF2F2',
  },
  actionBtnActiveReviews: {
    borderColor: colors.accent,
    backgroundColor: '#F0FDF4',
  },
  actionIconCircle: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  actionBtnTextCol: {
    flex: 1,
  },
  actionBtnTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  actionBtnTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionBtnTitleActive: {
    color: colors.primary,
  },
  actionBtnTitleActiveDanger: {
    color: colors.danger,
  },
  actionBtnTitleActiveAccent: {
    color: colors.accent,
  },
  actionBtnSub: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },
  actionBadgePill: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: borderRadius.full,
  },
  actionBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.primary,
  },

  /* Initial Loading Banner */
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    borderRadius: borderRadius.md,
    gap: 8,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  loadingBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.primary,
  },

  /* KPI Stats Grid */
  statsGrid: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  statCardActive: {
    borderColor: colors.primary,
    backgroundColor: '#F8FAFC',
  },
  statIconBadge: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 2,
  },

  /* Segmented Tab Switcher */
  tabSwitcher: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: borderRadius.full,
    padding: 3,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    gap: 2,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: borderRadius.full,
    gap: 4,
  },
  tabBtnActive: {
    backgroundColor: colors.primary,
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabBtnTextActive: {
    color: colors.white,
    fontWeight: '700',
  },

  /* Search Section */
  searchSection: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.sm + 4,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
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

  /* Section Containers on First Page */
  sectionContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  countBadge: {
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.info,
  },
  seeAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.primary,
  },

  /* Pending Cycle Cards */
  pendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md - 2,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  pendingThumbWrapper: {
    marginRight: spacing.sm + 4,
  },
  pendingThumb: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.md,
  },
  pendingThumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  cardLeft: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingRight: 4,
  },
  pendingTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  pendingLocation: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  cycleMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  pendingPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
  ownerText: {
    fontSize: 11,
    color: colors.textLight,
  },

  /* Report Cards */
  reportCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  reportCardResolved: {
    opacity: 0.75,
    backgroundColor: '#FAFBFD',
  },
  reportHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  reportHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reportTime: {
    fontSize: 11,
    color: colors.textLight,
  },
  reportTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  reportMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  reportMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  reportMetaText: {
    fontSize: 11,
    color: colors.textSecondary,
    maxWidth: 150,
  },
  reportDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
    marginBottom: 10,
  },
  reportActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
    paddingTop: 8,
  },
  investigateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceLight,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    gap: 5,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  investigateBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  resolveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    gap: 5,
  },
  resolveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  reopenBtn: {
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reopenBtnText: {
    color: colors.textSecondary,
  },

  /* Report Sub-pills */
  reportPillRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm,
  },
  reportPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  reportPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  reportPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  reportPillTextActive: {
    color: colors.white,
  },

  /* Sub-Views Shared Header */
  viewContainer: {
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  viewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  viewTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  viewSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeViewBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
  },

  /* Analytics View Styles */
  analyticsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  analyticsCard: {
    width: '48.5%',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  analyticsCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  analyticsCardLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  analyticsCardValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  analyticsGrowth: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent,
    marginTop: 4,
  },
  analyticsSub: {
    fontSize: 10,
    color: colors.textLight,
    marginTop: 4,
  },
  sectionBox: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  sectionBoxTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionBoxSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: 2,
  },
  chartContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 120,
    paddingTop: 10,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  chartBarValue: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.textLight,
    marginBottom: 4,
  },
  chartBarWrapper: {
    width: 14,
    height: 80,
    backgroundColor: '#F1F5F9',
    borderRadius: 7,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBar: {
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: 7,
  },
  chartBarPeak: {
    backgroundColor: colors.accent,
  },
  chartDay: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 6,
  },
  chartDayPeak: {
    color: colors.accent,
    fontWeight: '800',
  },
  peakHoursList: {
    gap: 12,
  },
  peakHourItem: {},
  peakHourTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  peakHourLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  peakHourPct: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.primary,
  },
  peakHourDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    marginTop: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  stationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  stationRank: {
    width: 26,
    height: 26,
    borderRadius: borderRadius.full,
    backgroundColor: colors.surfaceLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  stationRankText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.primary,
  },
  stationInfo: {
    flex: 1,
  },
  stationName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stationSub: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 1,
  },

  /* Reviews View Styles */
  ratingSummaryCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  ratingBigCol: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: spacing.md,
    borderRightWidth: 1,
    borderRightColor: colors.borderLight,
    width: '40%',
  },
  ratingBigScore: {
    fontSize: 40,
    fontWeight: '900',
    color: colors.textPrimary,
    lineHeight: 46,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginVertical: 4,
  },
  ratingTotalText: {
    fontSize: 10,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  ratingBarsCol: {
    flex: 1,
    paddingLeft: spacing.md,
    justifyContent: 'center',
    gap: 4,
  },
  starDistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  starDistLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
    width: 18,
  },
  starDistBarWrapper: {
    flex: 1,
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  starDistBarFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    borderRadius: 3,
  },
  starDistCount: {
    fontSize: 10,
    color: colors.textLight,
    width: 22,
    textAlign: 'right',
  },
  categoryScoresRow: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    marginBottom: spacing.md,
  },
  catScoreCard: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: borderRadius.md,
    padding: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  catScoreNum: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.textPrimary,
    marginTop: 4,
  },
  catScoreLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    marginTop: 2,
    textAlign: 'center',
  },
  filterPillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.md,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  filterPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
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
  reviewsList: {
    gap: spacing.sm,
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
    ...shadows.sm,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerAvatar: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.full,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  avatarLetter: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.primary,
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  reviewerHostel: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  reviewStarsTime: {
    alignItems: 'flex-end',
  },
  starsInline: {
    flexDirection: 'row',
    gap: 1,
  },
  reviewTime: {
    fontSize: 10,
    color: colors.textLight,
    marginTop: 2,
  },
  reviewComment: {
    fontSize: 12,
    color: colors.textPrimary,
    lineHeight: 18,
    marginBottom: 8,
  },
  reviewFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cycleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borderRadius.sm,
  },
  cycleTagText: {
    fontSize: 11,
    color: colors.textPrimary,
    fontWeight: '600',
  },

  /* Empty State */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
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
