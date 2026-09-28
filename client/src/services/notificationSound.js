/**
 * Sound & Native Push Dispatcher for NPB HRMS
 */

// Synthesize pleasant two-tone Android/Material notification chime
export function playNotificationChime() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;

    // Tone 1: 880 Hz (A5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(880, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.2, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.22);

    // Tone 2: 1318.5 Hz (E6 - pleasant harmonic fifth)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.07);
    gain2.gain.setValueAtTime(0, now + 0.07);
    gain2.gain.linearRampToValueAtTime(0.25, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.07);
    osc2.stop(now + 0.42);
  } catch (e) {
    // Audio context may be restricted before initial user gesture
  }
}

// Vibrate mobile device (if supported)
export function triggerDeviceVibration() {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate([180, 80, 180]);
    } catch (e) {}
  }
}

/**
 * Trigger native browser/phone system notification tray alert.
 * Works seamlessly on Android Chrome, Samsung Internet, desktop browsers.
 */
export async function dispatchNativeNotification({ title, message, link, tab, id }) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const notifOptions = {
    body: message || '',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    vibrate: [200, 100, 200],
    tag: `hrms-${id || Date.now()}`,
    renotify: true,
    data: {
      url: link || '/',
      tab: tab || null
    }
  };

  // Primary: Use Service Worker registration on mobile Android Chrome
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title || 'NPB HRMS Notification', notifOptions);
        return;
      }
    } catch (err) {
      console.warn('SW showNotification error:', err);
    }
  }

  // Fallback: Standard window Notification constructor
  try {
    const notif = new Notification(title || 'NPB HRMS Notification', notifOptions);
    notif.onclick = () => {
      window.focus();
      if (tab && window.__hrmsSelectTab) {
        window.__hrmsSelectTab(tab);
      }
      notif.close();
    };
  } catch (err) {
    console.warn('Window Notification error:', err);
  }
}
