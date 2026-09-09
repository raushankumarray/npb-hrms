import React, { useState, useEffect } from 'react';
import {
  User, Mail, Phone, Lock, Shield, Building2,
  CheckCircle, AlertTriangle, RefreshCw, X, Eye, EyeOff, Save, KeyRound
} from 'lucide-react';
import { apiRequest, setToken } from '../api';

export default function UserProfileModal({ isOpen, onClose, user, onUserUpdate }) {
  const [profile, setProfile] = useState({
    fullName: '',
    username: '',
    email: '',
    mobile: '',
    role: '',
    companyName: '',
    department: '',
    designation: '',
    employeeCode: ''
  });

  const [passwordFields, setPasswordFields] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Load fresh user data on modal open
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccess('');
    setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
    setShowPasswordSection(false);

    const loadProfile = async () => {
      setLoading(true);
      try {
        const res = await apiRequest('/auth/me');
        if (res.user) {
          setProfile({
            fullName: res.user.fullName || '',
            username: res.user.username || '',
            email: res.user.email || '',
            mobile: res.user.mobile || '',
            role: res.user.role || '',
            companyName: res.user.companyName || res.company?.name || '',
            department: res.user.department || '',
            designation: res.user.designation || '',
            employeeCode: res.user.employeeCode || ''
          });
        }
      } catch (err) {
        // Fallback to passed user prop
        if (user) {
          setProfile({
            fullName: user.fullName || '',
            username: user.username || '',
            email: user.email || '',
            mobile: user.mobile || '',
            role: user.role || '',
            companyName: user.companyName || '',
            department: user.department || '',
            designation: user.designation || '',
            employeeCode: user.employeeCode || ''
          });
        }
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (showPasswordSection && passwordFields.newPassword) {
      if (passwordFields.newPassword.length < 4) {
        setError('New password must be at least 4 characters long.');
        return;
      }
      if (passwordFields.newPassword !== passwordFields.confirmPassword) {
        setError('New password and confirm password do not match.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        full_name: profile.fullName.trim(),
        username: profile.username.trim(),
        email: profile.email.trim(),
        mobile: profile.mobile.trim()
      };

      if (showPasswordSection && passwordFields.newPassword) {
        payload.new_password = passwordFields.newPassword;
        if (passwordFields.currentPassword) {
          payload.current_password = passwordFields.currentPassword;
        }
      }

      const res = await apiRequest('/auth/profile', {
        method: 'PUT',
        body: payload
      });

      if (res.token) {
        setToken(res.token);
      }

      setSuccess('Profile details saved successfully.');
      if (onUserUpdate && res.user) {
        onUserUpdate(res.user);
      }

      // Reset password fields
      setPasswordFields({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPasswordSection(false);

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const roleBadgeColor = () => {
    switch (profile.role) {
      case 'super_admin': return 'bg-rose-100 text-rose-800 border-rose-200';
      case 'support': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'company_admin': return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'manager': return 'bg-amber-100 text-amber-800 border-amber-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header with Avatar & Role Info */}
        <div className="p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500 to-blue-600 text-white font-black text-lg flex items-center justify-center shadow-md shadow-sky-500/30 uppercase">
              {profile.fullName ? profile.fullName[0] : (profile.username ? profile.username[0] : 'U')}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{profile.fullName || profile.username || 'User Profile'}</span>
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${roleBadgeColor()}`}>
                  {profile.role.replace('_', ' ')}
                </span>
                {profile.employeeCode && (
                  <span className="text-[11px] text-slate-300 font-mono">
                    ID: {profile.employeeCode}
                  </span>
                )}
                {profile.companyName && (
                  <span className="text-[11px] text-slate-300 truncate max-w-[150px]">
                    • {profile.companyName}
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          {loading ? (
            <div className="py-8 flex flex-col items-center justify-center text-slate-400 gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-500" />
              <span>Loading user profile details...</span>
            </div>
          ) : (
            <>
              {/* Primary Identity Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Full Name *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      value={profile.fullName}
                      onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <User className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 block">
                      Username / Login ID *
                    </label>
                    {(user?.role === 'employee' || profile.role === 'employee') && (
                      <span className="text-[10px] text-amber-600 font-medium">
                        Admin Managed
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      required
                      disabled={user?.role === 'employee' || profile.role === 'employee'}
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      placeholder="Username"
                      className={`w-full pl-8 pr-3 py-2 border rounded-xl font-mono text-xs focus:outline-none ${
                        user?.role === 'employee' || profile.role === 'employee'
                          ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-800 focus:ring-2 focus:ring-sky-500'
                      }`}
                    />
                    <Shield className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                  {(user?.role === 'employee' || profile.role === 'employee') && (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Username can only be modified by Company Admin or Manager.
                    </p>
                  )}
                </div>
              </div>

              {/* Contact Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Email Address
                  </label>
                  <div className="relative">
                    <input
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      placeholder="user@example.com"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <Mail className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Mobile Phone
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      value={profile.mobile}
                      onChange={(e) => setProfile({ ...profile, mobile: e.target.value })}
                      placeholder="+91 9876543210"
                      className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-xl focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                    <Phone className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>
              </div>

              {/* Organization & Assignment Read-only Metadata */}
              {(profile.companyName || profile.department || profile.designation) && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-slate-600">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                    Organization Info
                  </div>
                  {profile.companyName && (
                    <div className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-800">{profile.companyName}</span>
                    </div>
                  )}
                  {(profile.department || profile.designation) && (
                    <div className="text-[11px] text-slate-500">
                      {profile.department} {profile.designation ? `• ${profile.designation}` : ''}
                    </div>
                  )}
                </div>
              )}

              {/* Password Section Toggle */}
              <div className="border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <KeyRound className="w-4 h-4 text-sky-600" />
                    Security & Password
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPasswordSection(!showPasswordSection)}
                    className="text-xs font-semibold text-sky-600 hover:text-sky-700"
                  >
                    {showPasswordSection ? 'Hide Password Fields' : 'Change Password'}
                  </button>
                </div>

                {showPasswordSection && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">Leave blank to keep unchanged</span>
                      <button
                        type="button"
                        onClick={() => setShowPasswords(!showPasswords)}
                        className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      >
                        {showPasswords ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showPasswords ? 'Hide' : 'Show'}
                      </button>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">Current Password (Optional)</label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={passwordFields.currentPassword}
                        onChange={(e) => setPasswordFields({ ...passwordFields, currentPassword: e.target.value })}
                        placeholder="Verify current password"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">New Password</label>
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={passwordFields.newPassword}
                          onChange={(e) => setPasswordFields({ ...passwordFields, newPassword: e.target.value })}
                          placeholder="Min 4 characters"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-1">Confirm New Password</label>
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={passwordFields.confirmPassword}
                          onChange={(e) => setPasswordFields({ ...passwordFields, confirmPassword: e.target.value })}
                          placeholder="Re-enter new password"
                          className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-semibold rounded-xl hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-sky-600/20 disabled:opacity-50 transition-all"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Profile Changes</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
