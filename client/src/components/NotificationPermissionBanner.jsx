import React, { useState, useEffect } from 'react';
import { Bell, Smartphone, X, ShieldCheck } from 'lucide-react';

export default function NotificationPermissionBanner({ permission, onRequestPermission }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = sessionStorage.getItem('npb_notif_banner_dismissed') === 'true';
    setDismissed(isDismissed);
  }, []);

  if (permission !== 'default' || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('npb_notif_banner_dismissed', 'true');
  };

  return (
    <div className="bg-gradient-to-r from-sky-600 via-blue-600 to-indigo-600 text-white px-4 py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm animate-in slide-in-from-top duration-300 relative z-30">
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 mr-2">
        <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-xs">
          <Bell className="w-4 h-4 text-white animate-bounce" />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-white truncate">
            Enable Phone & Browser Notifications
          </p>
          <p className="text-[11px] sm:text-xs text-sky-100 truncate hidden sm:block">
            Get instant real-time alerts for requests, approvals, shift assignments, and tickets directly on your device.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onRequestPermission}
          className="px-3 py-1.5 bg-white text-sky-700 hover:bg-sky-50 font-bold rounded-xl text-xs shadow-sm transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
        >
          <Smartphone className="w-3.5 h-3.5 text-sky-600" />
          <span>Allow Alerts</span>
        </button>

        <button
          type="button"
          onClick={handleDismiss}
          className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          title="Dismiss for this session"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
