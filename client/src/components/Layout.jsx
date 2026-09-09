import React, { useState, useEffect } from 'react';
import {
  Building2, Users, Calendar, Clock, MapPin, FileSpreadsheet,
  FileText, Ticket, Settings, LogOut, Menu, X, Shield,
  Layers, Compass, UserCheck, ChevronRight, UserCog, Laptop, Edit3, LayoutDashboard, RefreshCw
} from 'lucide-react';
import NotificationDropdown from './NotificationDropdown';
import UserProfileModal from './UserProfileModal';

export default function Layout({ user, company, systemSettings, activeTab, onSelectTab, onLogout, onUserUpdate, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Periodic master auto-sync every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'auto' } }));
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleMasterRefresh = () => {
    setRefreshing(true);
    window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'manual' } }));
    setTimeout(() => setRefreshing(false), 800);
  };

  // Dynamic Post-Login Branding resolution
  const getBranding = () => {
    if (user.role === 'super_admin') {
      return {
        name: systemSettings?.platform_name ? `${systemSettings.platform_name} Super Admin` : 'NPB HRMS Super Admin',
        logo: systemSettings?.platform_logo || null,
        mode: systemSettings?.show_branding_mode || (systemSettings?.platform_logo ? 'both' : 'name_only')
      };
    }

    if (user.role === 'support') {
      return {
        name: 'NPB Support Central',
        logo: null,
        mode: 'name_only'
      };
    }

    if (company) {
      const mode = company.settings?.show_branding_mode || 'both';
      return {
        name: company.portalName || company.name || 'Company Portal',
        logo: company.logo || null,
        mode
      };
    }

    return { name: 'NPB HRMS Portal', logo: null, mode: 'name_only' };
  };

  const branding = getBranding();

  // Navigation Items per Role
  const getNavItems = () => {
    switch (user.role) {
      case 'super_admin':
        return [
          { id: 'dashboard', label: 'Global Dashboard', icon: Layers },
          { id: 'companies', label: 'Company Portals', icon: Building2 },
          { id: 'all-employees', label: 'All Employees Directory', icon: Users },
          { id: 'support-accounts', label: 'Support Accounts', icon: Shield },
          { id: 'attendance', label: 'Global Attendance', icon: Clock },
          { id: 'calendar', label: 'System Calendar', icon: Calendar },
          { id: 'reports', label: 'Global Reports', icon: FileText },
          { id: 'audit-logs', label: 'System Audit Logs', icon: FileSpreadsheet },
          { id: 'settings', label: 'Platform Settings', icon: Settings }
        ];

      case 'support':
        return [
          { id: 'dashboard', label: 'Support Desk', icon: Shield },
          { id: 'attendance-support', label: 'Attendance Support', icon: Clock },
          { id: 'device-support', label: 'Device Binding & Unlock', icon: Laptop },
          { id: 'calendar', label: 'Operations Calendar', icon: Calendar },
          { id: 'tickets', label: 'Helpdesk & Tickets', icon: Ticket },
          { id: 'audit-logs', label: 'Support Audit Logs', icon: FileSpreadsheet }
        ];

      case 'company_admin':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Layers },
          { id: 'employees', label: 'Employees & Staff', icon: Users },
          { id: 'mapping', label: 'Employee Mapping', icon: UserCheck },
          { id: 'attendance', label: 'Attendance', icon: Clock },
          { id: 'corrections', label: 'Attendance Corrections', icon: Edit3 },
          { id: 'calendar', label: 'Company Calendar', icon: Calendar },
          { id: 'leave', label: 'Leave Management', icon: Calendar },
          { id: 'geofences', label: 'Geofencing Master', icon: Compass },
          { id: 'shifts', label: 'Shifts & Rotational', icon: Clock },
          { id: 'holidays', label: 'Holidays & Weekly Off', icon: Calendar },
          { id: 'live-map', label: 'Live Tracking Map', icon: MapPin },
          { id: 'tickets', label: 'Helpdesk & Tickets', icon: Ticket },
          { id: 'reports', label: 'Custom Reports & Export', icon: FileText },
          { id: 'settings', label: 'Company Settings', icon: Settings }
        ];

      case 'manager':
        return [
          { id: 'dashboard', label: 'Dashboard', icon: Layers },
          { id: 'my-employees', label: 'My Employees', icon: Users },
          { id: 'attendance', label: 'Daily Attendance Reports', icon: Clock },
          { id: 'corrections', label: 'Attendance Corrections', icon: Edit3 },
          { id: 'calendar', label: 'Calendar', icon: Calendar },
          { id: 'approvals', label: 'Leave Approvals', icon: Calendar },
          { id: 'live-map', label: 'Live Route & Map', icon: MapPin },
          { id: 'tickets', label: 'Helpdesk & Tickets', icon: Ticket },
          { id: 'reports', label: 'Team Reports', icon: FileText }
        ];

      case 'employee':
        return [
          { id: 'punch', label: 'Dashboard', icon: LayoutDashboard },
          { id: 'calendar', label: 'My Calendar & Attendance', icon: Calendar },
          { id: 'history', label: 'Attendance Logs', icon: Clock },
          { id: 'correction', label: 'Attendance Correction', icon: Edit3 },
          { id: 'leave', label: 'Leave & Balances', icon: Calendar },
          { id: 'tickets', label: 'Helpdesk & Tickets', icon: Ticket },
          { id: 'profile', label: 'My Profile & Security', icon: UserCheck }
        ];

      default:
        return [];
    }
  };

  const navItems = getNavItems();

  const handleNavClick = (tabId) => {
    onSelectTab(tabId);
    setMobileMenuOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Mobile menu toggle & Brand Logo */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Dynamic Post-Login Branding - Clickable to Home / Dashboard */}
            <button
              type="button"
              onClick={() => onSelectTab(user.role === 'employee' ? 'punch' : 'dashboard')}
              className="flex items-center gap-3 text-left focus:outline-none group transition-opacity hover:opacity-90"
              title="Go to Home / Dashboard"
            >
              {(branding.mode === 'logo_only' || branding.mode === 'both') && branding.logo ? (
                <img src={branding.logo} alt="Logo" className="h-8 max-w-[140px] object-contain group-hover:scale-105 transition-transform" />
              ) : (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center text-white font-bold shadow-md shadow-sky-500/20 group-hover:scale-105 transition-transform">
                  <Building2 className="w-5 h-5" />
                </div>
              )}

              {(branding.mode === 'name_only' || branding.mode === 'both') && (
                <div>
                  <h1 className="text-base sm:text-lg font-bold text-slate-900 leading-tight truncate max-w-[180px] sm:max-w-xs group-hover:text-sky-600 transition-colors">
                    {branding.name}
                  </h1>
                </div>
              )}
            </button>

            {/* Active Section Breadcrumb Badge */}
            <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-slate-200">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 text-sky-800 text-xs font-semibold border border-sky-200/70 shadow-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {navItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Header Right Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Master Refresh & Auto-Sync Button */}
            <button
              type="button"
              onClick={handleMasterRefresh}
              disabled={refreshing}
              className="p-2 text-slate-500 hover:text-sky-600 hover:bg-sky-50 rounded-xl transition-all focus:outline-none"
              title="Master Refresh & Instant Sync (Auto-syncs live every 30s)"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-sky-600' : ''}`} />
            </button>

            {/* Notification Bell */}
            <NotificationDropdown />

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

            {/* User Profile Info - Click to View & Edit Full Profile */}
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-100 transition-colors focus:outline-none group text-left"
              title="Click to View / Edit Full Profile & Credentials"
            >
              <div className="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-sky-600 text-white flex items-center justify-center text-xs font-bold uppercase transition-colors shadow-sm">
                {user.fullName ? user.fullName[0] : user.username[0]}
              </div>
              <div className="hidden md:block text-left">
                <p className="text-xs font-semibold text-slate-800 group-hover:text-sky-700 leading-none transition-colors">
                  {user.fullName || user.username}
                </p>
                <p className="text-[10px] text-slate-400 capitalize mt-0.5">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </button>

            {/* Logout Button (Hidden for employee and manager roles as per requirement; available in manager desktop sidebar footer, employee profile & mobile drawer) */}
            {user.role !== 'employee' && user.role !== 'manager' && (
              <button
                onClick={onLogout}
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main App Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-4 space-y-1 overflow-y-auto">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Navigation Menu
          </div>
          <div className="space-y-1 flex-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-sky-50 text-sky-700 font-bold border border-sky-200/60 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Desktop Sidebar Footer for Manager */}
          {user.role === 'manager' && (
            <div className="pt-3 mt-auto border-t border-slate-200">
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs transition-colors shadow-xs"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>
          )}
        </aside>

        {/* Mobile Slide-out Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-64 max-w-[80vw] bg-white h-full shadow-2xl p-4 flex flex-col space-y-1 z-10 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-2">
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Menu
                </span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1 flex-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                        isActive
                          ? 'bg-sky-50 text-sky-700 font-bold'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-sky-600' : 'text-slate-400'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Drawer Footer with User details & Logout Button */}
              <div className="mt-auto pt-4 border-t border-slate-200 flex flex-col gap-2.5 shrink-0">
                <div className="flex items-center gap-2.5 px-2">
                  <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold uppercase shrink-0">
                    {user.fullName ? user.fullName[0] : user.username[0]}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold text-slate-800 truncate">{user.fullName || user.username}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{user.role.replace('_', ' ')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold rounded-xl text-xs transition-colors shadow-xs"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content View Area */}
        <main className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 custom-scrollbar ${user.role === 'employee' ? 'pb-24 md:pb-8' : ''}`}>
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (Strictly Employee Role: 4 Icons) */}
      {user.role === 'employee' && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-3 py-2 flex items-center justify-around md:hidden shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
          <button
            type="button"
            onClick={() => onSelectTab('punch')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'punch'
                ? 'text-sky-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LayoutDashboard className={`w-5 h-5 ${activeTab === 'punch' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 font-medium">Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('calendar')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'calendar'
                ? 'text-sky-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className={`w-5 h-5 ${activeTab === 'calendar' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 font-medium">Calendar</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('leave')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'leave'
                ? 'text-sky-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className={`w-5 h-5 ${activeTab === 'leave' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 font-medium">Leaves</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('correction')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'correction'
                ? 'text-sky-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Edit3 className={`w-5 h-5 ${activeTab === 'correction' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 font-medium">Correction</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('history')}
            className={`flex flex-col items-center justify-center flex-1 py-1 rounded-xl transition-all ${
              activeTab === 'history'
                ? 'text-sky-600 font-bold scale-105'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Clock className={`w-5 h-5 ${activeTab === 'history' ? 'stroke-[2.5]' : 'stroke-[1.75]'}`} />
            <span className="text-[10px] mt-0.5 font-medium">Attendance</span>
          </button>
        </nav>
      )}

      {/* UNIVERSAL USER PROFILE MODAL */}
      <UserProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        user={user}
        onUserUpdate={onUserUpdate}
      />
    </div>
  );
}
