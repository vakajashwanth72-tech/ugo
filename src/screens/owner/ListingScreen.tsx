import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  StatusBar,
  Modal,
  FlatList,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { apiClient } from '../../lib/apiClient';
import { useAuth } from '../../hooks/useAuth';
import Header from '../../components/ui/Header';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';
import { RootStackParamList } from '../../navigation/navigationTypes';
import { getCycleImageUrl, extractCycleImages } from '../../lib/cycleUtils';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type ListingRouteProp = RouteProp<RootStackParamList, 'Listing'>;

export const NITK_CAMPUS_LOCATIONS = [
  'GH-1 Ganga',
  'GH-2 Kaveri',
  'GH-3 Yamuna',
  'GH-4 Sharavathi',
  'GH-5 Nethravathi',
  'GH-6 Godavari',
  'Block-1 Karavali',
  'Block-2 Aravali',
  'Block-3 Vindhya',
  'Block-4 Satpura',
  'Block-5 Nilgiri',
  'Block-7 Sahyadri',
  'Block-8 Trishul',
  'Block-11 Shiwalik',
  'MT-1 Everest',
  'MT-2 Himalaya',
  'MT-3 Kailash',
  'Brahmagiri',
  'Pushpagiri',
];

export const CYCLE_CONDITIONS = [
  { id: 'excellent', label: 'Excellent' },
  { id: 'good', label: 'Good' },
  { id: 'average', label: 'Average' },
];

export const CYCLE_TYPES = [
  { id: 'mountain', label: 'Mountain Bike' },
  { id: 'road', label: 'Road Bike' },
  { id: 'hybrid', label: 'Hybrid' },
  { id: 'gear', label: 'Gear Cycle' },
  { id: 'normal', label: 'Normal Cycle' },
];

export default function ListingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<ListingRouteProp>();
  const { user, profile } = useAuth();

  const routeCycleId = route.params?.cycleId ?? route.params?.editCycleId ?? null;
  const initialCycle = route.params?.cycle;

  // Helper to check whether an ID is a genuine database identifier
  const isValidBackendId = (id: any): boolean => {
    if (id === null || id === undefined) return false;
    const s = String(id).trim();
    if (!s || s === 'null' || s === 'undefined') return false;
    // Exclude dummy array index fallback e.g. "cycle-0", "cycle-1"
    if (s.startsWith('cycle-') && !isNaN(Number(s.replace('cycle-', '')))) return false;
    return true;
  };

  const rawCycleId =
    (initialCycle as any)?.cycle_id ??
    (initialCycle as any)?.cycleId ??
    routeCycleId ??
    initialCycle?.id ??
    null;

  const resolvedInitialCycleId = isValidBackendId(rawCycleId) ? rawCycleId : null;

  // Form states
  const [activeCycleId, setActiveCycleId] = useState<any>(resolvedInitialCycleId);
  const [brand, setBrand] = useState(initialCycle?.brand || (initialCycle as any)?.title || '');
  const [model, setModel] = useState(initialCycle?.model || '');
  const [cycleType, setCycleType] = useState(
    initialCycle?.cycle_type?.toLowerCase() || (initialCycle as any)?.type?.toLowerCase() || 'hybrid'
  );
  const [condition, setCondition] = useState(
    initialCycle?.condition?.toLowerCase() || 'good'
  );
  const [geared, setGeared] = useState(
    Boolean(
      initialCycle?.geared ||
      (initialCycle as any)?.gear_type?.toLowerCase().includes('gear') ||
      (initialCycle as any)?.gearType?.toLowerCase().includes('gear')
    )
  );
  const [pricePerHour, setPricePerHour] = useState(
    String(
      initialCycle?.price_per_hour ??
      initialCycle?.hourlyPrice ??
      (initialCycle as any)?.hourly_price ??
      (initialCycle as any)?.pricePerHour ??
      '10'
    )
  );
  const [pricePerDay, setPricePerDay] = useState(
    String(
      initialCycle?.price_per_day ??
      initialCycle?.dailyPrice ??
      (initialCycle as any)?.daily_price ??
      (initialCycle as any)?.pricePerDay ??
      '50'
    )
  );
  const [location, setLocation] = useState(
    initialCycle?.location || (initialCycle as any)?.hostel || profile?.hostel || 'Block-8 Trishul'
  );
  const [description, setDescription] = useState(initialCycle?.description || '');

  // 3 Images state
  const [images, setImages] = useState<(string | null)[]>(() => {
    const extracted = extractCycleImages(initialCycle);
    if (extracted.length > 0) {
      return [
        extracted[0] || null,
        extracted[1] || null,
        extracted[2] || null,
      ];
    }
    return [null, null, null];
  });
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Location selector modal
  const [locationModalVisible, setLocationModalVisible] = useState(false);

  // Load existing cycle if in edit mode or when route params change
  useEffect(() => {
    const currentId =
      (initialCycle as any)?.cycle_id ??
      (initialCycle as any)?.cycleId ??
      routeCycleId ??
      initialCycle?.id ??
      null;

    if (isValidBackendId(currentId)) {
      setActiveCycleId(currentId);
    } else {
      setActiveCycleId(null);
    }

    if (initialCycle) {
      setBrand(initialCycle.brand || (initialCycle as any)?.title || '');
      setModel(initialCycle.model || '');
      if (initialCycle.cycle_type) {
        setCycleType(initialCycle.cycle_type.toLowerCase());
      }
      if (initialCycle.condition) {
        setCondition(initialCycle.condition.toLowerCase());
      }
      setGeared(
        Boolean(
          initialCycle.geared ||
          (initialCycle as any)?.gear_type?.toLowerCase().includes('gear') ||
          (initialCycle as any)?.gearType?.toLowerCase().includes('gear')
        )
      );
      setPricePerHour(
        String(
          initialCycle.price_per_hour ??
          initialCycle.hourlyPrice ??
          (initialCycle as any)?.hourly_price ??
          (initialCycle as any)?.pricePerHour ??
          '10'
        )
      );
      setPricePerDay(
        String(
          initialCycle.price_per_day ??
          initialCycle.dailyPrice ??
          (initialCycle as any)?.daily_price ??
          (initialCycle as any)?.pricePerDay ??
          '50'
        )
      );
      if (initialCycle.location) {
        setLocation(initialCycle.location);
      }
      if (initialCycle.description) {
        setDescription(initialCycle.description);
      }

      const existingImgs = extractCycleImages(initialCycle);
      if (existingImgs.length > 0) {
        setImages([
          existingImgs[0] || null,
          existingImgs[1] || null,
          existingImgs[2] || null,
        ]);
      }
    }
  }, [routeCycleId, initialCycle]);

  const pickImage = async (index: number) => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera roll permissions are required to upload photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const nextImages = [...images];
        if (asset.base64) {
          nextImages[index] = `data:image/jpeg;base64,${asset.base64}`;
        } else if (asset.uri) {
          nextImages[index] = asset.uri;
        }
        setImages(nextImages);
      }
    } catch (err) {
      console.error('Image pick error:', err);
    }
  };

  // Helper to convert images to Base64 data URIs or keep existing URLs
  const prepareImagesForPayload = async () => {
    const processedImages: string[] = [];
    for (let i = 0; i < images.length; i++) {
      const uri = images[i];
      if (!uri) continue;

      if (uri.startsWith('data:image/') || uri.startsWith('http://') || uri.startsWith('https://')) {
        processedImages.push(uri);
      } else {
        try {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          processedImages.push(`data:image/jpeg;base64,${base64}`);
        } catch (imgErr) {
          console.warn(`Could not read image ${i + 1} as base64, passing uri:`, imgErr);
          processedImages.push(uri);
        }
      }
    }
    return processedImages;
  };

  // Helper to construct the complete cycle listing JSON object strictly in snake_case
  const buildCyclePayload = (
    status: string,
    processedImages: string[],
    hourlyNum: number,
    dailyNum: number
  ) => {
    const cyclePayload: any = {
      // Owner identifiers (snake_case)
      owner_id: user?.id,
      owner_name: profile?.full_name || '',
      phone: profile?.phone || '',
      email: user?.email || '',

      // Form details (snake_case)
      title: `${brand.trim()} ${model.trim() || 'Cycle'}`.trim(),
      brand: brand.trim(),
      model: model.trim(),
      cycle_type: cycleType || 'hybrid',
      condition: condition || 'good',
      gear_type: geared ? 'Geared' : 'Non-Geared',
      geared: Boolean(geared),

      // Pricing (snake_case)
      price_per_hour: hourlyNum,
      price_per_day: dailyNum,
      hourly_price: hourlyNum,
      daily_price: dailyNum,

      // Location & Description (snake_case)
      location: location.trim(),
      description: description.trim(),

      // Status & verification (snake_case)
      status,
      is_verified: false,

      // Editing ID for backend upsert detection:
      // If editing existing cycle: send stored cycle id
      // If new cycle: send null
      editing_id: isValidBackendId(activeCycleId) ? activeCycleId : null,

      // Images (snake_case & multi-format support)
      image: processedImages[0] || null,
      image_url: processedImages[0] || null,
      photo: processedImages[0] || null,
      picture: processedImages[0] || null,
      images: processedImages,
      cycle_images: processedImages.map((img, idx) => ({
        image_url: img,
        url: img,
        image: img,
        display_order: idx + 1,
      })),
      image1: processedImages[0] || null,
      image2: processedImages[1] || null,
      image3: processedImages[2] || null,
    };

    console.log('[ListingScreen] Built cycle listing payload:', {
      isEdit: Boolean(isValidBackendId(activeCycleId)),
      editing_id: cyclePayload.editing_id,
      brand: cyclePayload.brand,
      model: cyclePayload.model,
      imagesCount: processedImages.length,
    });

    return cyclePayload;
  };

  // Save as Draft (sent as JSON object to backend)
  const handleSaveDraft = async () => {
    if (!user) {
      Alert.alert('Authentication Required', 'Please log in to save a draft.');
      return;
    }

    if (!brand.trim()) {
      Alert.alert('Draft Needs Brand', 'Please enter at least a Brand name to save a draft.');
      return;
    }

    setSavingDraft(true);
    try {
      const hourlyNum = parseFloat(pricePerHour) || 0;
      const dailyNum = parseFloat(pricePerDay) || 0;

      const processedImages = await prepareImagesForPayload();
      const cyclePayload = buildCyclePayload('draft', processedImages, hourlyNum, dailyNum);

      const res = await apiClient.submitCycleListing(cyclePayload);
      const newId = res?.id || res?.cycle_id || res?.data?.id || res?.data?.cycle_id;
      if (newId && !activeCycleId) {
        setActiveCycleId(newId);
      }

      const draftMessage =
        res?.message ||
        res?.data?.message ||
        (typeof res === 'string' ? res : 'Draft saved successfully.');

      Alert.alert('Draft Saved 💾', draftMessage);
    } catch (err: any) {
      Alert.alert('Save Draft Failed', err.message || 'Unable to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  // Final submission (Create or Update sent as JSON object to backend ending with cyclelisting to base URL)
  const handleSubmit = async () => {
    if (!user) {
      Alert.alert('Authentication Error', 'Please log in to list a cycle.');
      return;
    }

    const { accessToken } = await apiClient.getEffectiveTokens();
    if (!accessToken) {
      Alert.alert(
        'Sign In Required',
        'Your login session is missing or expired. Please sign in to authenticate your cycle listing.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Sign In',
            onPress: () => navigation.navigate('Login'),
          },
        ]
      );
      return;
    }

    if (!brand.trim() || !model.trim() || !location.trim()) {
      Alert.alert('Missing Details', 'Please fill in the Brand, Model, and Location.');
      return;
    }

    if (images.some((img) => !img)) {
      if (isValidBackendId(activeCycleId) && (images[0] || images[1] || images[2])) {
        const primary = images[0] || images[1] || images[2]!;
        images[0] = images[0] || primary;
        images[1] = images[1] || primary;
        images[2] = images[2] || primary;
      } else {
        Alert.alert('Photos Required', 'Please upload all 3 photos of your cycle (Front, Side, Details).');
        return;
      }
    }

    const hourlyNum = parseFloat(pricePerHour) || 0;
    const dailyNum = parseFloat(pricePerDay) || 0;

    if (hourlyNum <= 0 || dailyNum <= 0) {
      Alert.alert('Invalid Price', 'Please set valid hourly and daily rental prices.');
      return;
    }

    if (hourlyNum > 100) {
      Alert.alert('Price Exceeded', 'Maximum hourly rate allowed is ₹100.');
      return;
    }

    if (dailyNum > 500) {
      Alert.alert('Price Exceeded', 'Maximum daily rate allowed is ₹500.');
      return;
    }

    setSubmitting(true);
    try {
      const processedImages = await prepareImagesForPayload();
      const cyclePayload = buildCyclePayload('pending', processedImages, hourlyNum, dailyNum);

      console.log('[ListingScreen] Submitting cycle listing to backend:', {
        editing_id: cyclePayload.editing_id,
        isEdit: Boolean(isValidBackendId(activeCycleId)),
      });

      // Submit JSON object to backend
      const res = await apiClient.submitCycleListing(cyclePayload);
      const submittedId =
        res?.editing_id ||
        res?.id ||
        res?.cycle_id ||
        res?.data?.editing_id ||
        res?.data?.id ||
        res?.data?.cycle_id ||
        activeCycleId ||
        null;

      if (submittedId && !activeCycleId) {
        setActiveCycleId(submittedId);
      }

      // Extract only the message from backend response
      const responseMessage =
        res?.message ||
        res?.data?.message ||
        (typeof res === 'string' ? res : 'Your cycle is listed successfully, once it is verified, you will be informed');

      Alert.alert(
        isValidBackendId(activeCycleId) ? 'Cycle Updated! 🚲' : 'Cycle Submitted! 🚲',
        responseMessage,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('CycleOwner', { refresh: Date.now() }),
          },
        ]
      );
    } catch (err: any) {
      if (
        err?.isSessionExpired ||
        err?.message?.toLowerCase().includes('session expired') ||
        err?.message?.toLowerCase().includes('unauthorized') ||
        err?.status === 400 ||
        err?.status === 401
      ) {
        Alert.alert(
          'Sign In Required',
          'Your login session has expired. Please sign in to authenticate your cycle listing.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign In',
              onPress: () => navigation.navigate('Login'),
            },
          ]
        );
      } else {
        Alert.alert('Submission Failed', err.message || 'Unable to submit your cycle listing.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Header
        title={activeCycleId ? 'Edit Cycle' : 'List Your Cycle'}
        showBack
      />

      {loadingInitial ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Loading cycle details...</Text>
        </View>
      ) : (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          {/* Photo Upload Slots */}
          <Text style={styles.sectionTitle}>Cycle Photos (3 Required)</Text>
          <Text style={styles.sectionSubtitle}>
            Upload clear pictures from front, side, and component angles.
          </Text>

          <View style={styles.imagesRow}>
            {images.map((uri, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.imageSlot}
                onPress={() => pickImage(idx)}
                activeOpacity={0.8}
              >
                {uri ? (
                  <Image source={{ uri: getCycleImageUrl(uri) }} style={styles.slotImage} resizeMode="cover" />
                ) : (
                  <View style={styles.placeholderBox}>
                    <Ionicons name="camera-outline" size={26} color={colors.textLight} />
                    <Text style={styles.slotLabel}>Photo {idx + 1}</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Basic Information */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Cycle Specs</Text>

          <Input
            label="Brand"
            placeholder="e.g. Hero, Firefox, Btwin"
            value={brand}
            onChangeText={setBrand}
          />

          <Input
            label="Model"
            placeholder="e.g. Sprint, Rockrider 340"
            value={model}
            onChangeText={setModel}
          />

          {/* Cycle Type Chips */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Cycle Type</Text>
            <View style={styles.chipsWrap}>
              {CYCLE_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.chip, cycleType === t.id && styles.chipActive]}
                  onPress={() => setCycleType(t.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.chipText, cycleType === t.id && styles.chipTextActive]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Cycle Condition Chips */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Cycle Condition</Text>
            <View style={styles.chipsWrap}>
              {CYCLE_CONDITIONS.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, condition === c.id && styles.chipActive]}
                  onPress={() => setCondition(c.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[styles.chipText, condition === c.id && styles.chipTextActive]}
                  >
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Location Selector */}
          <View style={styles.fieldSection}>
            <Text style={styles.fieldLabel}>Pickup Location (Hostel / Landmark)</Text>
            <TouchableOpacity
              style={styles.selectTrigger}
              onPress={() => setLocationModalVisible(true)}
              activeOpacity={0.8}
            >
              <View style={styles.selectTriggerLeft}>
                <Ionicons name="location-sharp" size={18} color={colors.accent} />
                <Text style={styles.selectTriggerValue}>
                  {location || 'Select a campus location'}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
            <Text style={styles.fieldHint}>
              Select the NITK campus location where your cycle can be picked up.
            </Text>
          </View>

          {/* Pricing Inputs */}
          <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Rental Pricing</Text>

          <View style={styles.pricingRow}>
            <View style={{ flex: 1 }}>
              <Input
                label="Price per Hour (₹)"
                placeholder="10"
                keyboardType="numeric"
                value={pricePerHour}
                onChangeText={setPricePerHour}
              />
              <Text style={styles.priceCapHint}>Max ₹100/hr</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Input
                label="Price per Day (₹)"
                placeholder="50"
                keyboardType="numeric"
                value={pricePerDay}
                onChangeText={setPricePerDay}
              />
              <Text style={styles.priceCapHint}>Max ₹500/day</Text>
            </View>
          </View>

          <Input
            label="Description / Additional Notes"
            placeholder="e.g. Helmet available on request, lock combination provided upon pickup."
            value={description}
            onChangeText={setDescription}
            multiline
          />

          {/* Action Buttons: Save Draft & Final Submit */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.saveDraftBtn}
              onPress={handleSaveDraft}
              disabled={savingDraft || submitting}
              activeOpacity={0.8}
            >
              {savingDraft ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <>
                  <Ionicons name="bookmark-outline" size={18} color={colors.primary} />
                  <Text style={styles.saveDraftText}>Save Draft</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.submitBtn}
              onPress={handleSubmit}
              disabled={savingDraft || submitting}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <>
                  <Ionicons name="bicycle-outline" size={20} color={colors.white} />
                  <Text style={styles.submitBtnText}>
                    {activeCycleId ? 'Update Cycle Details' : 'List My Cycle 🚲'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* Location Picker Modal */}
      <Modal
        visible={locationModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Select Campus Location</Text>
                <Text style={styles.modalSubtitle}>NITK Hostels & Landmarks</Text>
              </View>
              <TouchableOpacity
                onPress={() => setLocationModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={NITK_CAMPUS_LOCATIONS}
              keyExtractor={(item) => item}
              renderItem={({ item }) => {
                const isSelected = location === item;
                return (
                  <TouchableOpacity
                    style={[styles.locationItem, isSelected && styles.locationItemActive]}
                    onPress={() => {
                      setLocation(item);
                      setLocationModalVisible(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.locationItemLeft}>
                      <Ionicons
                        name="location-outline"
                        size={18}
                        color={isSelected ? colors.accent : colors.textSecondary}
                      />
                      <Text
                        style={[
                          styles.locationItemText,
                          isSelected && styles.locationItemTextActive,
                        ]}
                      >
                        {item}
                      </Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                    )}
                  </TouchableOpacity>
                );
              }}
              contentContainerStyle={styles.locationsList}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textSecondary,
    fontSize: 14,
  },
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: 60,
  },
  sectionTitle: {
    fontSize: typography.h3.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  sectionSubtitle: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    marginTop: 2,
  },
  imagesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  imageSlot: {
    flex: 1,
    height: 100,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  slotImage: {
    width: '100%',
    height: '100%',
  },
  placeholderBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  slotLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
    fontWeight: '600',
  },
  fieldSection: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 4,
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: '#F0FDF4',
    borderColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
  selectTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surfaceLight,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  selectTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  selectTriggerValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  switchLabel: {
    fontSize: typography.body1.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  switchSub: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
  },
  pricingRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  priceCapHint: {
    fontSize: 11,
    color: colors.textLight,
    marginTop: -8,
    marginBottom: spacing.sm,
    paddingLeft: 2,
  },
  actionsContainer: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  saveDraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 12,
  },
  saveDraftText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    ...shadows.sm,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },

  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '75%',
    paddingBottom: 30,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
  },
  modalSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  locationsList: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    marginVertical: 2,
  },
  locationItemActive: {
    backgroundColor: '#F0FDF4',
  },
  locationItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  locationItemText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  locationItemTextActive: {
    color: colors.accent,
    fontWeight: '700',
  },
});
