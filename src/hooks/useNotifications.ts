import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../lib/apiClient';
import { NotificationItem } from '../types';

export function useNotifications(_userIdProp?: string) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchNotifications = useCallback(async () => {
    try {
      // Dispatch GET request to api/notifications with Authorization header
      const res = await apiClient.getNotifications();

      const rawList: any[] =
        (res && Array.isArray(res.notifications) && res.notifications) ||
        (res && Array.isArray(res.data) && res.data) ||
        (res && res.data && Array.isArray(res.data.notifications) && res.data.notifications) ||
        (res && res.data && Array.isArray(res.data.payload) && res.data.payload) ||
        (res && Array.isArray(res.payload) && res.payload) ||
        (Array.isArray(res) && res) ||
        [];

      // For every notification, collect the payload response and format cleanly
      const formatted: NotificationItem[] = rawList.map((item: any, index: number) => {
        let payload =
          item.payload_response ??
          item.payload ??
          item.response ??
          item.action_data ??
          item.data ??
          item.details ??
          item.metadata ??
          {};

        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            // Keep original payload
          }
        }

        const id = String(
          item.id ||
          item._id ||
          item.notification_id ||
          item.notificationId ||
          payload?.id ||
          payload?.notification_id ||
          `notif-${Date.now()}-${index}`
        );

        const title =
          item.title ||
          item.subject ||
          item.heading ||
          payload?.title ||
          payload?.subject ||
          'UgO Notification';

        const message =
          item.message ||
          item.body ||
          item.text ||
          item.description ||
          payload?.message ||
          payload?.body ||
          payload?.text ||
          '';

        const type =
          item.type ||
          item.notification_type ||
          item.action_type ||
          payload?.type ||
          payload?.notification_type ||
          'general';

        const actionType =
          item.action_type ||
          item.actionType ||
          item.type ||
          payload?.action_type ||
          payload?.actionType ||
          payload?.type ||
          null;

        const isRead = Boolean(
          item.is_read ??
          item.isRead ??
          item.read ??
          payload?.is_read ??
          payload?.isRead ??
          false
        );

        const createdAt =
          item.created_at ||
          item.createdAt ||
          item.date ||
          item.timestamp ||
          payload?.created_at ||
          payload?.createdAt ||
          new Date().toISOString();

        return {
          id,
          user_id: String(item.user_id || item.userId || payload?.user_id || payload?.userId || ''),
          title,
          message,
          type,
          action_type: actionType,
          action_data: payload,
          payload, // explicitly retain collected payload response
          is_read: isRead,
          created_at: createdAt,
        } as NotificationItem;
      });

      setNotifications(formatted);
    } catch (err: any) {
      console.warn('[useNotifications] Error fetching notifications from api/notifications:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    // Poll every 15 seconds to fetch new notifications in the background
    const interval = setInterval(() => {
      fetchNotifications();
    }, 15000);

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
    try {
      await apiClient.markNotificationRead(id);
    } catch (err) {
      console.warn('[useNotifications] markNotificationRead error:', err);
    }
  };

  const markAllAsRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    for (const notif of notifications) {
      if (!notif.is_read) {
        apiClient.markNotificationRead(notif.id).catch(() => {});
      }
    }
  };

  const deleteNotification = async (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    try {
      await apiClient.deleteNotification(id);
    } catch (err) {
      console.warn('[useNotifications] deleteNotification error:', err);
    }
  };

  const clearAllNotifications = async () => {
    const ids = notifications.map((n) => n.id);
    setNotifications([]);
    for (const id of ids) {
      apiClient.deleteNotification(id).catch(() => {});
    }
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return {
    notifications,
    loading,
    unreadCount,
    refreshNotifications: fetchNotifications,
    refetch: fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAllNotifications,
  };
}
