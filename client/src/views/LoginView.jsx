import React, { useState } from 'react';
import {
  Lock,
  User,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Laptop,
  Smartphone,
  Ticket,
  X,
  Eye,
  EyeOff,
  Search,
  ShieldAlert,
  Check
} from 'lucide-react';
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

      // Standardized MAC address format: XX:XX:XX:XX:XX:XX
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

  // Device Deregistration Ticket Modal States
  const [showDeviceTicketModal, setShowDeviceTicketModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchingAccount, setSearchingAccount] = useState(false);
  const [foundAccount, setFoundAccount] = useState(null);
  const [searchError, setSearchError] = useState('');

  const [ticketPassword, setTicketPassword] = useState('');
  const [ticketPasswordVisible, setTicketPasswordVisible] = useState(false);
  const [deviceReason, setDeviceReason] = useState('Switching to a new device. Requesting to de-register previous device.');
  const [raisingDeviceTicket, setRaisingDeviceTicket] = useState(false);
  const [deviceTicketError, setDeviceTicketError] = useState('');
  const [deviceTicketSuccess, setDeviceTicketSuccess] = useState(null);

  const handleOpenTicketModal = (initialQuery = '') => {
    const q = initialQuery || username.trim();
    setSearchQuery(q);
    setFoundAccount(null);
    setSearchError('');
    setTicketPassword(password || '');
    setDeviceTicketError('');
    setDeviceTicketSuccess(null);
    setDeviceReason('Switching to a new device. Requesting to de-register previous device.');
    setShowDeviceTicketModal(true);
    if (q) {
      handleSearchAccount(q);
    }
  };

  const handleSearchAccount = async (overrideQuery) => {
    const q = (overrideQuery !== undefined ? overrideQuery : searchQuery).trim();
    if (!q) {
      setSearchError('Please enter your employee username, phone number, or email to search.');
      return;
    }
    setSearchingAccount(true);
    setSearchError('');
    setFoundAccount(null);
    setDeviceTicketError('');
    try {
      const res = await apiRequest('/auth/search-account', {
        method: 'POST',
        body: { query: q }
      });
      if (res.found && res.account) {
        setFoundAccount(res.account);
      } else {
        setSearchError(res.message || 'No active employee account found matching this username, email, or phone number.');
      }
    } catch (err) {
      setSearchError(err.message || 'Failed to search for employee account.');
    } finally {
      setSearchingAccount(false);
    }
  };

  const handleRaiseDeviceTicket = async (e) => {
    if (e) e.preventDefault();
    if (!foundAccount) {
      setDeviceTicketError('Please search and verify your employee account first.');
      return;
    }
    if (!ticketPassword) {
      setDeviceTicketError('Please enter your account password to verify identity.');
      return;
    }
    if (!deviceReason.trim()) {
      setDeviceTicketError('A valid reason is required to request device de-registration.');
      return;
    }

    setRaisingDeviceTicket(true);
    setDeviceTicketError('');
    try {
      const { macAddress } = getDeviceHardwareIdentity();
      const newDeviceName = navigator.userAgent.includes('Mobile') ? 'Registered Smartphone' : 'Desktop Workstation';
      const oldMac = foundAccount.oldMacAddress || foundAccount.boundDevice?.macAddress || deviceLockError?.registeredDevice?.macAddress || '36:20:D1:15:C1:5D';

      const res = await apiRequest('/auth/raise-device-ticket', {
        method: 'POST',
        body: {
          username: foundAccount.username,
          password: ticketPassword,
          currentMac: macAddress,
          mac_address: macAddress,
          deviceName: newDeviceName,
          device_name: newDeviceName,
          oldMac: oldMac,
          old_mac: oldMac,
          reason: deviceReason.trim()
        }
      });
      setDeviceTicketSuccess(res);
    } catch (err) {
      setDeviceTicketError(err.message || 'Failed to submit de-registration ticket.');
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
      if (err.message && (
        err.message.includes('Device Lock') || 
        err.message.includes('locked to another registered device') || 
        err.message.includes('already bound') ||
        err.message.includes('already registered on another device') ||
        err.message.includes('1-device policy') ||
        err.code === 'DEVICE_BOUND_ANOTHER'
      )) {
        const { macAddress } = getDeviceHardwareIdentity();
        setDeviceLockError({
          message: 'Your account is already registered on another device. If you want to de-register, please raise a ticket.',
          currentMac: macAddress,
          registeredDevice: err.registeredDevice || null
        });
      } else {
        setDeviceLockError(null);
      }
    } finally {
      setLoading(false);
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
          <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-5 space-y-4 shadow-lg animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0 mt-0.5">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 space-y-1">
                <h4 className="text-sm font-bold text-amber-200">
                  Account Already Registered on Another Device
                </h4>
                <p className="text-xs text-amber-300/90 leading-relaxed">
                  Your account is already registered on another device. If you want to de-register, please raise a ticket.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => handleOpenTicketModal(username.trim())}
              className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <Ticket className="w-4 h-4" />
              <span>Raise Ticket to De-register Device</span>
            </button>
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
              Username / Mobile No. / Email
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
                placeholder="Username, Mobile No., or Email"
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
        </form>

        <div className="text-center text-xs text-slate-500">
          Protected by GPS Geofence & Device-Binding Security
        </div>
      </div>

      {/* Device Deregistration Ticket Modal */}
      {showDeviceTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-800 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-white my-8 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-700/80 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Ticket className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Raise De-registration Ticket</h3>
                  <p className="text-xs text-slate-400">Verify employee identity & hardware to request device unbinding</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeviceTicketModal(false);
                  setDeviceTicketSuccess(null);
                  setDeviceTicketError('');
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
                    <span>De-registration Ticket Raised!</span>
                  </div>
                  <p className="text-xs text-emerald-200/90 leading-relaxed">
                    Ticket Number: <strong className="font-mono text-emerald-300 text-sm">#{deviceTicketSuccess.requestId || deviceTicketSuccess.ticketNumber}</strong>
                  </p>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {deviceTicketSuccess.message || 'Your device de-registration request has been submitted to Support.'}
                  </p>
                </div>

                <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-700/60 text-xs space-y-2 text-slate-300">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold flex items-center gap-1.5">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Ticket Tracking & Auto-Closed History</span>
                  </div>
                  <p className="text-slate-400 leading-relaxed">
                    • Your ticket has been logged and routed to the Support Team.
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    • Support will initiate the de-registration process and release your old device lock.
                  </p>
                  <p className="text-slate-400 leading-relaxed">
                    • Once Support de-registers your device and resolves the request, the closed ticket will automatically appear in your <strong className="text-white">Employee Panel &gt; Support &gt; Closed Tickets History</strong>.
                  </p>
                  <p className="text-emerald-400 font-semibold leading-relaxed">
                    • You can then log in directly from this new device!
                  </p>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeviceTicketModal(false);
                      setDeviceTicketSuccess(null);
                      setDeviceTicketError('');
                      setFoundAccount(null);
                      setSearchQuery('');
                      setTicketPassword('');
                    }}
                    className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow transition-colors"
                  >
                    Done / Return to Login
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Step 1: Search Employee Account */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      1. Employee Account Search
                    </label>
                    <span className="text-[10px] text-amber-400 font-medium px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20">
                      Employee Accounts Only
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          if (searchError) setSearchError('');
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSearchAccount();
                          }
                        }}
                        placeholder="Enter username, phone number, or email"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={searchingAccount || !searchQuery.trim()}
                      onClick={() => handleSearchAccount()}
                      className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow flex items-center gap-1.5 transition-colors shrink-0"
                    >
                      {searchingAccount ? (
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      <span>{searchingAccount ? 'Searching...' : 'Search'}</span>
                    </button>
                  </div>
                </div>

                {searchError && (
                  <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <span>{searchError}</span>
                  </div>
                )}

                {/* Found Account Info & Device MAC Comparison */}
                {foundAccount && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-700/80 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white">{foundAccount.fullName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 font-mono border border-sky-500/20 font-semibold">{foundAccount.employeeCode}</span>
                        </div>
                        <p className="text-[11px] text-slate-400">
                          @{foundAccount.username} • {foundAccount.department} ({foundAccount.companyName})
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setFoundAccount(null);
                          setSearchQuery('');
                          setTicketPassword('');
                        }}
                        className="text-[11px] text-sky-400 hover:text-sky-300 font-medium underline"
                      >
                        Search Another
                      </button>
                    </div>

                    {/* Hardware MAC Comparison Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-400 text-[11px] font-semibold">
                          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                          <span>Old Device MAC (Locked)</span>
                        </div>
                        <div className="font-mono text-xs font-bold text-amber-200 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-amber-500/20 break-all select-all">
                          {foundAccount.oldMacAddress || foundAccount.boundDevice?.macAddress || '36:20:D1:15:C1:5D'}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {foundAccount.oldDeviceName || foundAccount.boundDevice?.deviceName || 'Registered Workstation'}
                        </p>
                      </div>

                      <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1.5">
                        <div className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                          {navigator.userAgent.includes('Mobile') ? <Smartphone className="w-3.5 h-3.5 shrink-0" /> : <Laptop className="w-3.5 h-3.5 shrink-0" />}
                          <span>New Device MAC (Current)</span>
                        </div>
                        <div className="font-mono text-xs font-bold text-emerald-300 bg-slate-900/90 px-2.5 py-1.5 rounded-lg border border-emerald-500/20 break-all select-all">
                          {getDeviceHardwareIdentity().macAddress}
                        </div>
                        <p className="text-[10px] text-slate-400 truncate">
                          {navigator.userAgent.includes('Mobile') ? 'Registered Smartphone' : 'Desktop Workstation'}
                        </p>
                      </div>
                    </div>

                    {/* Step 2: Password and Reason Form */}
                    <form onSubmit={handleRaiseDeviceTicket} className="space-y-3.5 pt-2 border-t border-slate-700/80">
                      {deviceTicketError && (
                        <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                          <span>{deviceTicketError}</span>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Account Password *
                        </label>
                        <div className="relative">
                          <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <input
                            type={ticketPasswordVisible ? 'text' : 'password'}
                            value={ticketPassword}
                            onChange={(e) => setTicketPassword(e.target.value)}
                            placeholder="Enter your account login password"
                            className="w-full pl-9 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setTicketPasswordVisible(!ticketPasswordVisible)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-white"
                          >
                            {ticketPasswordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-400 mt-0.5 block">
                          Enter the password used to log into this account to authenticate ownership.
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Reason for De-registration * (Mandatory)
                        </label>
                        <textarea
                          rows={2}
                          value={deviceReason}
                          onChange={(e) => setDeviceReason(e.target.value)}
                          placeholder="e.g. Switched to new phone or workstation, old device damaged or replaced."
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
                          required
                        />
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setShowDeviceTicketModal(false);
                            setDeviceTicketError('');
                          }}
                          className="px-4 py-2 text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={raisingDeviceTicket || !ticketPassword || !deviceReason.trim()}
                          className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold shadow-lg shadow-amber-950/40 flex items-center gap-1.5 transition-all active:scale-[0.99]"
                        >
                          {raisingDeviceTicket ? (
                            <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <Ticket className="w-3.5 h-3.5" />
                          )}
                          <span>{raisingDeviceTicket ? 'Submitting Request...' : 'Raise De-registration Ticket'}</span>
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
