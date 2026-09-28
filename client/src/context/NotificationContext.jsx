import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiRequest, getToken } from '../api';
import { playNotificationChime, triggerDeviceVibration, dispatchNativeNotification } from '../services/notificationSound';

const NotificationContext = createContext(null);

export function NotificationProvider({ children, onSelectTab, currentUser }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permission, setPermission] = useState(() => {
    return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'denied';
  });
  const [floatingNotifications, setFloatingNotifications] = useState([]);

  const seenIdsRef = useRef(new Set());
  const initialFetchDone = useRef(false);
  const eventSourceRef = useRef(null);

  // Request browser notification permission
  const requestPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      alert('This browser does not support Web Notifications.');
      return 'denied';
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      if (result === 'granted') {
        playNotificationChime();
        triggerDeviceVibration();

        // Dispatch instant confirmation notification
        dispatchNativeNotification({
          title: 'NPB HRMS Notifications Active',
          message: 'Real-time alerts enabled on this device for approvals, requests, and updates.',
          link: '/dashboard',
          id: 'welcome'
        });

        // Add welcome card to floating stack
        const welcomeNotif = {
          id: 'welcome-' + Date.now(),
          title: 'Notifications Successfully Enabled',
          message: 'You will now receive instant phone and browser alerts for approvals, shift assignments, and updates.',
          type: 'system',
          is_read: 0,
          created_at: new Date().toISOString()
        };
        addFloatingNotification(welcomeNotif);
      }
      return result;
    } catch (err) {
      console.warn('Error requesting notification permission:', err);
      return 'denied';
    }
  };

  // Add notification to floating Android toast stack (auto-dismisses after 7 seconds)
  const addFloatingNotification = (notif) => {
    setFloatingNotifications((prev) => {
      // Don't add duplicate
      if (prev.some((n) => n.id === notif.id)) return prev;
      // Keep max 3 notifications on screen at once
      const updated = [notif, ...prev.slice(0, 2)];
      return updated;
    });

    // Auto-dismiss after 7 seconds
    setTimeout(() => {
      dismissFloating(notif.id);
    }, 7000);
  };

  const dismissFloating = (id) => {
    setFloatingNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  // Trigger sound, vibration, native push, and floating card for newly received notification
  const handleIncomingNotification = (notif) => {
    if (!notif || !notif.id) return;
    if (seenIdsRef.current.has(notif.id)) return;
    seenIdsRef.current.add(notif.id);

    // Play pleasant chime & vibrate phone
    playNotificationChime();
    triggerDeviceVibration();

    // Trigger system/browser notification tray alert
    dispatchNativeNotification({
      id: notif.id,
      title: notif.title,
      message: notif.message,
      link: notif.link,
      tab: resolveTabForNotification(notif, currentUser?.role)
    });

    // Show floating Android-style notification card at top
    addFloatingNotification(notif);
  };

  // Fetch full notifications list from server
  const fetchNotifications = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await apiRequest('/notifications?limit=40');
      const list = res.notifications || [];
      const unread = res.unreadCount || 0;

      // Detect any unread notification that we haven't seen in this session
      if (initialFetchDone.current) {
        list.forEach((n) => {
          if (!n.is_read && !seenIdsRef.current.has(n.id)) {
            handleIncomingNotification(n);
          }
        });
      } else {
        // Record existing IDs so we don't alert spam on initial page load
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initialFetchDone.current = true;
      }

      setNotifications(list);
      setUnreadCount(unread);
    } catch (err) {
      // Silently ignore if session expired or offline
    }
  };

  // Connect to Server-Sent Events (SSE) for 0ms Instant Real-time Push
  useEffect(() => {
    const token = getToken();
    if (!token || !currentUser) {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      return;
    }

    // Initial fetch
    fetchNotifications();

    // Connect SSE
    try {
      const sseUrl = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const notif = JSON.parse(event.data);
          if (notif && notif.id) {
            handleIncomingNotification(notif);
            setNotifications((prev) => [notif, ...prev.filter((n) => n.id !== notif.id)]);
            setUnreadCount((c) => c + 1);
          }
        } catch (e) {}
      };

      es.onerror = () => {
        // EventSource will auto-reconnect
      };
    } catch (err) {
      console.warn('SSE connection notice:', err);
    }

    // Reliable fallback polling every 8 seconds
    const interval = setInterval(fetchNotifications, 8000);

    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // Listen for clicks from Service Worker background notifications
  useEffect(() => {
    const handleServiceWorkerMessage = (event) => {
      if (event.data && event.data.type === 'NOTIFICATION_CLICKED') {
        const { tab } = event.data;
        if (tab && onSelectTab) {
          onSelectTab(tab);
        }
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleServiceWorkerMessage);
      return () => navigator.serviceWorker.removeEventListener('message', handleServiceWorkerMessage);
    }
  }, [onSelectTab]);

  // Mark single as read
  const markSingleRead = async (id) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      dismissFloating(id);
    } catch (err) {
      console.error(err);
    }
  };

  // Mark all as read
  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
      setFloatingNotifications([]);
    } catch (err) {
      console.error(err);
    }
  };

  // Delete notification
  const deleteNotification = async (id) => {
    try {
      await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      dismissFloating(id);
    } catch (err) {
      console.error(err);
    }
  };

  // Send a test notification to verify audio & browser popups
  const sendTestNotification = async () => {
    try {
      const res = await apiRequest('/notifications/test', { method: 'POST' });
      if (res.notification) {
        handleIncomingNotification(res.notification);
        setNotifications((prev) => [res.notification, ...prev]);
        setUnreadCount((c) => c + 1);
      }
    } catch (err) {
      console.error('Failed to trigger test notification:', err);
    }
  };

  // Handle clicking a notification card or dropdown item
  const handleOpenNotification = (notif) => {
    if (!notif) return;
    markSingleRead(notif.id);
    dismissFloating(notif.id);

    const targetTab = resolveTabForNotification(notif, currentUser?.role);
    if (targetTab && onSelectTab) {
      onSelectTab(targetTab);
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        permission,
        requestPermission,
        floatingNotifications,
        dismissFloating,
        markSingleRead,
        markAllRead,
        deleteNotification,
        sendTestNotification,
        handleOpenNotification,
        fetchNotifications
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return ctx;
}

// Helper to determine which panel/tab to navigate to based on notification
function resolveTabForNotification(notif, userRole) {
  const type = notif.type || '';
  const link = notif.link || '';
  const title = (notif.title || '').toLowerCase();

  if (type === 'ticket' || link.includes('ticket') || title.includes('ticket')) {
    return 'tickets';
  }

  if (type === 'leave' || link.includes('leave') || title.includes('leave')) {
    if (userRole === 'employee') return 'leave';
    return 'approvals';
  }

  if (type === 'attendance' || link.includes('attendance') || title.includes('punch') || title.includes('correction')) {
    if (userRole === 'employee') {
      return title.includes('correction') ? 'correction' : 'history';
    }
    return title.includes('correction') ? 'approvals' : 'attendance';
  }

  if (title.includes('shift') || link.includes('shift')) {
    if (userRole === 'employee') return 'calendar';
    return 'shifts';
  }

  if (title.includes('weekly off') || link.includes('holiday')) {
    if (userRole === 'employee') return 'calendar';
    return 'holidays';
  }

  if (type === 'device' || title.includes('device')) {
    if (userRole === 'support') return 'device-support';
    if (userRole === 'employee') return 'profile';
    return 'dashboard';
  }

  return userRole === 'employee' ? 'punch' : 'dashboard';
}
