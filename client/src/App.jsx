import React, { useState, useEffect } from 'react';
import { apiRequest, getToken, removeToken } from './api';
import LoginView from './views/LoginView';
import Layout from './components/Layout';
import SuperAdminPanel from './views/SuperAdminPanel';
import SupportPanel from './views/SupportPanel';
import CompanyAdminPanel from './views/CompanyAdminPanel';
import ManagerPanel from './views/ManagerPanel';
import EmployeePanel from './views/EmployeePanel';

export function clearBrowserFavicon() {
  try {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
  } catch (e) {
    console.error('Failed to clear favicon:', e);
  }
}

export function setBrowserFavicon(iconUrl) {
  if (!iconUrl) {
    clearBrowserFavicon();
    return;
  }
  try {
    let link = document.querySelector("link[rel*='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.getElementsByTagName('head')[0].appendChild(link);
    }
    link.href = iconUrl;
  } catch (e) {
    console.error('Failed to set favicon:', e);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [systemSettings, setSystemSettings] = useState(null);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('npb_hrms_active_tab') || 'dashboard';
  });

  // Dynamically set or clear browser tab favicon strictly based on authenticated panel
  const applyPanelFavicon = (currentUser, currentCompany, currentSettings) => {
    if (!currentUser) {
      clearBrowserFavicon();
      return;
    }

    if (currentUser.role === 'super_admin') {
      // Super Admin panel: ONLY show Super Admin uploaded favicon
      const superFavicon = currentSettings?.browser_favicon;
      if (superFavicon) {
        setBrowserFavicon(superFavicon);
      } else {
        clearBrowserFavicon();
      }
    } else if (['company_admin', 'manager', 'employee'].includes(currentUser.role)) {
      // Company Admin, Manager, and Employee panels: ONLY show Company uploaded favicon
      const compFavicon = currentCompany?.favicon || currentCompany?.settings?.browser_favicon || currentCompany?.settings?.favicon;
      if (compFavicon) {
        setBrowserFavicon(compFavicon);
      } else {
        clearBrowserFavicon();
      }
    } else {
      clearBrowserFavicon();
    }
  };

  const loadSystemSettings = async () => {
    try {
      const res = await apiRequest('/system/settings');
      if (res.settings) {
        setSystemSettings(res.settings);
        // Do NOT set browser favicon on unauthenticated login page
      }
    } catch (e) {}
  };

  // Verify existing session on initial load or browser refresh
  const restoreSession = async () => {
    const token = getToken();
    if (!token) {
      document.title = 'Sign In - Authentication Portal';
      clearBrowserFavicon();
      setLoading(false);
      return;
    }

    try {
      const [res, sysRes] = await Promise.all([
        apiRequest('/auth/me'),
        apiRequest('/system/settings').catch(() => ({}))
      ]);

      const curSettings = sysRes.settings || systemSettings;
      if (sysRes.settings) {
        setSystemSettings(sysRes.settings);
      }

      setUser(res.user);
      setCompany(res.company);

      // Apply dynamic browser favicon strictly as per authenticated panel
      applyPanelFavicon(res.user, res.company, curSettings);

      // Dynamic browser title post-login
      if (res.user.role === 'super_admin') {
        document.title = 'Super Admin Console - NPB HRMS';
      } else if (res.company?.portalName) {
        document.title = `${res.company.portalName} - HRMS Portal`;
      } else {
        document.title = 'NPB HRMS Portal';
      }

      // If activeTab is default 'dashboard' but role is employee, switch to 'punch'
      const savedTab = localStorage.getItem('npb_hrms_active_tab');
      if (!savedTab && res.user.role === 'employee') {
        setActiveTab('punch');
      }
    } catch (err) {
      console.error('Session restoration failed:', err.message);
      removeToken();
      setUser(null);
      setCompany(null);
      clearBrowserFavicon();
      document.title = 'Sign In - Authentication Portal';
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSystemSettings();
    restoreSession();

    const handleExpired = () => {
      setUser(null);
      setCompany(null);
      clearBrowserFavicon();
      document.title = 'Sign In - Authentication Portal';
    };

    window.addEventListener('auth-expired', handleExpired);
    return () => window.removeEventListener('auth-expired', handleExpired);
  }, []);

  const handleLoginSuccess = (loggedInUser, companyInfo) => {
    // Flag to auto-show and auto-open PIHU assistant on fresh login
    sessionStorage.setItem('pihu_auto_welcome_pending', 'true');
    sessionStorage.removeItem('pihu_removed_from_screen');

    setUser(loggedInUser);
    setCompany(companyInfo);

    // Apply dynamic browser favicon strictly as per authenticated panel
    applyPanelFavicon(loggedInUser, companyInfo, systemSettings);

    if (loggedInUser.role === 'super_admin') {
      document.title = 'Super Admin Console - NPB HRMS';
      setActiveTab('dashboard');
      localStorage.setItem('npb_hrms_active_tab', 'dashboard');
    } else if (loggedInUser.role === 'employee') {
      document.title = `${companyInfo?.portalName || 'NPB'} - Employee Portal`;
      setActiveTab('punch');
      localStorage.setItem('npb_hrms_active_tab', 'punch');
    } else {
      document.title = `${companyInfo?.portalName || 'NPB'} - HRMS Portal`;
      setActiveTab('dashboard');
      localStorage.setItem('npb_hrms_active_tab', 'dashboard');
    }
  };

  const handleSelectTab = (tabId) => {
    setActiveTab(tabId);
    localStorage.setItem('npb_hrms_active_tab', tabId);
  };

  const handleLogout = () => {
    removeToken();
    setUser(null);
    setCompany(null);
    clearBrowserFavicon();
    localStorage.removeItem('npb_hrms_active_tab');
    sessionStorage.removeItem('pihu_auto_welcome_pending');
    sessionStorage.removeItem('pihu_removed_from_screen');
    document.title = 'Sign In - Authentication Portal';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-sky-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">Validating secure session...</p>
        </div>
      </div>
    );
  }

  // If not logged in, render generic login page with zero company branding
  if (!user) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  const handleSystemSettingsUpdate = (s) => {
    setSystemSettings(s);
    if (user?.role === 'super_admin') {
      applyPanelFavicon(user, company, s);
    }
  };

  const handleCompanyUpdate = (updated) => {
    setCompany(prev => {
      const merged = { ...prev, ...updated };
      if (['company_admin', 'manager', 'employee'].includes(user?.role)) {
        applyPanelFavicon(user, merged, systemSettings);
      }
      return merged;
    });
  };

  // Render role-specific panel inside Layout
  const renderPanel = () => {
    switch (user.role) {
      case 'super_admin':
        return (
          <SuperAdminPanel
            user={user}
            activeTab={activeTab}
            onUserUpdate={(updated) => setUser(prev => ({ ...prev, ...updated }))}
            onSystemSettingsUpdate={handleSystemSettingsUpdate}
          />
        );
      case 'support':
        return <SupportPanel user={user} activeTab={activeTab} />;
      case 'company_admin':
        return (
          <CompanyAdminPanel
            company={company}
            user={user}
            activeTab={activeTab}
            onUpdateCompany={handleCompanyUpdate}
          />
        );
      case 'manager':
        return <ManagerPanel user={user} company={company} activeTab={activeTab} />;
      case 'employee':
        return <EmployeePanel user={user} company={company} activeTab={activeTab} onLogout={handleLogout} />;
      default:
        return <div>Unknown role.</div>;
    }
  };

  return (
    <Layout
      user={user}
      company={company}
      systemSettings={systemSettings}
      activeTab={activeTab}
      onSelectTab={handleSelectTab}
      onLogout={handleLogout}
      onUserUpdate={(updatedUser) => setUser(prev => ({ ...prev, ...updatedUser }))}
    >
      {renderPanel()}
    </Layout>
  );
}
