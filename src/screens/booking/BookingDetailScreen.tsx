import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/ui/Header';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';

type BookingDetailRouteProp = RouteProp<RootStackParamList, 'BookingDetail'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function BookingDetailScreen() {
  const route = useRoute<BookingDetailRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { cycle } = route.params;
  const { user, profile } = useAuth();

  const [hours, setHours] = useState('1');
  const [days, setDays] = useState('0');
  const [submitting, setSubmitting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const ownerName =
    cycle.owner_name ||
    cycle.ownerName ||
    (cycle as any).owner?.name ||
    (cycle as any).owner?.full_name ||
    (cycle as any).owner_full_name ||
    'NITK Owner';


  const numericHours = Math.max(0, parseInt(hours, 10) || 0);
  const numericDays = Math.max(0, parseInt(days, 10) || 0);
  const pricePerHour = Number(cycle.price_per_hour ?? cycle.hourlyPrice ?? 0);
  const pricePerDay = Number(cycle.price_per_day ?? cycle.dailyPrice ?? 0);

  const hourlyAmount = numericHours * pricePerHour;
  const dailyAmount = numericDays * pricePerDay;
  const totalPrice = hourlyAmount + dailyAmount;
  const totalHours = numericDays * 24 + numericHours;

  const images = extractCycleImages(cycle);
  const carouselRef = useRef<ScrollView>(null);

  const scrollToImage = (index: number) => {
    if (index < 0 || index >= images.length) return;
    setActiveImageIndex(index);
    carouselRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
  };

  const handlePrevImage = () => {
    if (images.length <= 1) return;
    const newIndex = activeImageIndex > 0 ? activeImageIndex - 1 : images.length - 1;
    scrollToImage(newIndex);
  };

  const handleNextImage = () => {
    if (images.length <= 1) return;
    const newIndex = activeImageIndex < images.length - 1 ? activeImageIndex + 1 : 0;
    scrollToImage(newIndex);
  };

  const handleBooking = async () => {
    if (!user) {
      Alert.alert('Login Required', 'Please sign in to book a cycle.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Login', onPress: () => navigation.navigate('Login') },
      ]);
      return;
    }

    // 1. Balance verification
    const netBalance = Number(profile?.net_balance ?? 0);
    if (netBalance < 0) {
      Alert.alert(
        'Outstanding Balance',
        `You have an outstanding dues balance of ₹${Math.abs(netBalance)}. Please clear dues in Booking History before making a new booking.`
      );
      return;
    }

    // 2. Owner cannot rent own cycle
    if (cycle.owner_id === user.id) {
      Alert.alert('Action Not Allowed', 'You cannot book your own cycle.');
      return;
    }

    // 3. Duration validation
    if (totalHours === 0) {
      Alert.alert('Invalid Duration', 'Rental duration must be at least 1 hour.');
      return;
    }

    if (totalHours > 168) {
      Alert.alert('Duration Limit Exceeded', 'Maximum rental duration is 7 days (168 hours).');
      return;
    }

    setSubmitting(true);
    try {
      // Send booking request directly to backend API /api/booking/bookCycle
      const res = await apiClient.bookCycle({
        cycle_id: cycle.id,
        hours: numericHours,
        days: numericDays,
      });

      const messageFromBackend =
        res?.message ||
        res?.data?.message ||
        res?.msg ||
        res?.status ||
        'Booking request submitted successfully!';

      Alert.alert(
        'Booking Request',
        String(messageFromBackend),
        [
          {
            text: 'View Ongoing Rentals',
            onPress: () => navigation.navigate('OngoingRentals'),
          },
          {
            text: 'OK',
            style: 'cancel',
          },
        ]
      );
    } catch (err: any) {
      const errorMsg =
        err?.data?.message ||
        err?.data?.error ||
        err?.message ||
        'Unable to complete booking request.';
      Alert.alert('Booking Notice', String(errorMsg));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title="Cycle Details"
        showBack
        rightAction={{
          icon: 'chatbubble-ellipses-outline',
          onPress: () => navigation.navigate('OngoingRentals')}}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Images Carousel */}
        <View style={styles.carouselContainer}>
          {images.length > 0 ? (
            <ScrollView
              ref={carouselRef}
              horizontal
              pagingEnabled
              nestedScrollEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                setActiveImageIndex(index);
              }}
            >
              {images.map((uri, idx) => (
                <Image key={idx} source={{ uri: getCycleImageUrl(uri) }} style={styles.carouselImage} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noImage}>
              <Ionicons name="bicycle-outline" size={70} color={colors.textLight} />
            </View>
          )}

          {images.length > 1 && (
            <>
              {/* Left Arrow Button */}
              <TouchableOpacity
                style={[styles.arrowButton, styles.leftArrowButton]}
                onPress={handlePrevImage}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              {/* Right Arrow Button */}
              <TouchableOpacity
                style={[styles.arrowButton, styles.rightArrowButton]}
                onPress={handleNextImage}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.imageCounterBadge}>
                <Ionicons name="images" size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.imageCounterText}>
                  {activeImageIndex + 1} / {images.length}
                </Text>
              </View>
              <View style={styles.dotsRow}>
                {images.map((_, idx) => (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => scrollToImage(idx)}
                    hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                  >
                    <View
                      style={[styles.dot, activeImageIndex === idx && styles.activeDot]}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Cycle Overview */}
        <View style={styles.detailsCard}>
          <View style={styles.titleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.brandTitle}>
                {cycle.brand} {cycle.model}
              </Text>
              <View style={styles.locationRow}>
                <Ionicons name="location-outline" size={15} color={colors.textSecondary} />
                <Text style={styles.locationText}>{cycle.location}</Text>
                {!!ownerName && (
                  <>
                    <Text style={styles.locationDot}>•</Text>
                    <Ionicons name="person-outline" size={13} color={colors.accent} />
                    <Text style={styles.ownerNameText}>{ownerName}</Text>
                  </>
                )}
              </View>
            </View>
            <Badge variant="success" label="Verified Cycle" />
          </View>

          {/* Specs Chips */}
          <View style={styles.specsRow}>
            <View style={styles.specChip}>
              <Ionicons name="speedometer-outline" size={16} color={colors.primary} />
              <Text style={styles.specText}>{cycle.geared ? 'Geared' : 'Single Speed'}</Text>
            </View>
            <View style={styles.specChip}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
              <Text style={styles.specText}>{cycle.condition || 'Good'}</Text>
            </View>
            <View style={styles.specChip}>
              <Ionicons name="star" size={16} color={colors.accent} />
              <Text style={styles.specText}>{(cycle.rating || 4.5).toFixed(1)} Rating</Text>
            </View>
          </View>



          {/* Pricing Rates */}
          <View style={styles.rateCard}>
            <View style={styles.rateCol}>
              <Text style={styles.rateLabel}>Hourly Rate</Text>
              <Text style={styles.rateVal}>₹{pricePerHour}<Text style={styles.rateUnit}>/hr</Text></Text>
            </View>
            <View style={styles.rateDivider} />
            <View style={styles.rateCol}>
              <Text style={styles.rateLabel}>Daily Rate</Text>
              <Text style={styles.rateVal}>₹{pricePerDay}<Text style={styles.rateUnit}>/day</Text></Text>
            </View>
          </View>

          {/* Rental Duration Picker */}
          <View style={styles.durationSection}>
            <Text style={styles.sectionTitle}>Select Rental Duration</Text>

            <View style={styles.durationPickersRow}>
              {/* Days input */}
              <View style={styles.pickerBox}>
                <Text style={styles.pickerLabel}>Days (0 - 7)</Text>
                <View style={styles.numberStepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setDays(String(Math.max(0, numericDays - 1)))}
                  >
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.stepInput}
                    keyboardType="number-pad"
                    value={days}
                    onChangeText={setDays}
                    maxLength={1}
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setDays(String(Math.min(7, numericDays + 1)))}
                  >
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Hours input */}
              <View style={styles.pickerBox}>
                <Text style={styles.pickerLabel}>Hours (0 - 23)</Text>
                <View style={styles.numberStepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setHours(String(Math.max(0, numericHours - 1)))}
                  >
                    <Ionicons name="remove" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.stepInput}
                    keyboardType="number-pad"
                    value={hours}
                    onChangeText={setHours}
                    maxLength={2}
                  />
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setHours(String(Math.min(23, numericHours + 1)))}
                  >
                    <Ionicons name="add" size={18} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <Text style={styles.totalDurationHint}>
              Total Time: {totalHours} hour{totalHours !== 1 ? 's' : ''} ({numericDays}d {numericHours}h)
            </Text>
          </View>

          {/* Fare Summary */}
          <View style={styles.fareBreakdown}>
            <Text style={styles.fareTitle}>Fare Breakdown</Text>
            {numericDays > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>{numericDays} day(s) × ₹{pricePerDay}</Text>
                <Text style={styles.fareVal}>₹{dailyAmount}</Text>
              </View>
            )}
            {numericHours > 0 && (
              <View style={styles.fareRow}>
                <Text style={styles.fareLabel}>{numericHours} hour(s) × ₹{pricePerHour}</Text>
                <Text style={styles.fareVal}>₹{hourlyAmount}</Text>
              </View>
            )}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Estimated Total</Text>
              <Text style={styles.totalVal}>₹{totalPrice}</Text>
            </View>
          </View>

          {/* Terms Note */}
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <Text style={styles.noteText}>
              • Once the owner accepts, ride coordination and chat are available immediately in Ongoing Rentals.{'\n'}
              • Payment is completed upon pickup, and duration starts ticking only after payment.
            </Text>
          </View>

          {/* Request Button */}
          <Button
            title={`Request Booking • ₹${totalPrice}`}
            onPress={handleBooking}
            loading={submitting}
            size="lg"
            variant="accent"
            icon="send"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.backgroundDark},
  container: {
    flex: 1},
  scrollContent: {
    paddingBottom: spacing.xxl},
  carouselContainer: {
    width: SCREEN_WIDTH,
    height: 240,
    backgroundColor: colors.surfaceLight,
    position: 'relative'},
  carouselImage: {
    width: SCREEN_WIDTH,
    height: 240},
  noImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'},
  dotsRow: {
    position: 'absolute',
    bottom: spacing.sm,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6},
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.5)'},
  activeDot: {
    backgroundColor: colors.accent,
    width: 16},
  imageCounterBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borderRadius.full},
  imageCounterText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700'},
  arrowButton: {
    position: 'absolute',
    top: 98,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    zIndex: 10,
    ...shadows.md},
  leftArrowButton: {
    left: spacing.sm + 4},
  rightArrowButton: {
    right: spacing.sm + 4},
  detailsCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    marginTop: -spacing.md,
    padding: spacing.lg,
    ...shadows.lg},
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.sm},
  brandTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary},
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 4},
  locationText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary},
  locationDot: {
    fontSize: typography.body2.fontSize,
    color: colors.textLight},
  ownerNameText: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    fontWeight: '600'},
  specsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginVertical: spacing.md},
  specChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: borderRadius.md},
  specText: {
    fontSize: typography.caption.fontSize,
    color: colors.textPrimary,
    fontWeight: '600'},
  rateCard: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderLight},
  rateCol: {
    flex: 1,
    alignItems: 'center'},
  rateLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: 2},
  rateVal: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.textPrimary},
  rateUnit: {
    fontSize: typography.caption.fontSize,
    fontWeight: 'normal',
    color: colors.textSecondary},
  rateDivider: {
    width: 1,
    backgroundColor: colors.border},
  durationSection: {
    marginBottom: spacing.lg},
  sectionTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm},
  durationPickersRow: {
    flexDirection: 'row',
    gap: spacing.md},
  pickerBox: {
    flex: 1,
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderLight},
  pickerLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: 6,
    fontWeight: '600'},
  numberStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'},
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.white,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border},
  stepInput: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    minWidth: 40},
  totalDurationHint: {
    fontSize: typography.caption.fontSize,
    color: colors.textLight,
    marginTop: 6,
    fontStyle: 'italic'},
  fareBreakdown: {
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderLight},
  fareTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs},
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4},
  fareLabel: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary},
  fareVal: {
    fontSize: typography.body2.fontSize,
    fontWeight: '600',
    color: colors.textPrimary},
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.xs,
    marginTop: 4},
  totalLabel: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary},
  totalVal: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.accent},
  noteBox: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: spacing.lg,
    borderLeftWidth: 3,
    borderLeftColor: colors.info},
  noteText: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    flex: 1,
    lineHeight: 18,
  },
});
