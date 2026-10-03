import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_STORAGE_PREFIX = '@ugo_temp_chat_';

/**
 * Stores messages temporarily for a specific booking.
 */
export async function saveBookingChat(bookingId: string, messages: any[]): Promise<void> {
  if (!bookingId) return;
  try {
    const key = `${CHAT_STORAGE_PREFIX}${bookingId}`;
    await AsyncStorage.setItem(key, JSON.stringify(messages || []));
    console.log(`[chatStorage] Saved ${messages?.length || 0} messages for booking ${bookingId}`);
  } catch (err) {
    console.warn(`[chatStorage] Error saving chat for booking ${bookingId}:`, err);
  }
}

/**
 * Retrieves temporarily cached messages for a specific booking.
 */
export async function getBookingChat(bookingId: string): Promise<any[]> {
  if (!bookingId) return [];
  try {
    const key = `${CHAT_STORAGE_PREFIX}${bookingId}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn(`[chatStorage] Error reading chat for booking ${bookingId}:`, err);
    return [];
  }
}

/**
 * Deletes temporarily cached messages for a specific booking.
 * Must be called when the return completes.
 */
export async function deleteBookingChat(bookingId: string): Promise<void> {
  if (!bookingId) return;
  try {
    const key = `${CHAT_STORAGE_PREFIX}${bookingId}`;
    await AsyncStorage.removeItem(key);
    console.log(`[chatStorage] Deleted temporary chat history for booking ${bookingId}`);
  } catch (err) {
    console.warn(`[chatStorage] Error deleting chat for booking ${bookingId}:`, err);
  }
}

/**
 * Purges ALL temporary chat caches across all bookings.
 * Must be called on user logout so multiple accounts on the same device do not share chats.
 */
export async function clearAllTempChats(): Promise<void> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const chatKeys = allKeys.filter((k) => k.startsWith(CHAT_STORAGE_PREFIX));
    if (chatKeys.length > 0) {
      await AsyncStorage.multiRemove(chatKeys);
      console.log(`[chatStorage] Cleared ${chatKeys.length} temporary chat sessions on logout.`);
    }
  } catch (err) {
    console.warn('[chatStorage] Error clearing temporary chats:', err);
  }
}
