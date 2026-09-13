import React, { useState } from 'react';
import { Lock, User, KeyRound, AlertCircle, CheckCircle2, ArrowRight, Laptop, ShieldAlert, Copy, Search, Ticket, Phone, Mail, Building2, X } from 'lucide-react';
import { apiRequest, setToken } from '../api';

function getDeviceHardwareIdentity() {
  try {
    let macAddress = localStorage.getItem('npb_device_mac');
    if (!macAddress) {
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

      // Produce standardized MAC address format: XX:XX:XX:XX:XX:XX
      const fullHex = (hex1 + hex2).substring(0, 12).toUpperCase();
      macAddress = fullHex.match(/.{1,2}/g).join(':');
      localStorage.setItem('npb_device_mac', macAddress);
    }
    const deviceId = `hw_${macAddress}`;
    localStorage.setItem('npb_device_id', deviceId);
    return { deviceId, macAddress };
  } catch (err) {
    return { deviceId: 'hw_E4:A7:C0:89:1D:2F', macAddress: 'E4:A7:C0:89:1D:2F' };
  }
}

export default function LoginView({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deviceLockError, setDeviceLockError] = useState(null);
  const [copiedMac, setCopiedMac] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotDesc, setForgotDesc] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);

  // Device Deregistration Ticket Modal States
  const [showDeviceTicketModal, setShowDeviceTicketModal] = useState(false);
  const [deviceSearchQuery, setDeviceSearchQuery] = useState('');
  const [searchingDeviceAccount, setSearchingDeviceAccount] = useState(false);
  const [deviceAccountResult, setDeviceAccountResult] = useState(null);
  const [deviceSearchError, setDeviceSearchError] = useState('');
  const [deviceReason, setDeviceReason] = useState('');
  const [raisingDeviceTicket, setRaisingDeviceTicket] = useState(false);
  const [deviceTicketSuccess, setDeviceTicketSuccess] = useState(null);

  const handleSearchDeviceAccount = async (e) => {
    if (e) e.preventDefault();
    if (!deviceSearchQuery.trim()) {
      setDeviceSearchError('Please enter a username, email, or phone number to search.');
      return;
    }
    setSearchingDeviceAccount(true);
    setDeviceSearchError('');
    setDeviceAccountResult(null);
    try {
      const res = await apiRequest('/auth/search-account', {
        method: 'POST',
        body: { query: deviceSearchQuery.trim() }
      });
      if (res.found && res.account) {
        setDeviceAccountResult(res.account);
      } else {
        setDeviceSearchError(res.message || 'No active account found matching this username, email, or phone number.');
      }
    } catch (err) {
      setDeviceSearchError(err.message || 'Failed to search account.');
    } finally {
      setSearchingDeviceAccount(false);
    }
  };

  const handleRaiseDeviceTicket = async (e) => {
    if (e) e.preventDefault();
    if (!deviceAccountResult) return;
    setRaisingDeviceTicket(true);
    setDeviceSearchError('');
    try {
      const { macAddress } = getDeviceHardwareIdentity();
      const res = await apiRequest('/auth/raise-device-ticket', {
        method: 'POST',
        body: {
          userId: deviceAccountResult.id,
          currentMac: macAddress,
          deviceName: navigator.userAgent.includes('Mobile') ? 'Registered Smartphone' : `Workstation (${macAddress})`,
          reason: deviceReason
        }
      });
      setDeviceTicketSuccess(res);
    } catch (err) {
      setDeviceSearchError(err.message || 'Failed to generate device ticket.');
    } finally {
      setRaisingDeviceTicket(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Please enter both username and password.');
      return;
    }

    setLoading(true);
    setError('');
    setDeviceLockError(null);

    try {
      // Deterministic Hardware Device Fingerprint & MAC Address
      const { deviceId, macAddress } = getDeviceHardwareIdentity();

      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: {
          username: username.trim(),
          password,
          device_id: deviceId,
          mac_address: macAddress,
          device_type: navigator.userAgent.includes('Mobile') ? 'Mobile Device' : 'Desktop Workstation',
          device_name: navigator.userAgent.includes('Mobile') ? 'Registered Smartphone' : `Workstation PC (${macAddress})`
        }
      });

      setToken(res.token);
      onLoginSuccess(res.user, res.company);
    } catch (err) {
      setError(err.message);
      if (err.message && (err.message.includes('Device Lock') || err.message.includes('locked to another registered device') || err.message.includes('already bound'))) {
        const { macAddress } = getDeviceHardwareIdentity();
        setDeviceLockError({
          message: err.message,
          currentMac: macAddress
        });
      } else {
        setDeviceLockError(null);
      }
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

        {deviceLockError ? (
          <div className="rounded-xl bg-rose-950/80 border-2 border-rose-500/80 p-4 space-y-3.5 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600/30 text-rose-300 border border-rose-500/50 shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-rose-100 flex items-center gap-1.5">
                  <span>Device Lock Active (1 Device Policy)</span>
                </h4>
                <p className="text-xs text-rose-200/90 leading-relaxed">
                  {deviceLockError.message}
                </p>
              </div>
            </div>

            {/* Current Device Hardware Details */}
            <div className="bg-slate-900/90 p-3 rounded-xl border border-slate-700 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Laptop className="w-4 h-4 text-sky-400 shrink-0" />
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">Your Current Device MAC</span>
                  <span className="font-mono text-xs font-bold text-amber-300 select-all">{deviceLockError.currentMac}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(deviceLockError.currentMac);
                  setCopiedMac(true);
                  setTimeout(() => setCopiedMac(false), 2000);
                }}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-600 transition-colors shrink-0 flex items-center gap-1"
                title="Copy MAC Address to share with Support"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedMac ? 'Copied MAC ✓' : 'Copy MAC'}</span>
              </button>
            </div>

            {/* Support Instructions & Create Deregistration Ticket Button */}
            <div className="p-3 bg-rose-900/50 rounded-xl border border-rose-800/60 text-xs text-rose-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span>Account is locked to another phone or workstation.</span>
                <span className="text-[10px] uppercase font-bold text-rose-300 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800">1 Device Rule</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceTicketModal(true);
                  const initialQuery = username.trim();
                  setDeviceSearchQuery(initialQuery);
                  setDeviceSearchError('');
                  setDeviceTicketSuccess(null);
                  setDeviceAccountResult(null);
                  setDeviceReason('Switching to a new device/phone. Requesting to deregister previous device.');
                  if (initialQuery) {
                    (async () => {
                      setSearchingDeviceAccount(true);
                      try {
                        const res = await apiRequest('/auth/search-account', {
                          method: 'POST',
                          body: { query: initialQuery }
                        });
                        if (res.found && res.account) {
                          setDeviceAccountResult(res.account);
                        } else {
                          setDeviceSearchError(res.message || 'No account found matching this username/email/phone.');
                        }
                      } catch (e) {
                        setDeviceSearchError(e.message || 'Failed to search account.');
                      } finally {
                        setSearchingDeviceAccount(false);
                      }
                    })();
                  }
                }}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white rounded-xl font-bold text-xs shadow-lg shadow-rose-950/50 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
              >
                <Ticket className="w-4 h-4" />
                <span>Create Ticket to Deregister Device →</span>
              </button>
            </div>
          </div>
        ) : error && (
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
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Password
            </label>
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

          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <button
              type="button"
              onClick={() => {
                setShowForgotModal(true);
                setForgotUsername(username.trim());
              }}
              className="hover:text-sky-400 transition-colors"
            >
              Forgot Password?
            </button>
            <button
              type="button"
              onClick={() => {
                setShowDeviceTicketModal(true);
                setDeviceSearchQuery(username.trim());
                setDeviceSearchError('');
                setDeviceTicketSuccess(null);
                setDeviceAccountResult(null);
                setDeviceReason('Switching to a new device/phone. Requesting to deregister previous device.');
              }}
              className="text-rose-400 hover:text-rose-300 transition-colors font-medium flex items-center gap-1"
            >
              <Ticket className="w-3.5 h-3.5" />
              <span>Deregister Device Ticket</span>
            </button>
          </div>
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

      {/* Device Deregistration Ticket Modal */}
      {showDeviceTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-white my-8">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Device Deregistration Request</h3>
                  <p className="text-xs text-slate-400">Submit ticket to unlink previous registered device</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceTicketModal(false);
                  setDeviceTicketSuccess(null);
                  setDeviceAccountResult(null);
                }}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {deviceTicketSuccess ? (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Deregistration Ticket Raised Successfully!</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Ticket Number: <strong className="font-mono text-emerald-300 text-sm">{deviceTicketSuccess.ticketNumber || deviceTicketSuccess.ticket_number}</strong>
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {deviceTicketSuccess.message || 'Your device deregistration request has been queued. Once approved by Support or Admin, previous device binding will be removed.'}
                  </p>
                </div>

                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-700/60 text-xs space-y-1.5 text-slate-300">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">What happens next?</div>
                  <p className="text-slate-400">
                    1. Support or Company Admin will review and approve the deregistration.
                  </p>
                  <p className="text-slate-400">
                    2. This ticket will appear under your <strong>Employee Tickets</strong> console.
                  </p>
                  <p className="text-slate-400">
                    3. After deregistration, login again from this device to automatically register it as your new authorized device.
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeviceTicketModal(false);
                      setDeviceTicketSuccess(null);
                      setDeviceAccountResult(null);
                    }}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors"
                  >
                    Done / Return to Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Search Account Form */}
                <form onSubmit={handleSearchDeviceAccount} className="space-y-3">
                  <label className="block text-xs font-medium text-slate-300">
                    Search Account (Username, Email, or Phone Number)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={deviceSearchQuery}
                        onChange={(e) => setDeviceSearchQuery(e.target.value)}
                        placeholder="Enter username, email, or mobile..."
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-rose-500"
                        required
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searchingDeviceAccount || !deviceSearchQuery.trim()}
                      className="px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 shrink-0"
                    >
                      {searchingDeviceAccount ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>Search</span>
                    </button>
                  </div>
                </form>

                {deviceSearchError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{deviceSearchError}</span>
                  </div>
                )}

                {/* Account Details Found */}
                {deviceAccountResult && (
                  <div className="bg-slate-900/90 rounded-xl p-4 border border-slate-700 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <User className="w-4 h-4 text-sky-400" />
                          <span>{deviceAccountResult.fullName || deviceAccountResult.full_name || deviceAccountResult.username}</span>
                        </h4>
                        <span className="text-[11px] text-slate-400 font-mono">@{deviceAccountResult.username} ({deviceAccountResult.role})</span>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-sky-400 bg-sky-950/80 px-2.5 py-1 rounded-lg border border-sky-800">
                          <Building2 className="w-3 h-3" />
                          <span>{deviceAccountResult.companyName || deviceAccountResult.company_name || 'Organization'}</span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Registered Phone</span>
                        <span className="font-mono text-slate-200">{deviceAccountResult.maskedMobile || deviceAccountResult.mobile || 'Not set'}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Registered Email</span>
                        <span className="font-mono text-slate-200">{deviceAccountResult.maskedEmail || deviceAccountResult.email || 'Not set'}</span>
                      </div>
                      <div className="col-span-2 pt-1">
                        <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Currently Bound Device MAC</span>
                        <span className="font-mono text-amber-300 font-semibold text-xs">
                          {deviceAccountResult.boundDevice?.macAddress || deviceAccountResult.current_bound_mac || 'None / Not bound'}
                        </span>
                      </div>
                    </div>

                    {/* New Device Information */}
                    <div className="pt-2 border-t border-slate-800">
                      <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <Laptop className="w-4 h-4 text-emerald-400" />
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">This Device MAC</span>
                            <span className="font-mono text-emerald-400 font-bold">{getDeviceHardwareIdentity().macAddress}</span>
                          </div>
                        </div>
                        <span className="text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded font-semibold">
                          Target New Device
                        </span>
                      </div>
                    </div>

                    {/* Ticket Reason & Submit */}
                    <form onSubmit={handleRaiseDeviceTicket} className="space-y-3 pt-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          Reason for Device Deregistration *
                        </label>
                        <textarea
                          rows={2}
                          value={deviceReason}
                          onChange={(e) => setDeviceReason(e.target.value)}
                          placeholder="e.g. Purchased new phone / old laptop reformatted. Please deregister old MAC address."
                          className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDeviceAccountResult(null);
                            setDeviceSearchError('');
                          }}
                          className="px-3 py-2 text-xs text-slate-400 hover:text-white"
                        >
                          Cancel Search
                        </button>
                        <button
                          type="submit"
                          disabled={raisingDeviceTicket}
                          className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-rose-950/50 flex items-center gap-1.5 transition-all"
                        >
                          {raisingDeviceTicket ? (
                            <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Ticket className="w-3.5 h-3.5" />
                          )}
                          <span>{raisingDeviceTicket ? 'Submitting Ticket...' : 'Raise Deregistration Ticket'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
