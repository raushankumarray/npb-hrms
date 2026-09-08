import React, { useState } from 'react';
import { Lock, User, KeyRound, AlertCircle, CheckCircle2, ArrowRight } from 'lucide-react';
import { apiRequest, setToken } from '../api';

function getHardwareDeviceFingerprint() {
  try {
    const screenInfo = `${window.screen.width}x${window.screen.height}x${window.screen.colorDepth || 24}`;
    const cpuCores = navigator.hardwareConcurrency || 4;
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const platform = navigator.platform || 'Win32';

    // WebGL GPU Renderer detection
    let gpuRenderer = 'gpu_default';
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'gpu';
        }
      }
    } catch (e) {}

    const rawHardware = `${screenInfo}|${cpuCores}|${timezone}|${platform}|${gpuRenderer}`;

    // Deterministic FNV-1a hash
    let h1 = 0x811c9dc5;
    for (let i = 0; i < rawHardware.length; i++) {
      h1 ^= rawHardware.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193);
    }
    const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');

    let h2 = 0x27d4eb2f;
    for (let i = rawHardware.length - 1; i >= 0; i--) {
      h2 ^= rawHardware.charCodeAt(i);
      h2 = Math.imul(h2, 0x01000193);
    }
    const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');

    // Produce MAC address format: HW:XX:XX:XX:XX:XX:XX
    const fullHex = (hex1 + hex2).substring(0, 12).toUpperCase();
    const macFormat = fullHex.match(/.{1,2}/g).join(':');
    return `hw_${macFormat}`;
  } catch (err) {
    return 'hw_E4:A7:C0:89:1D:2F';
  }
}

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotDesc, setForgotDesc] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Deterministic Hardware Device Fingerprint (Same machine, any browser shares identical ID)
      const hardwareId = getHardwareDeviceFingerprint();
      localStorage.setItem('npb_device_id', hardwareId);

      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: {
          username: username.trim(),
          password,
          device_id: hardwareId,
          device_type: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Workstation',
          device_name: navigator.userAgent.includes('Mobile') ? 'Registered Smartphone' : `Workstation PC (${hardwareId})`
        }
      });

      setToken(res.token);
      onLoginSuccess(res.user, res.company);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setError('Please enter your username.');
      return;
    }

    setForgotLoading(true);
    try {
      const res = await apiRequest('/auth/forgot-password', {
        method: 'POST',
        body: {
          username: forgotUsername.trim(),
          description: forgotDesc
        }
      });
      setForgotMessage(res.message);
      setForgotUsername('');
      setForgotDesc('');
    } catch (err) {
      setError(err.message);
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700">
        <div>
          <div className="mx-auto h-12 w-12 rounded-xl bg-sky-500/10 flex items-center justify-center border border-sky-500/20 text-sky-400">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="mt-4 text-center text-2xl font-bold tracking-tight text-white">
            Sign In to Account
          </h2>
          <p className="mt-1 text-center text-sm text-slate-400">
            Secure Multi-Tenant Authentication Portal
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-sm text-rose-300">{error}</p>
          </div>
        )}

        <form className="mt-8 space-y-5" onSubmit={handleLogin}>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Username
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <User className="w-5 h-5" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="block w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                placeholder="Enter your username"
                autoComplete="username"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-slate-300">
                Password
              </label>
              <button
                type="button"
                onClick={() => {
                  setShowForgotModal(true);
                  setError('');
                  setForgotMessage('');
                }}
                className="text-xs font-medium text-sky-400 hover:text-sky-300"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="w-5 h-5" />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="block w-full pl-10 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-sm"
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white bg-sky-600 hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 transition-colors disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <span>Sign In</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div className="text-center text-xs text-slate-500">
          Protected by GPS Geofence & Device-Binding Security
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-800 border border-slate-700 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-semibold text-white">Reset Password Request</h3>
            <p className="text-sm text-slate-400">
              Submit your username to generate a secure password-reset service ticket for your Administrator/Support.
            </p>

            {forgotMessage ? (
              <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <p className="text-sm text-emerald-300">{forgotMessage}</p>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Your Username
                  </label>
                  <input
                    type="text"
                    value={forgotUsername}
                    onChange={(e) => setForgotUsername(e.target.value)}
                    required
                    placeholder="e.g. amit_kumar"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Additional Details / Reason
                  </label>
                  <textarea
                    rows={3}
                    value={forgotDesc}
                    onChange={(e) => setForgotDesc(e.target.value)}
                    placeholder="e.g. Forgot my password after device update"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    className="px-4 py-2 text-sm text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm font-medium disabled:opacity-50"
                  >
                    {forgotLoading ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            )}

            {forgotMessage && (
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowForgotModal(false)}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
