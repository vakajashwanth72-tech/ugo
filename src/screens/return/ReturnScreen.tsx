import { SafeAreaView } from 'react-native-safe-area-context';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ScrollView} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import { Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, typography, borderRadius, shadows } from '../../lib/theme';
import { supabase } from '../../lib/supabase';
import Header from '../../components/ui/Header';
import Button from '../../components/ui/Button';
import { RootStackParamList } from '../../navigation/navigationTypes';

type ReturnRouteProp = RouteProp<RootStackParamList, 'Return'>;
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ReturnScreen() {
  const route = useRoute<ReturnRouteProp>();
  const navigation = useNavigation<NavigationProp>();
  const { bookingId } = route.params;

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [returnSuccess, setReturnSuccess] = useState(false);
  const [returnOtp, setReturnOtp] = useState<string | null>(null);

  const takePhoto = async () => {
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Camera Permission', 'Camera access is required to take a return verification photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
      }
    } catch (err) {
      console.error('Camera error:', err);
    }
  };

  const handleSubmitReturn = async () => {
    if (!photoUri) {
      Alert.alert('Live Photo Required', 'Please take a live camera photo of the parked cycle to proceed.');
      return;
    }

    setSubmitting(true);
    try {
      // 1. Convert photo and upload to Supabase return-images bucket
      const base64 = await FileSystem.readAsStringAsync(photoUri, { encoding: 'base64' });
      const arrayBuffer = decode(base64);
      const filePath = `${bookingId}/${Date.now()}_return.jpg`;

      const { error: uploadErr } = await supabase.storage
        .from('return-images')
        .upload(filePath, arrayBuffer, {
          contentType: 'image/jpeg',
          upsert: false,
        });

      if (uploadErr) {
        throw new Error('Unable to upload return photo.');
      }

      const { data: publicUrlData } = supabase.storage
        .from('return-images')
        .getPublicUrl(filePath);

      const imageUrl = publicUrlData?.publicUrl;

      // 2. Call n8n return-request webhook
      const response = await fetch('https://ugonitk.app.n8n.cloud/webhook/return-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          image_url: imageUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Return request failed (HTTP ${response.status})`);
      }

      // 3. Fetch latest booking to display Return OTP
      const { data: updatedBooking } = await supabase
        .from('booking_table')
        .select('return_otp')
        .eq('id', bookingId)
        .single();

      if (updatedBooking?.return_otp) {
        setReturnOtp(updatedBooking.return_otp);
      }

      setReturnSuccess(true);
    } catch (err: any) {
      Alert.alert('Return Failed', err.message || 'Unable to submit return request.');
    } finally {
      setSubmitting(false);
    }
  };

  if (returnSuccess) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <Header title="Return Processing" />
        <View style={styles.successContent}>
          <View style={styles.successIconCircle}>
            <Ionicons name="checkmark-circle" size={64} color={colors.accent} />
          </View>
          <Text style={styles.successTitle}>Return Request Submitted!</Text>
          <Text style={styles.successSubtitle}>
            Please share this Return OTP with the cycle owner so they can confirm condition and close the rental:
          </Text>

          {returnOtp && (
            <View style={styles.otpBox}>
              <Text style={styles.otpLabel}>Return OTP Code</Text>
              <Text style={styles.otpCode}>{returnOtp}</Text>
            </View>
          )}

          <Button
            title="Go to Ongoing Rentals"
            onPress={() => navigation.navigate('OngoingRentals')}
            size="lg"
            variant="accent"
            style={{ width: '100%', marginTop: spacing.xl }}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <Header title="Return Cycle" showBack />

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        <View style={styles.instructionsBox}>
          <Ionicons name="camera-outline" size={24} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.instructionTitle}>Live Cycle Condition Check</Text>
            <Text style={styles.instructionSub}>
              Park the cycle at the designated pickup/hostel area, lock it, and capture a live camera photo of the locked cycle.
            </Text>
          </View>
        </View>

        {/* Live Photo Enforcement Banner */}
        <View style={styles.liveNoticeBanner}>
          <Ionicons name="shield-checkmark" size={18} color="#0F766E" />
          <Text style={styles.liveNoticeText}>
            Live camera verification only. Gallery uploads are disabled to verify cycle location and condition in real-time.
          </Text>
        </View>

        {/* Photo Preview or Placeholders */}
        <View style={styles.photoContainer}>
          {photoUri ? (
            <>
              <Image source={{ uri: photoUri }} style={styles.previewImage} resizeMode="cover" />
              <View style={styles.verifiedLiveBadge}>
                <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                <Text style={styles.verifiedLiveText}>Live Photo Captured</Text>
              </View>
            </>
          ) : (
            <View style={styles.emptyPreview}>
              <Ionicons name="camera-outline" size={60} color={colors.textLight} />
              <Text style={styles.emptyPreviewText}>No live photo captured yet</Text>
              <Text style={styles.emptyPreviewSub}>Tap the button below to launch the camera</Text>
            </View>
          )}
        </View>

        {/* Live Camera Button */}
        <TouchableOpacity
          style={[styles.cameraActionBtn, photoUri ? styles.retakeBtn : styles.captureBtn]}
          onPress={takePhoto}
          activeOpacity={0.8}
        >
          <Ionicons
            name={photoUri ? 'camera-reverse-outline' : 'camera'}
            size={22}
            color="#FFFFFF"
          />
          <Text style={styles.cameraActionBtnText}>
            {photoUri ? 'Retake Live Photo' : 'Take Live Photo'}
          </Text>
        </TouchableOpacity>

        <Button
          title="Submit Return Photo"
          onPress={handleSubmitReturn}
          loading={submitting}
          disabled={!photoUri}
          size="lg"
          variant="accent"
          style={{ marginTop: spacing.xl }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    padding: spacing.lg,
  },
  instructionsBox: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: spacing.sm,
  },
  instructionTitle: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  instructionSub: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
  },
  liveNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDFA',
    padding: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    marginBottom: spacing.lg,
  },
  liveNoticeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#0F766E',
    lineHeight: 16,
  },
  photoContainer: {
    width: '100%',
    height: 260,
    borderRadius: borderRadius.lg,
    backgroundColor: '#F8FAFC',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    position: 'relative',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  verifiedLiveBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(21, 148, 71, 0.95)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  verifiedLiveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  emptyPreview: {
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  emptyPreviewText: {
    fontSize: typography.body2.fontSize,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  emptyPreviewSub: {
    fontSize: typography.caption.fontSize,
    color: colors.textLight,
    marginTop: 2,
    textAlign: 'center',
  },
  cameraActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    gap: 8,
    elevation: 2,
  },
  captureBtn: {
    backgroundColor: colors.primary,
  },
  retakeBtn: {
    backgroundColor: '#475569',
  },
  cameraActionBtnText: {
    fontSize: typography.body1.fontSize,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  successContent: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  successIconCircle: {
    marginBottom: spacing.md,
  },
  successTitle: {
    fontSize: typography.h2.fontSize,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: typography.body2.fontSize,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  otpBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
  },
  otpLabel: {
    fontSize: typography.caption.fontSize,
    color: colors.textSecondary,
    marginBottom: 6,
  },
  otpCode: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 8,
    color: colors.primary,
  },
});
