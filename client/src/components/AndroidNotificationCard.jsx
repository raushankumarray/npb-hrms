import React, { useEffect, useState } from 'react';
import { Bell, X, ExternalLink, Clock, Calendar, CheckCircle2, ShieldAlert, Smartphone, Ticket } from 'lucide-react';

export default function AndroidNotificationCard({
  notification,
  onDismiss,
  onOpen
}) {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 50);
    return () => clearTimeout(timer);
  }, []);

  const getIcon = (type) => {
    switch (type) {
      case 'attendance':
        return <Clock className="w-3.5 h-3.5 text-amber-500" />;
      case 'leave':
        return <Calendar className="w-3.5 h-3.5 text-sky-500" />;
      case 'ticket':
        return <Ticket className="w-3.5 h-3.5 text-emerald-500" />;
      case 'device':
        return <Smartphone className="w-3.5 h-3.5 text-purple-500" />;
      default:
        return <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />;
    }
  };

  const getSourceLabel = (type) => {
    switch (type) {
      case 'attendance': return 'Attendance System';
      case 'leave': return 'Leave Management';
      case 'ticket': return 'Helpdesk & Support';
      case 'device': return 'Security & Device Binding';
      default: return 'NPB HRMS Portal';
    }
  };

  return (
    <div
      onClick={() => onOpen?.(notification)}
      className={`group w-full max-w-md bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-xl shadow-slate-300/40 border border-slate-200/90 cursor-pointer transition-all duration-300 transform select-none hover:shadow-2xl hover:border-sky-300 ${
        isEntering ? 'opacity-0 -translate-y-4 scale-95' : 'opacity-100 translate-y-0 scale-100'
      }`}
      role="alert"
    >
      {/* Top Header: App Identity • Timestamp • Close button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 shadow-2xs">
            {getIcon(notification.type)}
          </div>
          <span className="text-[11px] font-semibold text-slate-700 truncate">
            {getSourceLabel(notification.type)}
          </span>
          <span className="text-[11px] text-slate-400">•</span>
          <span className="text-[11px] text-slate-500 shrink-0">Just now</span>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss?.(notification.id);
          }}
          className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          title="Dismiss notification"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Main Notification Content */}
      <div className="pl-8">
        <h4 className="text-sm font-bold text-slate-900 leading-snug group-hover:text-sky-600 transition-colors">
          {notification.title}
        </h4>
        <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
          {notification.message}
        </p>

        {/* Action Prompt */}
        <div className="mt-2.5 flex items-center justify-between text-[11px] text-sky-600 font-medium pt-1 border-t border-slate-100">
          <span className="flex items-center gap-1 group-hover:underline">
            <span>Tap to open & view details</span>
            <ExternalLink className="w-3 h-3" />
          </span>
          <span className="text-[10px] text-slate-400">Swipe or tap ✕ to dismiss</span>
        </div>
      </div>
    </div>
  );
}
