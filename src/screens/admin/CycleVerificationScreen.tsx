import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';

import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';

type VerificationRouteProp = RouteProp<RootStackParamList, 'CycleVerification'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function CycleVerificationScreen() {
  const route = useRoute<VerificationRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { cycleId, cycle: initialCycle } = route.params;
  const { user } = useAuth();

  const [cycle, setCycle] = useState<any>(initialCycle || null);
  const [images, setImages] = useState<string[]>(() => {
    if (initialCycle?.images && initialCycle.images.length > 0) return initialCycle.images;
    if (initialCycle?.image) return [initialCycle.image];
    return [];
  });
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [owner, setOwner] = useState<any>(() => {
    const initAny = initialCycle as any;
    if (initAny?.owner_name || initAny?.phone || initAny?.email) {
      return {
        full_name: initAny.owner_name || initAny.owner || 'Student Owner',
        phone: initAny.phone || '',
        email: initAny.email || '',
        hostel: initAny.location || '',
      };
    }
    return null;
  });
  const [loading, setLoading] = useState(!initialCycle);
  const [submitting, setSubmitting] = useState(false);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const fetchCycleData = async () => {
      try {
        const { data: cycleData, error: cycleErr } = await supabase
          .from('cycles')
          .select(`
            *,
            cycle_images (image_url, storage_path, display_order)
          `)
          .eq('id', cycleId)
          .single();

        if (cycleErr) throw cycleErr;
        setCycle(cycleData);

        // Fetch owner details
        if (cycleData.owner_id) {
          const { data: ownerProfile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', cycleData.owner_id)
            .single();

          setOwner(ownerProfile);
        }

        // Fetch images with robust URL resolution
        const urls = extractCycleImages(cycleData);
        setImages(urls);
      } catch (err) {
        console.error('Error fetching cycle for review:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCycleData();
  }, [cycleId]);

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (decision === 'rejected' && !reason.trim()) {
      Alert.alert('Reason Required', 'Please enter a rejection reason to inform the student.');
      return;
    }

    setSubmitting(true);
    try {
      // Connect to traditional backend with notification/cycleverification
      // Access tokens sent through Authorization header, with { reason, status, cycle_id }
      const res = await apiClient.verifyCycleListing({
        cycle_id: cycleId,
        status: decision,
        reason: reason.trim(),
      });

      const message =
        res?.message ||
        res?.data?.message ||
        (typeof res === 'string' ? res : null) ||
        (decision === 'approved'
          ? 'This cycle is now verified and active in the campus rental feed.'
          : 'The student will receive your feedback regarding why the listing was rejected.');

      Alert.alert(
        decision === 'approved' ? 'Cycle Approved! ✅' : 'Cycle Rejected',
        message,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      Alert.alert('Action Failed', err.message || 'Unable to update verification status.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
        <Header title="Verify Cycle" showBack />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading cycle review details...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header title="Verify Cycle Listing" showBack />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Images Carousel or Fallback Placeholder */}
        {images.length > 0 ? (
          <View style={styles.imageCarouselContainer}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.imageScroll}
              onMomentumScrollEnd={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const index = Math.round(offsetX / SCREEN_WIDTH);
                setActiveImageIndex(index);
              }}
            >
              {images.map((uri, idx) => (
                <View key={idx} style={styles.slideWrapper}>
                  <Image
                    source={{ uri: getCycleImageUrl(uri) }}
                    style={styles.slideImage}
                    resizeMode="cover"
                  />
                </View>
              ))}
            </ScrollView>

            {/* Image counter chip */}
            <View style={styles.imageCounterChip}>
              <Ionicons name="camera" size={12} color={colors.white} />
              <Text style={styles.imageCounterText}>
                {activeImageIndex + 1} / {images.length}
              </Text>
            </View>

            {/* Pagination Dots */}
            {images.length > 1 && (
              <View style={styles.dotsRow}>
                {images.map((_, idx) => (
                  <View
                    key={idx}
                    style={[
                      styles.dot,
                      activeImageIndex === idx && styles.activeDot,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.noPhotoCard}>
            <View style={styles.noPhotoCircle}>
              <Ionicons name="bicycle" size={44} color={colors.primary} />
            </View>
            <Text style={styles.noPhotoTitle}>No Photos Uploaded</Text>
            <Text style={styles.noPhotoSubtitle}>
              Student submitted this cycle without attaching photo proof
            </Text>
          </View>
        )}

        <View style={styles.detailsCard}>
          <View style={styles.titleRow}>
            <Text style={styles.cycleTitle}>
              {cycle?.brand} {cycle?.model}
            </Text>
            <Badge variant="warning" label="Unverified" />
          </View>

          <View style={styles.specsRow}>
            <Badge
              variant="neutral"
              label={
                cycle?.geared || cycle?.cycle_type?.toLowerCase().includes('gear')
                  ? 'Geared'
                  : 'Non-Geared'
              }
            />
            <Badge variant="neutral" label={`Condition: ${cycle?.condition || 'Good'}`} />
            <Badge variant="neutral" label={`Type: ${cycle?.cycle_type || 'Road'}`} />
          </View>

          <View style={styles.ownerInfoBox}>
            <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
            <View style={{ flex: 1 }}>
              <Text style={styles.ownerName}>Listed by: {owner?.full_name || 'Student'}</Text>
              <Text style={styles.ownerSub}>
                {owner?.email} • {owner?.hostel || 'NITK Campus'}
              </Text>
            </View>
          </View>

          <Text style={styles.priceInfo}>
            ₹{cycle?.price_per_hour}/hr • ₹{cycle?.price_per_day}/day
          </Text>

          {cycle?.description ? (
            <Text style={styles.descriptionText}>{cycle.description}</Text>
          ) : null}

          {/* Rejection reason box */}
          <Input
            label="Rejection Reason (if declining)"
            placeholder="e.g. Unclear photos, incorrect hostel location, damaged chain..."
            value={reason}
            onChangeText={setReason}
            multiline
          />

          <View style={styles.actionRow}>
            <Button
              title="Reject Cycle"
              onPress={() => handleDecision('rejected')}
              variant="danger"
              style={{ flex: 1 }}
              loading={submitting}
            />

            <Button
              title="Approve Cycle"
              onPress={() => handleDecision('approved')}
              variant="accent"
              style={{ flex: 1 }}
              loading={submitting}
            />
          </View>
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
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    paddingBottom: spacing.xxl,
  },
  imageCarouselContainer: {
    position: 'relative',
    width: SCREEN_WIDTH,
    height: 250,
    backgroundColor: colors.surfaceLight,
  },
  imageScroll: {
    width: SCREEN_WIDTH,
    height: 250,
  },
  slideWrapper: {
    width: SCREEN_WIDTH,
    height: 250,
    backgroundColor: colors.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slideImage: {
    width: SCREEN_WIDTH,
    height: 250,
  },
  imageCounterChip: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  imageCounterText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
  },
  activeDot: {
    width: 18,
    backgroundColor: colors.white,
  },
  noPhotoCard: {
    width: SCREEN_WIDTH,
    height: 220,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  noPhotoCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  noPhotoTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  noPhotoSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  detailsCard: {
    padding: spacing.lg,
    backgroundColor: colors.white,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  cycleTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  specsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginVertical: spacing.sm,
  },
  ownerInfoBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight,
  },
  ownerName: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  ownerSub: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  priceInfo: {
    fontSize: typography.h3.fontSize,
    fontWeight: '800',
    color: colors.accent,
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: typography.body2.fontSize,
  },
});
