import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { apiRequest, getToken } from '../api';

const NotificationContext = createContext(null);

export function NotificationProvider({ children, onSelectTab, currentUser }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const seenIdsRef = useRef(new Set());
  const initialFetchDone = useRef(false);
  const eventSourceRef = useRef(null);

  // Fetch full notifications list from server
  const fetchNotifications = async () => {
    const token = getToken();
    if (!token) return;

    try {
      const res = await apiRequest('/notifications?limit=40');
      const list = res.notifications || [];
      const unread = res.unreadCount || 0;

      if (!initialFetchDone.current) {
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initialFetchDone.current = true;
      }

      setNotifications(list);
      setUnreadCount(unread);
    } catch (err) {
      // Silently ignore if session expired or offline
    }
  };

  // Connect to Server-Sent Events (SSE) for in-app real-time bell updates
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

    // Reliable fallback polling every 10 seconds
    const interval = setInterval(fetchNotifications, 10000);

    return () => {
      clearInterval(interval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [currentUser?.id]);

  // Mark single as read
  const markSingleRead = async (id) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
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
    } catch (err) {
      console.error(err);
    }
  };

  // Delete notification
  const deleteNotification = async (id) => {
    try {
      await apiRequest(`/notifications/${id}`, { method: 'DELETE' });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  // Handle clicking a notification dropdown item
  const handleOpenNotification = (notif) => {
    if (!notif) return;
    markSingleRead(notif.id);

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
        markSingleRead,
        markAllRead,
        deleteNotification,
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
