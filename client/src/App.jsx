import React, { useState, useEffect } from 'react';
import { apiRequest, getToken, removeToken } from './api';
import LoginView from './views/LoginView';
import Layout from './components/Layout';
import SuperAdminPanel from './views/SuperAdminPanel';
import SupportPanel from './views/SupportPanel';
import CompanyAdminPanel from './views/CompanyAdminPanel';
import ManagerPanel from './views/ManagerPanel';
import EmployeePanel from './views/EmployeePanel';

export function setBrowserFavicon(iconUrl) {
  if (!iconUrl) return;
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

  const loadSystemSettings = async () => {
    try {
      const res = await apiRequest('/system/settings');
      if (res.settings) {
        setSystemSettings(res.settings);
        if (res.settings.browser_favicon) {
          setBrowserFavicon(res.settings.browser_favicon);
        }
      }
    } catch (e) {}
  };

  // Verify existing session on initial load or browser refresh
  const restoreSession = async () => {
    const token = getToken();
    if (!token) {
      document.title = 'Sign In - Authentication Portal';
      setLoading(false);
      return;
    }

    try {
      const res = await apiRequest('/auth/me');
      setUser(res.user);
      setCompany(res.company);

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
      document.title = 'Sign In - Authentication Portal';
    };

    window.addEventListener('auth-expired', handleExpired);
    return () => window.removeEventListener('auth-expired', handleExpired);
  }, []);

  const handleLoginSuccess = (loggedInUser, companyInfo) => {
    setUser(loggedInUser);
    setCompany(companyInfo);

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
    localStorage.removeItem('npb_hrms_active_tab');
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

  // Render role-specific panel inside Layout
  const renderPanel = () => {
    switch (user.role) {
      case 'super_admin':
        return (
          <SuperAdminPanel
            user={user}
            activeTab={activeTab}
            onUserUpdate={(updated) => setUser(prev => ({ ...prev, ...updated }))}
            onSystemSettingsUpdate={(s) => setSystemSettings(s)}
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
            onUpdateCompany={(updated) => setCompany(prev => ({ ...prev, ...updated }))}
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
