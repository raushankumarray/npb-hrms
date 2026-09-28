import React, { useEffect, useState, useRef } from 'react';
import {
  Bell, X, ExternalLink, Clock, Calendar, CheckCircle2,
  ShieldAlert, Smartphone, Ticket, ArrowRight, Sparkles, Building2
} from 'lucide-react';

export default function AndroidNotificationCard({
  notification,
  onDismiss,
  onOpen
}) {
  const [isEntering, setIsEntering] = useState(true);
  const [touchStartX, setTouchStartX] = useState(0);
  const [touchTranslateX, setTouchTranslateX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsEntering(false), 30);
    return () => clearTimeout(timer);
  }, []);

  // Format relative timestamp
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Just now';
    try {
      const now = Date.now();
      const past = new Date(timestamp).getTime();
      const diffMs = now - past;
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) return 'Just now';
      if (diffMins === 1) return '1 minute ago';
      if (diffMins < 60) return `${diffMins} minutes ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours === 1) return '1 hour ago';
      if (diffHours < 24) return `${diffHours} hours ago`;
      return `${Math.floor(diffHours / 24)}d ago`;
    } catch (e) {
      return 'Just now';
    }
  };

  const getIcon = (type) => {
    switch (type) {
      case 'attendance':
        return <Clock className="w-4 h-4 text-amber-500" />;
      case 'leave':
        return <Calendar className="w-4 h-4 text-sky-500" />;
      case 'ticket':
        return <Ticket className="w-4 h-4 text-emerald-500" />;
      case 'device':
        return <Smartphone className="w-4 h-4 text-purple-500" />;
      case 'system':
      default:
        return <CheckCircle2 className="w-4 h-4 text-sky-600" />;
    }
  };

  const getSourceLabel = (type) => {
    switch (type) {
      case 'attendance': return 'Attendance & Punch';
      case 'leave': return 'Leave Management';
      case 'ticket': return 'Helpdesk & Support';
      case 'device': return 'Security & Device Binding';
      case 'shift': return 'Shift Management';
      default: return 'NPB HRMS System';
    }
  };

  // Touch Swipe to Dismiss (Left or Right)
  const handleTouchStart = (e) => {
    setTouchStartX(e.touches[0].clientX);
    setIsSwiping(true);
  };

  const handleTouchMove = (e) => {
    if (!isSwiping) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - touchStartX;
    setTouchTranslateX(diff);
  };

  const handleTouchEnd = () => {
    if (Math.abs(touchTranslateX) > 80) {
      // Swiped far enough -> trigger dismiss animation and remove
      setIsEntering(true);
      setTimeout(() => onDismiss?.(notification.id), 200);
    } else {
      // Reset position
      setTouchTranslateX(0);
    }
    setIsSwiping(false);
  };

  const opacityStyle = isSwiping
    ? Math.max(0.2, 1 - Math.abs(touchTranslateX) / 200)
    : 1;

  return (
    <div
      ref={cardRef}
      onClick={() => onOpen?.(notification)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{
        transform: `translateX(${touchTranslateX}px) ${isEntering ? 'translateY(-16px) scale(0.96)' : 'translateY(0) scale(1)'}`,
        opacity: isEntering ? 0 : opacityStyle,
        transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease'
      }}
      className="group w-full max-w-md bg-white/95 backdrop-blur-md rounded-3xl p-4 shadow-xl shadow-slate-300/35 border border-slate-200/90 cursor-pointer select-none hover:shadow-2xl hover:border-sky-300 transition-all duration-200"
      role="alert"
    >
      {/* Top Header: App Identity • Timestamp • Close button */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0 shadow-2xs">
            {getIcon(notification.type)}
          </div>
          <span className="text-[12px] font-semibold text-slate-800 truncate">
            {getSourceLabel(notification.type)}
          </span>
          <span className="text-slate-400 text-[11px]">•</span>
          <span className="text-[11px] text-slate-500 shrink-0 font-medium">
            {getRelativeTime(notification.created_at)}
          </span>
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
      <div className="pl-8 space-y-1">
        <h4 className="text-sm sm:text-[15px] font-bold text-slate-900 leading-snug group-hover:text-sky-600 transition-colors">
          {notification.title}
        </h4>
        <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed font-normal">
          {notification.message}
        </p>

        {/* Action Prompt matching phone tap prompt */}
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-sky-600 font-semibold">
          <span className="flex items-center gap-1 group-hover:underline">
            <span>Tap to open & view details</span>
            <ExternalLink className="w-3 h-3" />
          </span>
          <span className="text-[10px] text-slate-400 font-normal">Swipe to dismiss</span>
        </div>
      </div>
    </div>
  );
}
