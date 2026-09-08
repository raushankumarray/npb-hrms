import React, { useState, useEffect, useRef } from 'react';
import { Bell, CheckCheck, Clock, ShieldAlert, Calendar, Ticket, Smartphone } from 'lucide-react';
import { apiRequest } from '../api';

export default function NotificationDropdown() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [filterMode, setFilterMode] = useState('unread'); // 'unread' (auto-hide read) | 'all'
  const dropdownRef = useRef(null);

  const fetchNotifications = async () => {
    try {
      const res = await apiRequest('/notifications');
      setNotifications(res.notifications || []);
      setUnreadCount(res.unreadCount || 0);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000); // Poll every 15s for live updates
    return () => clearInterval(interval);
  }, []);

  // Close when clicked outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAllRead = async () => {
    try {
      await apiRequest('/notifications/read-all', { method: 'PUT' });
      setUnreadCount(0);
      setNotifications(notifications.map(n => ({ ...n, is_read: 1 })));
    } catch (err) {
      console.error(err);
    }
  };

  const markSingleRead = async (id) => {
    try {
      await apiRequest(`/notifications/${id}/read`, { method: 'PUT' });
      // Mark as read and auto-hide if in unread mode
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: 1 } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'attendance': return <Clock className="w-4 h-4 text-amber-500" />;
      case 'leave': return <Calendar className="w-4 h-4 text-sky-500" />;
      case 'ticket': return <Ticket className="w-4 h-4 text-emerald-500" />;
      case 'device': return <Smartphone className="w-4 h-4 text-purple-500" />;
      default: return <ShieldAlert className="w-4 h-4 text-blue-500" />;
    }
  };

  // Auto-hide read notifications when in 'unread' mode
  const displayedNotifications = filterMode === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none"
        title="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in">
          {/* Header */}
          <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-slate-800">Notifications</span>
              {unreadCount > 0 && (
                <span className="bg-sky-100 text-sky-700 text-xs px-2 py-0.5 rounded-full font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 transition-colors"
                title="Mark all as read and auto-hide"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                Clear All
              </button>
            )}
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex border-b border-slate-100 text-xs font-semibold bg-slate-50/50">
            <button
              type="button"
              onClick={() => setFilterMode('unread')}
              className={`flex-1 py-2 text-center transition-colors border-b-2 ${
                filterMode === 'unread'
                  ? 'border-sky-600 text-sky-700 font-bold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              Unread (Auto-Hide on Read)
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`flex-1 py-2 text-center transition-colors border-b-2 ${
                filterMode === 'all'
                  ? 'border-sky-600 text-sky-700 font-bold bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              All History
            </button>
          </div>

          {/* Notifications List */}
          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
            {displayedNotifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                <Bell className="w-6 h-6 mx-auto text-slate-300 mb-1" />
                <p className="font-medium text-slate-500">
                  {filterMode === 'unread' ? 'All caught up!' : 'No notifications found'}
                </p>
                <p className="text-[11px] text-slate-400">
                  {filterMode === 'unread'
                    ? 'Read notifications are automatically hidden.'
                    : 'System notices and updates will appear here.'}
                </p>
              </div>
            ) : (
              displayedNotifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => markSingleRead(n.id)}
                  className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-all flex gap-3 ${
                    !n.is_read ? 'bg-sky-50/40' : 'opacity-70 hover:opacity-100'
                  }`}
                  title="Click to mark as read (auto-hides)"
                >
                  <div className="p-2 rounded-xl bg-slate-100 shrink-0 self-start">
                    {getIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`text-xs truncate ${!n.is_read ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                        {n.title}
                      </p>
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0 ml-2" title="Unread" />
                      )}
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                      {n.message}
                    </p>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                      <span>
                        {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(n.created_at).toLocaleDateString()}
                      </span>
                      {!n.is_read && (
                        <span className="text-[9px] text-sky-600 font-medium hover:underline">
                          Click to dismiss
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
