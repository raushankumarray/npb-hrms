import React, { useState, useEffect } from 'react';
import {
  Building2, Users, Shield, ShieldCheck, Clock, Plus, CheckCircle, AlertTriangle,
  Bell, Smartphone,
  Ban, ToggleLeft, ToggleRight, Trash2, Edit3, Settings2, Search,
  RefreshCw, FileSpreadsheet, Eye, ArrowUpRight, Key, Lock,
  Upload, Image, Globe, Save, Check, UserCheck, Sparkles, Sliders,
  ChevronLeft, ChevronRight, SlidersHorizontal, Filter, Compass,
  Flame, Database, Radio, DownloadCloud, UploadCloud, LogOut, X
} from 'lucide-react';
import { apiRequest } from '../api';
import CustomExportModal from '../components/CustomExportModal';
import UnifiedCalendar from '../components/UnifiedCalendar';
import EmployeeChangePasswordModal from '../components/EmployeeChangePasswordModal';
import { setBrowserFavicon } from '../App';

export default function SuperAdminPanel({ user, activeTab, onUserUpdate, onSystemSettingsUpdate }) {
  const [companies, setCompanies] = useState([]);
  const [supportUsers, setSupportUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [attendanceRecords, setAttendanceRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [showCreateSupport, setShowCreateSupport] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [selectedCompanyModules, setSelectedCompanyModules] = useState(null); // for editing modules
  const [modulesModalOpen, setModulesModalOpen] = useState(false);

  // Edit Company State
  const [showEditCompany, setShowEditCompany] = useState(false);
  const [editingCompanyId, setEditingCompanyId] = useState(null);
  const [editCompanyForm, setEditCompanyForm] = useState({
    name: '', code: '', email: '', phone: '', address: '', status: 'active',
    plan_expiry_date: '',
    admin_username: '', admin_password: '', admin_email: ''
  });

  // Change Admin Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null); // { companyId, companyName, username }
  const [newPassword, setNewPassword] = useState('');

  // Permanent Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, code }

  // Company Portals Directory, Filter Controls & Pagination State
  const [allCompaniesList, setAllCompaniesList] = useState([]);
  const [companyFilterStatus, setCompanyFilterStatus] = useState('active'); // 'active' (default) | 'suspended' | 'block' | 'all'
  const [selectedCompanyFilter, setSelectedCompanyFilter] = useState('all'); // 'all' | specific company id
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [companyPageSize, setCompanyPageSize] = useState(10); // default 10 rows!
  const [companyCustomPageSize, setCompanyCustomPageSize] = useState('');
  const [companyIsCustomPageSize, setCompanyIsCustomPageSize] = useState(false);
  const [companyPage, setCompanyPage] = useState(1);
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // New Company Form State (Portal Display Name removed as requested)
  const [newComp, setNewComp] = useState({
    name: '', code: '', email: '', phone: '', address: '',
    plan_expiry_date: '',
    admin_username: '', admin_password: '', admin_email: '',
    enable_ai_assistant: true,
    timezone: 'Asia/Kolkata', working_hours_per_day: 8.0,
    half_day_min_hours: 4.0, full_day_min_hours: 8.0,
    show_branding_mode: 'both'
  });

  // New Support User Form State
  const [newSupport, setNewSupport] = useState({
    full_name: '', username: '', password: '', email: '', permission_level: 4, support_level: 'Level 4', enable_ai_assistant: true,
    enable_audit_logs: true,
    assign_scope: 'all', assigned_companies: []
  });

  // Support Account Management States
  const [showEditSupport, setShowEditSupport] = useState(false);
  const [editingSupportId, setEditingSupportId] = useState(null);
  const [editSupportForm, setEditSupportForm] = useState({
    username: '', full_name: '', email: '', permission_level: 4, support_level: 'Level 4', status: 'active', password: '', enable_ai_assistant: false,
    enable_audit_logs: true,
    assign_scope: 'all', assigned_companies: []
  });
  const [supportCompanySearch, setSupportCompanySearch] = useState('');

  const [showSupportPasswordModal, setShowSupportPasswordModal] = useState(false);
  const [supportPasswordTarget, setSupportPasswordTarget] = useState(null); // { userId, username, fullName }
  const [newSupportPassword, setNewSupportPassword] = useState('');

  const [showDeleteSupportModal, setShowDeleteSupportModal] = useState(false);
  const [supportToDelete, setSupportToDelete] = useState(null); // { userId, username, fullName }

  // Support Accounts Pagination State
  const [supportPage, setSupportPage] = useState(1);
  const [supportPageSize, setSupportPageSize] = useState(10);
  const [supportCustomPageSize, setSupportCustomPageSize] = useState('');
  const [supportIsCustomPageSize, setSupportIsCustomPageSize] = useState(false);
  const [supportSearchQuery, setSupportSearchQuery] = useState('');

  // System Settings State
  const [settingsForm, setSettingsForm] = useState({
    platform_name: 'NPB HRMS',
    platform_logo: '',
    browser_favicon: '',
    show_branding_mode: 'both',
    enable_super_admin_ai: false
  });
  const [logoSetAsFavicon, setLogoSetAsFavicon] = useState(false);
  const [adminAccountForm, setAdminAccountForm] = useState({
    username: '',
    full_name: '',
    new_password: '',
    confirm_password: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);

  // Firebase Realtime & Cloud Sync State
  const [firebaseStatus, setFirebaseStatus] = useState({
    configured: false,
    connected: false,
    projectId: null,
    databaseUrl: null,
    source: null,
    hasServiceAccountKey: false,
    services: { firestore: false, realtimeDb: false, fcm: false },
    error: null
  });
  const [firebaseForm, setFirebaseForm] = useState({
    projectId: '',
    databaseUrl: '',
    serviceAccountJson: ''
  });
  const [loadingFirebase, setLoadingFirebase] = useState(false);
  const [savingFirebase, setSavingFirebase] = useState(false);
  const [testingFirebase, setTestingFirebase] = useState(false);
  const [syncingAllFirebase, setSyncingAllFirebase] = useState(false);
  const [fetchingFirebase, setFetchingFirebase] = useState(false);
  const [resettingFirebase, setResettingFirebase] = useState(false);
  const [firebaseSummary, setFirebaseSummary] = useState(null);
  const [firebaseTestResult, setFirebaseTestResult] = useState(null);


  // All Employees Directory State
  const [directoryEmployees, setDirectoryEmployees] = useState([]);
  const [directoryTotal, setDirectoryTotal] = useState(0);
  const [dirPageSize, setDirPageSize] = useState(10);
  const [dirPage, setDirPage] = useState(1);
  const [dirCustomPageSize, setDirCustomPageSize] = useState('');
  const [dirIsCustomPageSize, setDirIsCustomPageSize] = useState(false);
  const [dirCompanyFilter, setDirCompanyFilter] = useState('all');
  const [dirRoleFilter, setDirRoleFilter] = useState('all');
  const [dirStatusFilter, setDirStatusFilter] = useState('all');
  const [dirCityFilter, setDirCityFilter] = useState('all');
  const [dirAvailableCities, setDirAvailableCities] = useState([]);
  const [dirSearchQuery, setDirSearchQuery] = useState('');

  const [showDirPasswordModal, setShowDirPasswordModal] = useState(false);
  const [selectedDirEmployeeForPassword, setSelectedDirEmployeeForPassword] = useState(null);

  const [showEditDirEmployeeModal, setShowEditDirEmployeeModal] = useState(false);
  const [editingDirEmployeeId, setEditingDirEmployeeId] = useState(null);
  const [editDirEmployeeForm, setEditDirEmployeeForm] = useState({
    employee_id: '', full_name: '', email: '', mobile: '',
    department: '', designation: '', city: '', status: 'active', password: ''
  });

  // Master Modules Registry & Company Entitlements State
  const [systemModules, setSystemModules] = useState([]);
  const [loadingModules, setLoadingModules] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [moduleCategoryFilter, setModuleCategoryFilter] = useState('all');
  const [moduleTypeFilter, setModuleTypeFilter] = useState('all'); // 'all' | 'core' | 'custom'
  const [moduleAdoptionFilter, setModuleAdoptionFilter] = useState('all'); // 'all' | 'all_enabled' | 'partial' | 'all_disabled'
  const [moduleSortFilter, setModuleSortFilter] = useState('default'); // 'default' | 'name_asc' | 'adoption_desc'
  const [showCreateModuleModal, setShowCreateModuleModal] = useState(false);
  const [createModuleForm, setCreateModuleForm] = useState({
    name: '',
    key: '',
    category: 'Workforce Management',
    description: ''
  });
  const [creatingModule, setCreatingModule] = useState(false);

  // Manage Company Access Modal State (per module)
  const [showCompanyAccessModal, setShowCompanyAccessModal] = useState(false);
  const [selectedModuleForAccess, setSelectedModuleForAccess] = useState(null);
  const [accessCompanySearch, setAccessCompanySearch] = useState('');
  const [togglingCompanyId, setTogglingCompanyId] = useState(null);

  // Edit / Delete Module State (for custom modules)
  const [showEditModuleModal, setShowEditModuleModal] = useState(false);
  const [moduleToEdit, setModuleToEdit] = useState(null);
  const [editModuleForm, setEditModuleForm] = useState({
    name: '',
    category: '',
    description: '',
    is_active: 1
  });
  const [updatingModule, setUpdatingModule] = useState(false);

  const [showDeleteModuleModal, setShowDeleteModuleModal] = useState(false);
  const [moduleToDelete, setModuleToDelete] = useState(null);
  const [deletingModule, setDeletingModule] = useState(false);

  const fetchSystemModules = async () => {
    try {
      setLoadingModules(true);
      const res = await apiRequest('/modules');
      if (res && res.modules) {
        setSystemModules(res.modules);
      }
    } catch (err) {
      console.error('Failed to load system modules:', err);
    } finally {
      setLoadingModules(false);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {

      if (activeTab === 'all-employees') {
        const queryParams = new URLSearchParams();
        queryParams.append('limit', dirPageSize);
        queryParams.append('offset', (dirPage - 1) * dirPageSize);
        if (dirCompanyFilter !== 'all') queryParams.append('company_id', dirCompanyFilter);
        if (dirRoleFilter !== 'all') queryParams.append('role', dirRoleFilter);
        if (dirStatusFilter !== 'all') queryParams.append('status', dirStatusFilter);
        if (dirCityFilter !== 'all') queryParams.append('city', dirCityFilter);
        if (dirSearchQuery.trim()) queryParams.append('search', dirSearchQuery.trim());

        const empRes = await apiRequest(`/employees?${queryParams.toString()}`);
        setDirectoryEmployees(empRes.employees || []);
        setDirectoryTotal(empRes.total !== undefined ? empRes.total : (empRes.employees || []).length);
        if (empRes.cities) setDirAvailableCities(empRes.cities);

        if (companies.length === 0) {
          const compRes = await apiRequest('/companies');
          setCompanies(compRes.companies || []);
        }
      }
      if (activeTab === 'modules' || activeTab === 'companies' || activeTab === 'dashboard') {
        try {
          const modRes = await apiRequest('/modules');
          if (modRes && modRes.modules) {
            setSystemModules(modRes.modules);
          }
        } catch (e) {}
      }

      if (activeTab === 'modules') {
        try {
          const allRes = await apiRequest('/companies?status=all');
          setAllCompaniesList(allRes.companies || []);
          if (companies.length === 0) {
            setCompanies(allRes.companies || []);
          }
        } catch (e) {}
      }

      if (activeTab === 'companies' || activeTab === 'dashboard') {
        try {
          const allRes = await apiRequest('/companies?status=all');
          setAllCompaniesList(allRes.companies || []);
        } catch (e) {}

        const queryParams = new URLSearchParams();
        if (activeTab === 'companies') {
          if (companyFilterStatus !== 'all') queryParams.append('status', companyFilterStatus);
          if (selectedCompanyFilter !== 'all') queryParams.append('company_id', selectedCompanyFilter);
          if (companySearchQuery.trim()) queryParams.append('search', companySearchQuery.trim());
        }
        const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';
        const res = await apiRequest(`/companies${queryStr}`);
        setCompanies(res.companies || []);
      }
      if (activeTab === 'support-accounts' || activeTab === 'dashboard') {
        const res = await apiRequest('/support/users');
        setSupportUsers(res.supportUsers || []);
      }
      if (activeTab === 'attendance' || activeTab === 'dashboard') {
        const res = await apiRequest('/attendance/list?limit=25');
        setAttendanceRecords(res.records || []);
      }
      if (activeTab === 'audit-logs' || activeTab === 'dashboard') {
        const res = await apiRequest('/support/audit-logs?limit=50');
        setAuditLogs(res.logs || []);
      }
      if (activeTab === 'settings' || activeTab === 'dashboard') {
        try {
          const setRes = await apiRequest('/system/settings');
          if (setRes.settings) {
            setSettingsForm({
              platform_name: setRes.settings.platform_name || 'NPB HRMS',
              platform_logo: setRes.settings.platform_logo || '',
              browser_favicon: setRes.settings.browser_favicon || '',
              show_branding_mode: setRes.settings.show_branding_mode || 'both',
              enable_super_admin_ai: setRes.settings.enable_super_admin_ai === true
            });
            if (setRes.settings.browser_favicon) {
              setBrowserFavicon(setRes.settings.browser_favicon);
            }
          }
        } catch (e) {}

        try {
          const meRes = await apiRequest('/auth/me');
          if (meRes.user) {
            setAdminAccountForm(prev => ({
              ...prev,
              username: meRes.user.username || '',
              full_name: meRes.user.fullName || meRes.user.full_name || ''
            }));
          }
        } catch (e) {}

        try {
          const fbRes = await apiRequest('/system/firebase-status');
          if (fbRes && fbRes.status) {
            setFirebaseStatus(fbRes.status);
            if (fbRes.status.projectId) {
              setFirebaseForm(prev => ({
                ...prev,
                projectId: fbRes.status.projectId || '',
                databaseUrl: fbRes.status.databaseUrl || ''
              }));
            }
          }
        } catch (e) {}
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    const handleMasterRefresh = () => {
      fetchData();
    };
    window.addEventListener('master-refresh', handleMasterRefresh);
    window.addEventListener('npb-realtime-update', handleMasterRefresh);
    return () => {
      window.removeEventListener('master-refresh', handleMasterRefresh);
      window.removeEventListener('npb-realtime-update', handleMasterRefresh);
    };
  }, [activeTab, dirPage, dirPageSize, dirCompanyFilter, dirRoleFilter, dirStatusFilter, dirCityFilter, dirSearchQuery, companyFilterStatus, selectedCompanyFilter, companySearchQuery]);

  // Handle Logo Upload
  const handleLogoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('Logo image must be less than 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setSettingsForm(prev => {
        const next = { ...prev, platform_logo: dataUrl };
        if (logoSetAsFavicon) {
          next.browser_favicon = dataUrl;
          setBrowserFavicon(dataUrl);
        }
        return next;
      });
    };
    reader.readAsDataURL(file);
  };

  // Handle Favicon Upload
  const handleFaviconUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      setError('Favicon image must be less than 1MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setSettingsForm(prev => ({ ...prev, browser_favicon: dataUrl }));
      // Live dynamic update of browser tab icon
      setBrowserFavicon(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  // Save System Settings (Branding, Logo, Favicon)
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingSettings(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/system/settings', {
        method: 'PUT',
        body: settingsForm
      });
      if (settingsForm.browser_favicon) {
        setBrowserFavicon(settingsForm.browser_favicon);
      }
      setSuccess('Platform settings, company logo, and browser favicon updated successfully!');
      if (onSystemSettingsUpdate) {
        onSystemSettingsUpdate(res.settings);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // Save Super Admin Credentials (Username, Password)
  const handleSaveAccount = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (adminAccountForm.new_password) {
      if (adminAccountForm.new_password.length < 4) {
        setError('New password must be at least 4 characters long.');
        return;
      }
      if (adminAccountForm.new_password !== adminAccountForm.confirm_password) {
        setError('New password and confirmation password do not match.');
        return;
      }
    }

    setSavingAccount(true);
    try {
      const payload = {
        username: adminAccountForm.username,
        full_name: adminAccountForm.full_name
      };
      if (adminAccountForm.new_password) {
        payload.password = adminAccountForm.new_password;
      }

      const res = await apiRequest('/system/superadmin/account', {
        method: 'PUT',
        body: payload
      });

      if (res.token) {
        localStorage.setItem('npb_auth_token', res.token);
      }
      if (onUserUpdate && res.user) {
        onUserUpdate(res.user);
      }

      setAdminAccountForm(prev => ({
        ...prev,
        new_password: '',
        confirm_password: ''
      }));

      setSuccess(res.message || 'Super Admin account credentials updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingAccount(false);
    }
  };

  // Fetch Firebase Status
  const fetchFirebaseStatus = async () => {
    try {
      setLoadingFirebase(true);
      const res = await apiRequest('/system/firebase-status');
      if (res && res.status) {
        setFirebaseStatus(res.status);
        if (res.status.projectId) {
          setFirebaseForm(prev => ({
            ...prev,
            projectId: res.status.projectId || '',
            databaseUrl: res.status.databaseUrl || ''
          }));
        }
      }
    } catch (e) {
      console.error('Failed to fetch Firebase status', e);
    } finally {
      setLoadingFirebase(false);
    }
  };

  // Save Firebase Config & Connect
  const handleSaveFirebaseConfig = async (e) => {
    e.preventDefault();
    setSavingFirebase(true);
    setError('');
    setSuccess('');
    setFirebaseTestResult(null);
    try {
      const res = await apiRequest('/system/firebase-config', {
        method: 'POST',
        body: {
          projectId: firebaseForm.projectId,
          databaseUrl: firebaseForm.databaseUrl,
          serviceAccountJson: firebaseForm.serviceAccountJson
        }
      });
      setSuccess(res.message || 'Firebase configuration updated successfully!');
      if (res.status) {
        setFirebaseStatus(res.status);
      } else {
        await fetchFirebaseStatus();
      }
      await fetchData();
      window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'firebase-restore' } }));
      try {
        const bc = new BroadcastChannel('npb_hrms_attendance_sync');
        bc.postMessage({ type: 'FIREBASE_RESTORED', timestamp: Date.now() });
        bc.close();
      } catch (e) {}
    } catch (err) {
      setError(err.message || 'Failed to update Firebase configuration');
    } finally {
      setSavingFirebase(false);
    }
  };

  // Test Firebase Live Connection
  const handleTestFirebaseConnection = async () => {
    setTestingFirebase(true);
    setFirebaseTestResult(null);
    setError('');
    try {
      const res = await apiRequest('/system/firebase-test', {
        method: 'POST'
      });
      setFirebaseTestResult(res);
      if (res.success) {
        setSuccess('Firebase live connection test succeeded!');
        await fetchFirebaseStatus();
      } else {
        setError(res.error || 'Firebase test connection failed');
      }
    } catch (err) {
      setError(err.message || 'Firebase connection test request failed');
      setFirebaseTestResult({ success: false, error: err.message });
    } finally {
      setTestingFirebase(false);
    }
  };

  // Sync All Data to Firebase (Companies, Employees, Users, Attendance, Reports)
  const handleSyncAllFirebase = async () => {
    setSyncingAllFirebase(true);
    setError('');
    try {
      const res = await apiRequest('/system/firebase-sync-all', {
        method: 'POST'
      });
      if (res.success) {
        setSuccess(res.message || 'All company and employee records successfully synchronized to Firebase!');
        await fetchFirebaseStatus();
      } else {
        setError(res.error || 'Failed to sync data to Firebase');
      }
    } catch (err) {
      setError(err.message || 'Failed to sync data to Firebase');
    } finally {
      setSyncingAllFirebase(false);
    }
  };

  // Fetch All Data from Firebase & Restore into Local Website & Database
  const handleFetchAllFirebase = async () => {
    setFetchingFirebase(true);
    setError('');
    setSuccess('');
    setFirebaseSummary(null);
    try {
      const res = await apiRequest('/system/firebase-fetch-all', {
        method: 'POST'
      });
      if (res.success) {
        setSuccess(res.message || 'All company, employee, and account data recovered from Firebase successfully!');
        setFirebaseSummary(res);
        await fetchData(); // Refreshes all companies, employees, users, and attendances in website
        await fetchFirebaseStatus();
        window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'firebase-restore' } }));
        try {
          const bc = new BroadcastChannel('npb_hrms_attendance_sync');
          bc.postMessage({ type: 'FIREBASE_RESTORED', timestamp: Date.now() });
          bc.close();
        } catch (e) {}
      } else {
        setError(res.error || 'Failed to fetch data from Firebase');
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch data from Firebase');
    } finally {
      setFetchingFirebase(false);
    }
  };

  // Disconnect / Change Firebase Account
  const handleResetFirebase = async () => {
    if (!window.confirm('Are you sure you want to disconnect or change this Firebase account? You will be able to enter credentials for another Firebase project.')) {
      return;
    }
    setResettingFirebase(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/system/firebase-reset', {
        method: 'POST'
      });
      setSuccess(res.message || 'Firebase account disconnected. You can now enter credentials for another project.');
      setFirebaseForm({
        projectId: '',
        databaseUrl: '',
        serviceAccountJson: ''
      });
      setFirebaseTestResult(null);
      setFirebaseSummary(null);
      await fetchFirebaseStatus();
      await fetchData(); // Automatically refresh local tables to show zero company data
      window.dispatchEvent(new CustomEvent('master-refresh', { detail: { source: 'firebase-reset' } }));
      try {
        const bc = new BroadcastChannel('npb_hrms_attendance_sync');
        bc.postMessage({ type: 'FIREBASE_DISCONNECTED', timestamp: Date.now() });
        bc.close();
      } catch (e) {}
    } catch (err) {
      setError(err.message || 'Failed to reset Firebase configuration');
    } finally {
      setResettingFirebase(false);
    }
  };

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/companies', {
        method: 'POST',
        body: {
          ...newComp,
          enable_ai_assistant: newComp.enable_ai_assistant === true,
          portal_name: newComp.name.trim()
        }
      });
      setSuccess(`Company "${newComp.name}" created successfully with Admin "${newComp.admin_username}".`);
      setShowCreateCompany(false);
      setNewComp({
        name: '', code: '', email: '', phone: '', address: '',
        admin_username: '', admin_password: '', admin_email: '',
        enable_ai_assistant: true,
        timezone: 'Asia/Kolkata', working_hours_per_day: 8.0,
        half_day_min_hours: 4.0, full_day_min_hours: 8.0,
        show_branding_mode: 'both'
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditCompany = async (comp) => {
    setError('');
    try {
      const res = await apiRequest(`/companies/${comp.id}`);
      setEditingCompanyId(comp.id);
      setEditCompanyForm({
        name: res.company.name || '',
        code: res.company.code || '',
        email: res.company.email || '',
        phone: res.company.phone || '',
        address: res.company.address || '',
        status: res.company.status || 'active',
        plan_expiry_date: res.company.plan_expiry_date || '',
        admin_username: res.adminUser?.username || '',
        admin_password: '',
        admin_email: res.adminUser?.email || ''
      });
      setShowEditCompany(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveEditCompany = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest(`/companies/${editingCompanyId}`, {
        method: 'PUT',
        body: {
          name: editCompanyForm.name.trim(),
          code: editCompanyForm.code.trim().toUpperCase(),
          email: editCompanyForm.email ? editCompanyForm.email.trim() : '',
          phone: editCompanyForm.phone ? editCompanyForm.phone.trim() : '',
          address: editCompanyForm.address,
          status: editCompanyForm.status,
          plan_expiry_date: editCompanyForm.plan_expiry_date ? editCompanyForm.plan_expiry_date : null,
          admin_username: editCompanyForm.admin_username ? editCompanyForm.admin_username.trim() : undefined,
          admin_password: editCompanyForm.admin_password ? editCompanyForm.admin_password.trim() : undefined,
          admin_email: editCompanyForm.admin_email ? editCompanyForm.admin_email.trim() : undefined,
          portal_name: editCompanyForm.name.trim()
        }
      });
      setSuccess(`Company "${editCompanyForm.name}" updated successfully.`);
      setShowEditCompany(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openChangePassword = async (comp) => {
    setError('');
    try {
      const res = await apiRequest(`/companies/${comp.id}`);
      setPasswordTarget({
        companyId: comp.id,
        companyName: comp.name,
        username: res.adminUser?.username || 'admin'
      });
      setNewPassword('');
      setShowPasswordModal(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!newPassword || newPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    try {
      await apiRequest(`/companies/${passwordTarget.companyId}/change-password`, {
        method: 'POST',
        body: { new_password: newPassword.trim() }
      });
      setSuccess(`Admin password for company "${passwordTarget.companyName}" changed successfully.`);
      setShowPasswordModal(false);
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const openDeleteModal = (comp) => {
    setDeleteTarget(comp);
    setShowDeleteModal(true);
  };

  const handleConfirmPermanentDelete = async () => {
    if (!deleteTarget) return;
    setError('');
    try {
      await apiRequest(`/companies/${deleteTarget.id}?permanent=true`, {
        method: 'DELETE'
      });
      setSuccess(`Company "${deleteTarget.name}" and all associated data permanently deleted from database.`);
      setShowDeleteModal(false);
      setSelectedCompanyIds(prev => prev.filter(id => id !== deleteTarget.id));
      setDeleteTarget(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle selection of a single company
  const handleToggleSelectCompany = (id) => {
    setSelectedCompanyIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Select all or deselect all currently displayed companies
  const handleSelectAllCompanies = () => {
    const allVisibleIds = paginatedCompanies.map(c => c.id);
    const areAllSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selectedCompanyIds.includes(id));
    if (areAllSelected) {
      setSelectedCompanyIds([]);
    } else {
      setSelectedCompanyIds(allVisibleIds);
    }
  };

  // Bulk Permanent Hard Delete
  const handleBulkDeleteCompanies = async () => {
    if (selectedCompanyIds.length === 0) return;
    setBulkDeleting(true);
    setError('');
    try {
      const res = await apiRequest('/companies/bulk-delete', {
        method: 'POST',
        body: { company_ids: selectedCompanyIds }
      });
      setSuccess(res.message || `Permanently deleted ${selectedCompanyIds.length} company portal(s) and all associated records.`);
      setSelectedCompanyIds([]);
      setShowBulkDeleteModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleCreateSupport = async (e) => {
    e.preventDefault();
    setError('');
    const assigned = newSupport.assign_scope === 'all' ? 'all' : (newSupport.assigned_companies || []);
    if (newSupport.assign_scope === 'custom' && (!assigned || assigned.length === 0)) {
      setError('Please select at least one company to assign, or choose "All Companies".');
      return;
    }
    const rawLvl = newSupport.support_level || newSupport.permission_level || 4;
    const digits = String(rawLvl).replace(/\D/g, '');
    const pLvl = Math.min(Math.max(digits ? parseInt(digits, 10) : (typeof rawLvl === 'number' ? rawLvl : 4), 1), 4);
    const sLvl = `Level ${pLvl}`;

    try {
      await apiRequest('/support/users', {
        method: 'POST',
        body: {
          ...newSupport,
          permission_level: pLvl,
          support_level: sLvl,
          assigned_companies: assigned,
          enable_ai_assistant: newSupport.enable_ai_assistant === true,
          enable_audit_logs: newSupport.enable_audit_logs === true
        }
      });
      setSuccess(`Support account "${newSupport.username}" created successfully with ${sLvl} permissions.`);
      setShowCreateSupport(false);
      setNewSupport({ full_name: '', username: '', password: '', email: '', permission_level: 4, support_level: 'Level 4', enable_ai_assistant: true, enable_audit_logs: true, assign_scope: 'all', assigned_companies: [] });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditSupport = (s) => {
    setError('');
    setEditingSupportId(s.user_id);
    let parsedAssigned = [];
    let scope = 'all';
    if (s.assigned_companies && s.assigned_companies !== 'all' && s.assigned_companies !== '*') {
      try {
        const p = typeof s.assigned_companies === 'string' ? JSON.parse(s.assigned_companies) : s.assigned_companies;
        if (Array.isArray(p)) {
          parsedAssigned = p.map(Number).filter(n => !isNaN(n));
          scope = 'custom';
        }
      } catch (e) {
        parsedAssigned = String(s.assigned_companies).split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
        scope = parsedAssigned.length > 0 ? 'custom' : 'all';
      }
    }
    const rawLvl = s.support_level || s.permission_level || 1;
    const digits = String(rawLvl).replace(/\D/g, '');
    const pLvl = Math.min(Math.max(digits ? parseInt(digits, 10) : (typeof rawLvl === 'number' ? rawLvl : 1), 1), 4);
    const sLvl = `Level ${pLvl}`;

    setEditSupportForm({
      username: s.username || '',
      full_name: s.full_name || '',
      email: s.email || '',
      permission_level: pLvl,
      support_level: sLvl,
      status: s.status || 'active',
      password: '',
      enable_ai_assistant: s.enable_ai_assistant === 1 || s.enable_ai_assistant === true,
      enable_audit_logs: s.enable_audit_logs !== 0 && s.enable_audit_logs !== false,
      assign_scope: scope,
      assigned_companies: parsedAssigned
    });
    setSupportCompanySearch('');
    setShowEditSupport(true);
  };

  const handleSaveEditSupport = async (e) => {
    e.preventDefault();
    setError('');
    const assigned = editSupportForm.assign_scope === 'all' ? 'all' : (editSupportForm.assigned_companies || []);
    if (editSupportForm.assign_scope === 'custom' && (!assigned || assigned.length === 0)) {
      setError('Please select at least one company to assign, or choose "All Companies".');
      return;
    }
    const rawLvl = editSupportForm.support_level || editSupportForm.permission_level || 1;
    const digits = String(rawLvl).replace(/\D/g, '');
    const pLvl = Math.min(Math.max(digits ? parseInt(digits, 10) : (typeof rawLvl === 'number' ? rawLvl : 1), 1), 4);
    const sLvl = `Level ${pLvl}`;

    try {
      await apiRequest(`/support/users/${editingSupportId}`, {
        method: 'PUT',
        body: {
          username: editSupportForm.username.trim(),
          full_name: editSupportForm.full_name.trim(),
          email: editSupportForm.email ? editSupportForm.email.trim() : null,
          permission_level: pLvl,
          support_level: sLvl,
          status: editSupportForm.status,
          password: editSupportForm.password ? editSupportForm.password.trim() : undefined,
          enable_ai_assistant: editSupportForm.enable_ai_assistant === true,
          enable_audit_logs: editSupportForm.enable_audit_logs === true,
          assigned_companies: assigned
        }
      });
      setSuccess(`Support account "${editSupportForm.username}" updated successfully with ${sLvl}.`);
      setShowEditSupport(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openSupportPasswordModal = (s) => {
    setError('');
    setSupportPasswordTarget({ userId: s.user_id, username: s.username, fullName: s.full_name });
    setNewSupportPassword('');
    setShowSupportPasswordModal(true);
  };

  const handleSaveSupportPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (!newSupportPassword || newSupportPassword.trim().length < 4) {
      setError('Password must be at least 4 characters long.');
      return;
    }
    try {
      await apiRequest(`/support/users/${supportPasswordTarget.userId}/change-password`, {
        method: 'POST',
        body: { new_password: newSupportPassword.trim() }
      });
      setSuccess(`Password for support user "${supportPasswordTarget.username}" updated successfully.`);
      setShowSupportPasswordModal(false);
      setNewSupportPassword('');
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleSupportStatus = async (s) => {
    setError('');
    const newStatus = s.status === 'active' ? 'disabled' : 'active';
    try {
      await apiRequest(`/support/users/${s.user_id}/status`, {
        method: 'PUT',
        body: { status: newStatus }
      });
      setSuccess(`Support account "${s.username}" is now ${newStatus}.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openDeleteSupportModal = (s) => {
    setSupportToDelete({ userId: s.user_id, username: s.username, fullName: s.full_name });
    setShowDeleteSupportModal(true);
  };


  const handleToggleDirEmployeeStatus = async (emp) => {
    try {
      const nextStatus = emp.status === 'active' ? 'suspended' : 'active';
      const res = await apiRequest(`/employees/${emp.id}/toggle-status`, {
        method: 'POST',
        body: { status: nextStatus }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteDirEmployee = async (empId, name) => {
    if (!window.confirm(`Are you sure you want to PERMANENTLY delete personnel "${name}"? This will permanently delete this employee account, user credentials, attendance records, leaves, and device bindings from the website, database, and cloud. This action CANNOT be recovered or undone in the future.`)) return;
    try {
      await apiRequest(`/employees/${empId}`, { method: 'DELETE' });
      setSuccess(`Employee "${name}" has been permanently deleted with zero future recovery.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditDirEmployee = (emp) => {
    setEditingDirEmployeeId(emp.id);
    setEditDirEmployeeForm({
      employee_id: emp.employee_id || '',
      full_name: emp.full_name || '',
      email: emp.email || '',
      mobile: emp.mobile || '',
      department: emp.department || '',
      designation: emp.designation || '',
      city: emp.city || '',
      status: emp.status || 'active',
      password: ''
    });
    setShowEditDirEmployeeModal(true);
  };

  const handleSaveEditDirEmployee = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/employees/${editingDirEmployeeId}`, {
        method: 'PUT',
        body: editDirEmployeeForm
      });
      setSuccess(`Employee "${editDirEmployeeForm.full_name}" updated successfully.`);
      setShowEditDirEmployeeModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleConfirmDeleteSupport = async () => {
    if (!supportToDelete) return;
    setError('');
    try {
      await apiRequest(`/support/users/${supportToDelete.userId}`, {
        method: 'DELETE'
      });
      setSuccess(`Support account "${supportToDelete.username}" deleted successfully.`);
      setShowDeleteSupportModal(false);
      setSupportToDelete(null);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const updateCompanyStatus = async (id, status) => {
    try {
      await apiRequest(`/companies/${id}`, {
        method: 'PUT',
        body: { status }
      });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteCompany = async (id, name) => {
    if (!window.confirm(`Are you sure you want to permanently delete company "${name}"? All company details, accounts, employees, and records will be permanently removed from the database.`)) return;
    try {
      await apiRequest(`/companies/${id}?permanent=true`, { method: 'DELETE' });
      setSuccess(`Company "${name}" and all associated data permanently deleted from database.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const AVAILABLE_MODULES = [
    { key: 'employees', label: 'Dynamic Form of Employee & Staff', desc: 'Employee onboarding, dynamic staff profiles, and personnel management' },
    { key: 'mapping', label: 'Employee Mapping & Supervisors', desc: 'Hierarchy mapping and multi-level manager assignments' },
    { key: 'attendance_punch', label: 'Attendance Punch Feature', desc: 'GPS mobile & desktop attendance punch clock for general staff' },
    { key: 'manager_punch', label: 'Manager Attendance Punch', desc: 'Enable attendance punch features directly for team managers' },
    { key: 'corrections', label: 'Attendance Approvals & Corrections', desc: 'Attendance correction requests, approval workflows, and audit records' },
    { key: 'leave_management', label: 'Leave Management & Balances', desc: 'Leave requests, quota tracking, and balance deduction' },
    { key: 'geofencing', label: 'Geofencing Master', desc: 'Office boundary geofencing, radius enforcement, and GPS verification' },
    { key: 'shift_management', label: 'Shift Management & Rotational', desc: 'Shift scheduling, rotational assignments, and working hours' },
    { key: 'holidays', label: 'Holidays & Weekly Off', desc: 'Company holiday master calendar, public holidays, and weekly off policies' },
    { key: 'live_tracking', label: 'Live Tracking & Route Map', desc: 'Real-time location map, staff movement tracking, and breadcrumb trails' },
    { key: 'tickets', label: 'Helpdesk & Support Tickets', desc: 'Employee issue reporting, service requests, and resolution chat' },
    { key: 'calendar', label: 'Company Calendar', desc: 'Unified company events, employee milestones, and attendance calendar' },
    { key: 'reports', label: 'Custom Reports & Export', desc: 'Dynamic Excel, PDF matrix export, and historical attendance reports' },
    { key: 'payroll', label: 'Payroll Module', desc: 'Salary slip generation, payroll calculation, and compensation data' },
    { key: 'ai_assistant', label: 'Pihu AI Assistant', desc: 'Universal AI Assistant for Employee, Manager, and Company Admin panels' },
    { key: 'device_binding', label: '1-Device MAC Address Lock', desc: 'Enforce single device policy per employee with hardware MAC address binding and de-registration tickets' }
  ];

  // Dynamic system modules with fallback to static defaults
  const effectiveModules = systemModules && systemModules.length > 0
    ? systemModules.map(m => ({
        key: m.module_key,
        label: m.name,
        desc: m.description,
        category: m.category || 'General',
        is_core: !!m.is_core,
        is_active: m.is_active !== 0,
        total_companies: m.total_companies || companies.length,
        enabled_companies: m.enabled_companies || 0,
        disabled_companies: m.disabled_companies || 0,
        company_access: m.company_access || []
      }))
    : AVAILABLE_MODULES.map(m => ({
        ...m,
        category: 'Core',
        is_core: true,
        is_active: true,
        total_companies: companies.length,
        enabled_companies: companies.length,
        disabled_companies: 0,
        company_access: []
      }));

  // Filtered and sorted modules based on active filter controls
  const filteredModules = effectiveModules
    .filter(m => {
      // 1. Module Scope / Type
      if (moduleTypeFilter === 'core' && !m.is_core) return false;
      if (moduleTypeFilter === 'custom' && m.is_core) return false;

      // 2. Category
      if (moduleCategoryFilter !== 'all' && m.category !== moduleCategoryFilter) return false;

      // 3. Adoption Status
      const totalComp = m.total_companies || (systemModules[0]?.total_companies || allCompaniesList.length || companies.length || 1);
      const enabledComp = m.enabled_companies || 0;
      if (moduleAdoptionFilter === 'all_enabled' && enabledComp < totalComp) return false;
      if (moduleAdoptionFilter === 'partial' && (enabledComp === 0 || enabledComp >= totalComp)) return false;
      if (moduleAdoptionFilter === 'all_disabled' && enabledComp > 0) return false;

      // 4. Search query
      if (moduleSearch.trim()) {
        const q = moduleSearch.toLowerCase();
        const matchesName = (m.label || '').toLowerCase().includes(q);
        const matchesKey = (m.key || '').toLowerCase().includes(q);
        const matchesDesc = (m.desc || '').toLowerCase().includes(q);
        const matchesCat = (m.category || '').toLowerCase().includes(q);
        if (!matchesName && !matchesKey && !matchesDesc && !matchesCat) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (moduleSortFilter === 'name_asc') {
        return (a.label || '').localeCompare(b.label || '');
      }
      if (moduleSortFilter === 'adoption_desc') {
        const totalA = a.total_companies || 1;
        const totalB = b.total_companies || 1;
        return ((b.enabled_companies || 0) / totalB) - ((a.enabled_companies || 0) / totalA);
      }
      if (a.is_core !== b.is_core) {
        return a.is_core ? -1 : 1;
      }
      return 0;
    });

  const openModulesModal = async (companyId) => {
    try {
      let currentModules = effectiveModules;
      if (systemModules.length === 0) {
        try {
          const modRes = await apiRequest('/modules');
          if (modRes?.modules?.length) {
            setSystemModules(modRes.modules);
            currentModules = modRes.modules.map(m => ({
              key: m.module_key,
              label: m.name,
              desc: m.description,
              category: m.category || 'General',
              is_core: !!m.is_core
            }));
          }
        } catch (e) {}
      }

      const res = await apiRequest(`/companies/${companyId}`);
      // Initialize full module map ensuring all available modules have a defined boolean
      const fullModMap = { ...(res.modules || {}) };
      currentModules.forEach(m => {
        if (fullModMap[m.key] === undefined) {
          // Core modules default to true; custom/new modules default to false (OFF)!
          fullModMap[m.key] = m.is_core ? true : false;
        }
      });
      setSelectedCompanyModules({
        companyId,
        companyName: res.company?.name || 'Company',
        modules: fullModMap
      });
      setModulesModalOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleCompanyModule = (modKey) => {
    if (!selectedCompanyModules) return;
    const currentEnabled = selectedCompanyModules.modules[modKey] === true || selectedCompanyModules.modules[modKey] === 1;
    const nextVal = !currentEnabled;

    const nextModules = {
      ...selectedCompanyModules.modules,
      [modKey]: nextVal
    };

    if (modKey === 'attendance_punch') nextModules.gps_attendance = nextVal;
    if (modKey === 'holidays') {
      nextModules.holiday_management = nextVal;
      nextModules.weekly_off = nextVal;
    }
    if (modKey === 'shift_management') nextModules.rotational_shift = nextVal;
    if (modKey === 'reports') nextModules.custom_reports = nextVal;
    if (modKey === 'tickets') {
      nextModules.service_requests = nextVal;
      nextModules.support_tickets = nextVal;
    }

    setSelectedCompanyModules({
      ...selectedCompanyModules,
      modules: nextModules
    });
  };

  const saveModules = async () => {
    if (!selectedCompanyModules) return;
    try {
      const res = await apiRequest(`/companies/${selectedCompanyModules.companyId}/modules`, {
        method: 'PUT',
        body: { modules: selectedCompanyModules.modules }
      });
      const updatedMods = res?.modules || selectedCompanyModules.modules;
      // Optimistically update local companies state so the row updates immediately
      setCompanies(prev => prev.map(c => 
        c.id === selectedCompanyModules.companyId 
          ? { ...c, modules: { ...(c.modules || {}), ...updatedMods } }
          : c
      ));
      setModulesModalOpen(false);
      setSuccess(`Module configuration for "${selectedCompanyModules.companyName}" updated and synchronized with Firebase successfully.`);
      await fetchSystemModules();
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Handle Module Creation (Default OFF across all companies)
  const handleCreateModule = async (e) => {
    if (e) e.preventDefault();
    if (!createModuleForm.name.trim()) {
      setError('Please enter a module name.');
      return;
    }

    setCreatingModule(true);
    setError('');
    try {
      const payload = {
        name: createModuleForm.name.trim(),
        key: createModuleForm.key.trim() || undefined,
        category: createModuleForm.category.trim() || 'Custom',
        description: createModuleForm.description.trim()
      };
      const res = await apiRequest('/modules', {
        method: 'POST',
        body: payload
      });

      setSuccess(res.message || `Module "${createModuleForm.name}" created successfully. It is set to OFF by default across all company accounts until enabled.`);
      setShowCreateModuleModal(false);
      setCreateModuleForm({ name: '', key: '', category: 'Workforce Management', description: '' });
      await fetchSystemModules();
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreatingModule(false);
    }
  };

  // Handle Quick Toggle Company Module Access from Modules Page
  const handleToggleCompanyModuleAccess = async (companyId, currentVal) => {
    if (!selectedModuleForAccess) return;
    const nextVal = !currentVal;
    setTogglingCompanyId(companyId);
    setError('');
    try {
      const res = await apiRequest(`/modules/${selectedModuleForAccess.module_key}/toggle-company`, {
        method: 'PUT',
        body: { company_id: companyId, is_enabled: nextVal }
      });

      // Update selectedModuleForAccess state optimistically
      setSelectedModuleForAccess(prev => {
        if (!prev) return null;
        const updatedAccess = (prev.company_access || []).map(ca =>
          ca.id === companyId ? { ...ca, is_enabled: nextVal } : ca
        );
        const enabledCount = updatedAccess.filter(ca => ca.is_enabled).length;
        return {
          ...prev,
          enabled_companies: enabledCount,
          disabled_companies: updatedAccess.length - enabledCount,
          company_access: updatedAccess
        };
      });

      // Update systemModules state
      setSystemModules(prev => prev.map(m => {
        if (m.module_key === selectedModuleForAccess.module_key) {
          const updatedAccess = (m.company_access || []).map(ca =>
            ca.id === companyId ? { ...ca, is_enabled: nextVal } : ca
          );
          const enabledCount = updatedAccess.filter(ca => ca.is_enabled).length;
          return {
            ...m,
            enabled_companies: enabledCount,
            disabled_companies: updatedAccess.length - enabledCount,
            company_access: updatedAccess
          };
        }
        return m;
      }));

      // Update companies state locally so company portal rows immediately reflect the change
      setCompanies(prev => prev.map(c => {
        if (c.id === companyId) {
          return {
            ...c,
            modules: {
              ...(c.modules || {}),
              [selectedModuleForAccess.module_key]: nextVal
            }
          };
        }
        return c;
      }));

      setSuccess(res.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingCompanyId(null);
    }
  };

  // Handle Batch Enable / Disable for All Companies from Modules Page
  const handleBatchToggleAccess = async (enableAll) => {
    if (!selectedModuleForAccess) return;
    const modKey = selectedModuleForAccess.module_key;
    setTogglingCompanyId('all');
    setError('');
    try {
      const companiesToUpdate = (selectedModuleForAccess.company_access || []).filter(
        ca => ca.is_enabled !== enableAll
      );
      for (const ca of companiesToUpdate) {
        await apiRequest(`/modules/${modKey}/toggle-company`, {
          method: 'PUT',
          body: { company_id: ca.id, is_enabled: enableAll }
        });
      }
      await fetchSystemModules();
      fetchData();
      setSuccess(`Module "${selectedModuleForAccess.name}" access set to ${enableAll ? 'ENABLED (ON)' : 'DISABLED (OFF)'} for all active companies.`);
      setShowCompanyAccessModal(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingCompanyId(null);
    }
  };

  // Handle Custom Module Edit
  const handleUpdateModule = async (e) => {
    if (e) e.preventDefault();
    if (!moduleToEdit) return;
    setUpdatingModule(true);
    setError('');
    try {
      const res = await apiRequest(`/modules/${moduleToEdit.module_key}`, {
        method: 'PUT',
        body: editModuleForm
      });
      setSuccess(res.message || `Module "${editModuleForm.name}" updated successfully.`);
      setShowEditModuleModal(false);
      await fetchSystemModules();
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdatingModule(false);
    }
  };

  // Handle Custom Module Delete
  const handleDeleteModule = async () => {
    if (!moduleToDelete) return;
    setDeletingModule(true);
    setError('');
    try {
      const res = await apiRequest(`/modules/${moduleToDelete.module_key}`, {
        method: 'DELETE'
      });
      setSuccess(res.message || `Module "${moduleToDelete.name}" deleted successfully.`);
      setShowDeleteModuleModal(false);
      setModuleToDelete(null);
      await fetchSystemModules();
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingModule(false);
    }
  };

  // Compute Dashboard Global Stats
  const totalEmployees = companies.reduce((sum, c) => sum + (c.total_employees || 0), 0);
  const activeCompanies = companies.filter(c => c.status === 'active').length;
  const disabledCompanies = companies.filter(c => c.status === 'disabled').length;
  const bannedCompanies = companies.filter(c => c.status === 'banned').length;

  // Company Portals pagination & slicing calculations
  const companyEffectivePageSize = companyIsCustomPageSize && Number(companyCustomPageSize) > 0
    ? Number(companyCustomPageSize)
    : (companyPageSize || 10);
  const totalCompanyPages = Math.max(1, Math.ceil(companies.length / companyEffectivePageSize));
  const paginatedCompanies = companies.slice(
    (companyPage - 1) * companyEffectivePageSize,
    companyPage * companyEffectivePageSize
  );

  // Support Accounts pagination & slicing calculations
  const filteredSupportUsers = supportUsers.filter(s => {
    if (!supportSearchQuery.trim()) return true;
    const q = supportSearchQuery.toLowerCase();
    return (
      (s.full_name && s.full_name.toLowerCase().includes(q)) ||
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });
  const supportEffectivePageSize = supportIsCustomPageSize && Number(supportCustomPageSize) > 0
    ? Number(supportCustomPageSize)
    : (supportPageSize || 10);
  const totalSupportPages = Math.max(1, Math.ceil(filteredSupportUsers.length / supportEffectivePageSize));
  const paginatedSupportUsers = filteredSupportUsers.slice(
    (supportPage - 1) * supportEffectivePageSize,
    supportPage * supportEffectivePageSize
  );

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? `Welcome, ${user.fullName || user.username}`
              : activeTab === 'settings'
              ? 'Platform Settings & System Branding'
              : activeTab === 'modules'
              ? 'Platform Modules & Company Entitlements'
              : 'Platform Control Center'}
          </h2>
          <p className="text-xs text-slate-500">
            {activeTab === 'settings'
              ? 'Customize company logo, platform brand name, browser favicon icon, and root credentials'
              : activeTab === 'modules'
              ? 'Master registry of platform capabilities, tenant feature entitlements, and custom module provisioning'
              : 'Global SaaS tenant management, support provisioning, and multi-tenant audit logs'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'support-accounts' && (
            <button
              onClick={() => setShowCreateSupport(true)}
              className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Add Support Member
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-700 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {success}
        </div>
      )}

      {/* VIEW: DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Global Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Companies</span>
                <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{companies.length}</p>
              <div className="flex items-center gap-2 mt-2 text-[11px] font-medium">
                <span className="text-emerald-600">{activeCompanies} Active</span>
                <span className="text-slate-300">•</span>
                <span className="text-amber-600">{disabledCompanies} Disabled</span>
                <span className="text-slate-300">•</span>
                <span className="text-rose-600">{bannedCompanies} Banned</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Employees</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{totalEmployees}</p>
              <p className="text-[11px] text-slate-400 mt-2">Across all tenant companies</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Support Staff</span>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Shield className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{supportUsers.length}</p>
              <p className="text-[11px] text-slate-400 mt-2">Levels 1-4 Operations Access</p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total Audits</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{auditLogs.length}</p>
              <p className="text-[11px] text-slate-400 mt-2">Immutable actions recorded</p>
            </div>
          </div>

          {/* Companies Quick Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Tenant Companies Overview</h3>
              <span className="text-xs text-sky-600 font-semibold">Real-Time Database Records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Company Legal Name</th>
                    <th className="p-3">Company Code</th>
                    <th className="p-3">Employees</th>
                    <th className="p-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.map(c => (
                    <tr key={c.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">{c.name}</td>
                      <td className="p-3 font-mono text-sky-600 font-semibold">{c.code}</td>
                      <td className="p-3 font-medium text-slate-800">{c.total_employees || 0}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          c.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          c.status === 'disabled' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {c.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: COMPANIES - MASTER PORTALS DIRECTORY */}
      {activeTab === 'companies' && (
        <div className="space-y-4">
          {/* Top Action Header: Title + Register Company Button */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-600" />
                <span>Company Portals Management</span>
              </h2>
              <p className="text-xs text-slate-500">
                Register tenant companies, configure custom admin credentials, and monitor company portal lifecycle
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateCompany(true)}
              className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>Register Company</span>
            </button>
          </div>

          {/* Squared Card: Company Status, Select Company, Custom Enter, Display Rows Limit */}
          <div className="bg-white p-4 rounded-xl border-2 border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">Company Filters & Display Controls</h3>
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Matching Portals: <strong className="text-slate-800">{companies.length}</strong>
                {companies.length > 0 && (
                  <span className="ml-1 text-slate-400">
                    (Showing {Math.min((companyPage - 1) * companyEffectivePageSize + 1, companies.length)} - {Math.min(companyPage * companyEffectivePageSize, companies.length)})
                  </span>
                )}
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* 1. Company Status Dropdown */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Company Status</label>
                <select
                  value={companyFilterStatus}
                  onChange={(e) => {
                    setCompanyFilterStatus(e.target.value);
                    setCompanyPage(1);
                  }}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="block">Block</option>
                  <option value="all">All Status</option>
                </select>
              </div>

              {/* 2. Select Company Dropdown */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Select Company</label>
                <select
                  value={selectedCompanyFilter}
                  onChange={(e) => {
                    setSelectedCompanyFilter(e.target.value);
                    setCompanyPage(1);
                  }}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="all">All Companies</option>
                  {allCompaniesList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Custom Search / Enter */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Custom Search / Name / Code</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={companySearchQuery}
                    onChange={(e) => {
                      setCompanySearchQuery(e.target.value);
                      setCompanyPage(1);
                    }}
                    placeholder="Search name, code, phone, admin..."
                    className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {companySearchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setCompanySearchQuery('');
                        setCompanyPage(1);
                      }}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              {/* 4. Display Rows Limit */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Display Rows</label>
                <div className="flex items-center gap-1.5">
                  <select
                    value={companyIsCustomPageSize ? 'custom' : companyPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === 'custom') {
                        setCompanyIsCustomPageSize(true);
                      } else {
                        setCompanyIsCustomPageSize(false);
                        setCompanyPageSize(Number(val));
                      }
                      setCompanyPage(1);
                    }}
                    className="flex-1 py-2 px-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value={10}>10 Rows (Default)</option>
                    <option value={25}>25 Rows</option>
                    <option value="custom">Custom Rows</option>
                  </select>
                  {companyIsCustomPageSize && (
                    <input
                      type="number"
                      min="1"
                      max="500"
                      value={companyCustomPageSize}
                      onChange={(e) => {
                        setCompanyCustomPageSize(e.target.value);
                        setCompanyPage(1);
                      }}
                      placeholder="e.g. 50"
                      className="w-20 py-2 px-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500 text-center"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Filter Buttons & Selection Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setCompanyPage(1);
                    fetchData();
                  }}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Apply Filter</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCompanyFilterStatus('active');
                    setSelectedCompanyFilter('all');
                    setCompanySearchQuery('');
                    setCompanyPageSize(10);
                    setCompanyIsCustomPageSize(false);
                    setCompanyCustomPageSize('');
                    setCompanyPage(1);
                    fetchData();
                  }}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all"
                >
                  Reset to Default (Active, 10 Rows)
                </button>
              </div>

              {/* Multi-Selection Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCompanies}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-2 ${
                    paginatedCompanies.length > 0 && selectedCompanyIds.length === paginatedCompanies.length
                      ? 'bg-sky-50 text-sky-700 border-sky-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={paginatedCompanies.length > 0 && selectedCompanyIds.length === paginatedCompanies.length}
                    onChange={handleSelectAllCompanies}
                    className="rounded text-sky-600 cursor-pointer pointer-events-none"
                  />
                  <span>Select Multiple</span>
                </button>

                {selectedCompanyIds.length > 0 && (
                  <div className="flex items-center gap-2 animate-fadeIn">
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {selectedCompanyIds.length} Selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCompanyIds([])}
                      className="px-2 py-1 text-xs text-slate-500 hover:text-slate-700 font-semibold"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkDeleteModal(true)}
                      className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Master Company Directory Table - All Company Data One Time */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tenant Companies Master Directory</h3>
                <p className="text-xs text-slate-500">
                  Comprehensive single-view: company profiles, administrative accounts, operational staff, and lifecycle status
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-400">
                  Total Records: <strong className="text-slate-700">{companies.length}</strong>
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={paginatedCompanies.length > 0 && selectedCompanyIds.length === paginatedCompanies.length}
                        onChange={handleSelectAllCompanies}
                        className="rounded text-sky-600 cursor-pointer"
                        title="Select/Deselect Visible Companies"
                      />
                    </th>
                    <th className="p-3">Company Identity & Portal</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Admin Login</th>
                    <th className="p-3">Contact & Address</th>
                    <th className="p-3">Workforce Breakdown</th>
                    <th className="p-3">Plan Expiry</th>
                    <th className="p-3">Modules</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 text-xs">
                        No company portals found matching the selected filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    paginatedCompanies.map(c => {
                      const isSelected = selectedCompanyIds.includes(c.id);
                      return (
                        <tr
                          key={c.id}
                          className={`transition-colors ${
                            isSelected ? 'bg-sky-50/60' : 'hover:bg-slate-50/50'
                          }`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectCompany(c.id)}
                              className="rounded text-sky-600 cursor-pointer"
                            />
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 text-sm">{c.name}</span>
                                <span className="px-2 py-0.5 bg-slate-100 text-sky-700 font-mono text-[10px] font-bold rounded-md border border-slate-200">
                                  {c.code}
                                </span>
                              </div>
                              {c.portal_name && c.portal_name !== c.name && (
                                <p className="text-[11px] text-slate-500">Portal: {c.portal_name}</p>
                              )}
                              <p className="text-[10px] text-slate-400">
                                Created: {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB') : '-'}
                              </p>
                            </div>
                          </td>
                          <td className="p-3">
                            <select
                              value={c.status}
                              onChange={(e) => updateCompanyStatus(c.id, e.target.value)}
                              className={`text-xs font-bold rounded-lg px-2.5 py-1 border focus:outline-none cursor-pointer transition-colors ${
                                c.status === 'active'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : (c.status === 'disabled' || c.status === 'suspended')
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              <option value="active">Active</option>
                              <option value="disabled">Suspended</option>
                              <option value="banned">Block</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                                <Shield className="w-3 h-3 text-sky-500 shrink-0" />
                                <span>{c.admin_username || 'admin'}</span>
                              </div>
                              {c.admin_mobile && (
                                <p className="text-[10px] font-mono text-emerald-600 font-semibold">
                                  📞 {c.admin_mobile}
                                </p>
                              )}
                              <p className="text-[11px] text-slate-500">{c.admin_email || '-'}</p>
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5 max-w-xs">
                              <p className="text-slate-800 font-medium">{c.email || '-'}</p>
                              <p className="text-[11px] text-slate-500">{c.phone || '-'}</p>
                              {c.address && (
                                <p className="text-[10px] text-slate-400 truncate" title={c.address}>
                                  {c.address}
                                </p>
                              )}
                            </div>
                          </td>
                          <td className="p-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900">{c.total_employees || 0}</span>
                                <span className="text-[11px] text-slate-500">Staff / Emps</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded font-semibold">
                                  {c.total_managers || 0} Mgrs
                                </span>
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold">
                                  {c.total_users || 0} Users
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            {(() => {
                              if (!c.plan_expiry_date) {
                                return (
                                  <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600 rounded border border-slate-200">
                                    Lifetime
                                  </span>
                                );
                              }
                              const todayStr = new Date().toISOString().split('T')[0];
                              const expiry = c.plan_expiry_date;
                              const isExpired = todayStr > expiry;
                              const daysLeft = Math.ceil((new Date(expiry) - new Date(todayStr)) / (1000 * 60 * 60 * 24));
                              
                              if (isExpired) {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 rounded">
                                      <Ban className="w-3 h-3 text-rose-600" />
                                      Expired
                                    </span>
                                    <p className="text-[10px] font-mono text-rose-600 font-semibold">{expiry}</p>
                                  </div>
                                );
                              }
                              if (daysLeft <= 30) {
                                return (
                                  <div className="space-y-0.5">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      Expiring ({daysLeft}d)
                                    </span>
                                    <p className="text-[10px] font-mono text-amber-700">{expiry}</p>
                                  </div>
                                );
                              }
                              return (
                                <div className="space-y-0.5">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                                    Active ({daysLeft}d)
                                  </span>
                                  <p className="text-[10px] font-mono text-slate-500">{expiry}</p>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3 min-w-[220px]">
                            {(() => {
                              const mods = c.modules || {};
                              const activeCount = effectiveModules.filter(m => {
                                if (mods[m.key] !== undefined) return mods[m.key] !== false && mods[m.key] !== 0;
                                return !!m.is_core; // custom modules default to OFF!
                              }).length;
                              const disabledMods = effectiveModules.filter(m => {
                                if (mods[m.key] !== undefined) return mods[m.key] === false || mods[m.key] === 0;
                                return !m.is_core; // custom modules default to OFF!
                              });
                              const allActive = disabledMods.length === 0;

                              return (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span
                                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded border ${
                                        allActive
                                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border-amber-200'
                                      }`}
                                      title={allActive ? 'All system modules enabled' : `${disabledMods.length} module(s) currently disabled`}
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${allActive ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                      {activeCount}/{effectiveModules.length} Active
                                    </span>

                                    {disabledMods.length > 0 ? (
                                      <span
                                        className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-bold rounded bg-rose-50 text-rose-600 border border-rose-200"
                                        title={`Disabled: ${disabledMods.map(m => m.label).join(', ')}`}
                                      >
                                        {disabledMods.length} Off
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-emerald-50/60 text-emerald-600 border border-emerald-100">
                                        All On
                                      </span>
                                    )}

                                    <button
                                      type="button"
                                      onClick={() => openModulesModal(c.id)}
                                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors ml-auto shadow-xs"
                                      title="Open Module Configuration Modal (Directly fetched from Modules Page registry)"
                                    >
                                      <Settings2 className="w-3 h-3 text-slate-500" />
                                      <span>Configure</span>
                                    </button>
                                  </div>

                                  {/* Quick visual badge tags of key modules showing ON / OFF status */}
                                  <div className="flex flex-wrap gap-1 items-center">
                                    {effectiveModules.slice(0, 5).map(m => {
                                      const isModOn = mods[m.key] !== undefined
                                        ? (mods[m.key] !== false && mods[m.key] !== 0)
                                        : !!m.is_core;
                                      return (
                                        <span
                                          key={m.key}
                                          className={`px-1.5 py-0.2 text-[9px] font-medium rounded transition-colors ${
                                            isModOn
                                              ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                              : 'bg-rose-50 text-rose-600 border border-rose-200 line-through opacity-80'
                                          }`}
                                          title={`${m.label}: ${isModOn ? 'ENABLED (ON)' : 'DISABLED (OFF)'}`}
                                        >
                                          {m.label.split(' ')[0]}
                                        </span>
                                      );
                                    })}
                                    {disabledMods.length > 0 && disabledMods.some(dm => !effectiveModules.slice(0, 5).includes(dm)) && (
                                      <span
                                        onClick={() => openModulesModal(c.id)}
                                        className="px-1.5 py-0.2 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded cursor-pointer hover:bg-rose-100"
                                        title={`Disabled: ${disabledMods.map(m => m.label).join(', ')}`}
                                      >
                                        +{disabledMods.filter(dm => !effectiveModules.slice(0, 5).includes(dm)).length} Off
                                      </span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => openEditCompany(c)}
                                className="px-2.5 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                                title="Edit Company Details & Admin Account"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openChangePassword(c)}
                                className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold transition-colors"
                                title="Change Admin Password"
                              >
                                <Key className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(c)}
                                className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold transition-colors"
                                title="Permanently Delete Company & All Records from Database"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <div className="text-xs text-slate-500">
                Showing <strong>{companies.length === 0 ? 0 : (companyPage - 1) * companyEffectivePageSize + 1}</strong> to <strong>{Math.min(companyPage * companyEffectivePageSize, companies.length)}</strong> of <strong>{companies.length}</strong> companies
                {companyFilterStatus === 'active' && selectedCompanyFilter === 'all' && !companySearchQuery && (
                  <span className="ml-2 text-emerald-600 font-semibold">(Default Active View)</span>
                )}
              </div>
              {totalCompanyPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={companyPage === 1}
                    onClick={() => setCompanyPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-slate-100 bg-white font-medium text-slate-700"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2">
                    Page {companyPage} of {totalCompanyPages}
                  </span>
                  <button
                    type="button"
                    disabled={companyPage === totalCompanyPages}
                    onClick={() => setCompanyPage(p => Math.min(totalCompanyPages, p + 1))}
                    className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-slate-100 bg-white font-medium text-slate-700"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}


      {/* VIEW: ALL EMPLOYEES DIRECTORY */}
      {activeTab === 'all-employees' && (
        <div className="space-y-4">
          {/* Advanced Filter Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Role Position Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Position:
                </span>
                <button
                  type="button"
                  onClick={() => { setDirRoleFilter('all'); setDirPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    dirRoleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({directoryTotal})
                </button>
                <button
                  type="button"
                  onClick={() => { setDirRoleFilter('employee'); setDirPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    dirRoleFilter === 'employee' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Employees
                </button>
                <button
                  type="button"
                  onClick={() => { setDirRoleFilter('manager'); setDirPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    dirRoleFilter === 'manager' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Managers
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Total matching: <span className="font-bold text-slate-700">{directoryTotal}</span> records
              </div>
            </div>

            {/* Dropdown Filters & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 pt-2 border-t border-slate-100 text-xs">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={dirSearchQuery}
                  onChange={(e) => { setDirSearchQuery(e.target.value); setDirPage(1); }}
                  placeholder="Search name, ID, city..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800"
                />
              </div>

              {/* Company Filter */}
              <div>
                <select
                  value={dirCompanyFilter}
                  onChange={(e) => { setDirCompanyFilter(e.target.value); setDirPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Companies</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={dirStatusFilter}
                  onChange={(e) => { setDirStatusFilter(e.target.value); setDirPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Statuses</option>
                  <option value="active">Active Accounts</option>
                  <option value="suspended">Suspended Accounts</option>
                </select>
              </div>

              {/* City Filter */}
              <div>
                <select
                  value={dirCityFilter}
                  onChange={(e) => { setDirCityFilter(e.target.value); setDirPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Cities</option>
                  {dirAvailableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Page Size Selector (10, 25, 50, Custom) */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium whitespace-nowrap flex items-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> Limit:
                </span>
                <select
                  value={dirIsCustomPageSize ? 'custom' : dirPageSize}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'custom') {
                      setDirIsCustomPageSize(true);
                    } else {
                      setDirIsCustomPageSize(false);
                      setDirPageSize(Number(val));
                      setDirPage(1);
                    }
                  }}
                  className="py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="10">10 / page</option>
                  <option value="25">25 / page</option>
                  <option value="50">50 / page</option>
                  <option value="custom">Custom</option>
                </select>

                {dirIsCustomPageSize && (
                  <input
                    type="number"
                    min="1"
                    max="500"
                    placeholder="Size"
                    value={dirCustomPageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setDirCustomPageSize(val);
                      const num = parseInt(val, 10);
                      if (num > 0) {
                        setDirPageSize(num);
                        setDirPage(1);
                      }
                    }}
                    className="w-16 py-1 px-2 border border-sky-400 rounded-xl text-slate-800 text-xs font-mono font-bold bg-sky-50/50"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Tenant Workforce Directory</h3>
                <p className="text-xs text-slate-500">Cross-company employee records, status controls, and account management</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Company</th>
                    <th className="p-3">Position</th>
                    <th className="p-3">Department & Designation</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {directoryEmployees.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="p-3 font-semibold text-slate-900">
                        <div>{e.full_name}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{e.employee_id} • {e.email || 'No email'}</div>
                      </td>
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{e.company_name || 'Global'}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{e.company_code || '---'}</div>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.role_name === 'manager' ? 'bg-purple-100 text-purple-700' :
                          'bg-sky-100 text-sky-700'
                        }`}>
                          {e.role_name === 'manager' ? 'Manager' : 'Employee'}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{e.department || 'Operations'}</div>
                        <div className="text-[10px] text-slate-400">{e.designation || 'Staff'}</div>
                      </td>
                      <td className="p-3 font-medium text-slate-700">
                        {e.city ? (
                          <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px] font-semibold text-slate-700">
                            {e.city}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">--</span>
                        )}
                      </td>
                      <td className="p-3 text-slate-600 font-medium">
                        {e.shift_name || 'General'}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                        }`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1. Edit Button */}
                          <button
                            type="button"
                            onClick={() => openEditDirEmployee(e)}
                            className="px-2 py-1 text-slate-700 hover:text-sky-600 bg-white hover:bg-sky-50 border border-slate-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Edit Employee Details"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                            <span>Edit</span>
                          </button>

                          {/* 2. Active / Suspend Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleDirEmployeeStatus(e)}
                            className={`px-2 py-1 border rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors ${
                              e.status === 'active'
                                ? 'text-amber-700 hover:text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200'
                                : 'text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                            }`}
                            title={e.status === 'active' ? 'Suspend Account' : 'Activate Account'}
                          >
                            {e.status === 'active' ? (
                              <>
                                <Ban className="w-3.5 h-3.5 text-amber-600" />
                                <span>Suspend</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Activate</span>
                              </>
                            )}
                          </button>

                          {/* 3. Change Password Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDirEmployeeForPassword(e);
                              setShowDirPasswordModal(true);
                            }}
                            className="px-2 py-1 text-indigo-700 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Change Account Password"
                          >
                            <Key className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Password</span>
                          </button>

                          {/* 4. Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteDirEmployee(e.id, e.full_name)}
                            className="px-2 py-1 text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Delete Account"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {directoryEmployees.length === 0 && (
                    <tr>
                      <td colSpan="8" className="p-8 text-center text-slate-400">
                        No employees found matching the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-800">
                  {directoryTotal === 0 ? 0 : (dirPage - 1) * dirPageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(dirPage * dirPageSize, directoryTotal)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{directoryTotal}</span> employees
              </div>

              {/* Page Number Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDirPage(p => Math.max(1, p - 1))}
                  disabled={dirPage === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                {Array.from({ length: Math.max(1, Math.ceil(directoryTotal / dirPageSize)) }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === Math.ceil(directoryTotal / dirPageSize) || Math.abs(p - dirPage) <= 2)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setDirPage(p)}
                        className={`min-w-[28px] py-1 px-2 rounded-lg font-bold text-xs transition-colors ${
                          dirPage === p
                            ? 'bg-sky-600 text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {p}
                      </button>
                    </React.Fragment>
                  ))}

                <button
                  type="button"
                  onClick={() => setDirPage(p => Math.min(Math.ceil(directoryTotal / dirPageSize), p + 1))}
                  disabled={dirPage >= Math.ceil(directoryTotal / dirPageSize) || directoryTotal === 0}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* VIEW: SUPPORT ACCOUNTS */}
      {activeTab === 'support-accounts' && (
        <div className="space-y-4">
          {/* Display & Filter Controls Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative w-64 sm:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={supportSearchQuery}
                  onChange={(e) => {
                    setSupportSearchQuery(e.target.value);
                    setSupportPage(1);
                  }}
                  placeholder="Search name, username, or email..."
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-purple-500"
                />
                {supportSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupportSearchQuery('');
                      setSupportPage(1);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Display Rows:</label>
              <select
                value={supportIsCustomPageSize ? 'custom' : supportPageSize}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'custom') {
                    setSupportIsCustomPageSize(true);
                  } else {
                    setSupportIsCustomPageSize(false);
                    setSupportPageSize(Number(val));
                  }
                  setSupportPage(1);
                }}
                className="py-1.5 px-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 cursor-pointer"
              >
                <option value={10}>10 Rows (Default)</option>
                <option value={25}>25 Rows</option>
                <option value={50}>50 Rows</option>
                <option value="custom">Custom...</option>
              </select>
              {supportIsCustomPageSize && (
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={supportCustomPageSize}
                  onChange={(e) => {
                    setSupportCustomPageSize(e.target.value);
                    setSupportPage(1);
                  }}
                  placeholder="e.g. 15"
                  className="w-16 py-1.5 px-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-purple-500 text-center"
                />
              )}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Support Staff Accounts</h3>
                <span className="text-[11px] text-slate-400">Total: {filteredSupportUsers.length} staff members</span>
              </div>
              <span className="text-xs text-purple-600 font-semibold">Strict Permission Levels 1-4</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Full Name & Email</th>
                    <th className="p-3">Username</th>
                    <th className="p-3">Permission Level</th>
                    <th className="p-3">Assigned Authority</th>
                    <th className="p-3">Assigned Companies</th>
                    <th className="p-3">AI Access</th>
                    <th className="p-3">Audit Logs</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedSupportUsers.map(s => (
                    <tr key={s.user_id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p className="font-semibold text-slate-900">{s.full_name}</p>
                        <p className="text-[11px] text-slate-400">{s.email || 'No email specified'}</p>
                      </td>
                      <td className="p-3 font-mono text-purple-600">{s.username}</td>
                      <td className="p-3">
                        {(() => {
                          const lvl = parseInt(String(s.support_level || s.permission_level || 1).replace(/\D/g, ''), 10) || 1;
                          return (
                            <span className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1 shadow-sm ${
                              lvl === 4
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-purple-200'
                                : lvl === 3
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : lvl === 2
                                ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {lvl === 4 && <ShieldCheck className="w-3.5 h-3.5" />}
                              Level {lvl}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3 text-slate-600">
                        {(() => {
                          const lvl = parseInt(String(s.support_level || s.permission_level || 1).replace(/\D/g, ''), 10) || 1;
                          return (
                            <div className="text-xs">
                              {lvl === 1 && <span className="text-slate-600">Level 1 – View Only (Reports & Monitoring)</span>}
                              {lvl === 2 && <span className="text-blue-700 font-medium">Level 2 – Operator (Edit Employee, Shifts & Attendance)</span>}
                              {lvl === 3 && <span className="text-indigo-700 font-medium">Level 3 – Advanced (Device Unlock & Corrections)</span>}
                              {lvl === 4 && (
                                <span className="font-semibold text-purple-700 flex items-center gap-1">
                                  <span>Level 4 – Full Authority (Device Unlock, Biometrics Reset, Account Ops, Realtime Sync)</span>
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        {(() => {
                          const raw = s.assigned_companies;
                          if (!raw || raw === 'all' || raw === '*') {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Globe className="w-3 h-3 text-emerald-600" />
                                <span>All Companies</span>
                              </span>
                            );
                          }
                          let ids = [];
                          try {
                            ids = typeof raw === 'string' ? JSON.parse(raw) : raw;
                          } catch (e) {
                            ids = String(raw).split(',').map(Number);
                          }
                          if (!Array.isArray(ids) || ids.length === 0) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <Globe className="w-3 h-3 text-emerald-600" />
                                <span>All Companies</span>
                              </span>
                            );
                          }
                          const matched = companies.filter(c => ids.includes(c.id));
                          if (matched.length === 1) {
                            return (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200" title={matched[0].name}>
                                <Building2 className="w-3 h-3 text-purple-600" />
                                <span className="max-w-[120px] truncate">{matched[0].name}</span>
                              </span>
                            );
                          }
                          return (
                            <span 
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200 cursor-help"
                              title={matched.map(c => c.name).join(', ')}
                            >
                              <Building2 className="w-3 h-3 text-purple-600" />
                              <span>{ids.length} Companies</span>
                            </span>
                          );
                        })()}
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${
                          s.enable_ai_assistant
                            ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }`}>
                          {s.enable_ai_assistant ? (
                            <>
                              <Sparkles className="w-3 h-3 text-indigo-600" />
                              <span>AI Enabled</span>
                            </>
                          ) : (
                            <span>AI Disabled</span>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit ${
                          s.enable_audit_logs !== 0 && s.enable_audit_logs !== false
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-600 border border-rose-200'
                        }`}>
                          {s.enable_audit_logs !== 0 && s.enable_audit_logs !== false ? (
                            <>
                              <FileSpreadsheet className="w-3 h-3 text-emerald-600" />
                              <span>Logs Enabled</span>
                            </>
                          ) : (
                            <>
                              <X className="w-3 h-3 text-rose-500" />
                              <span>Logs Disabled</span>
                            </>
                          )}
                        </span>
                      </td>
                      <td className="p-3">
                        <button
                          onClick={() => handleToggleSupportStatus(s)}
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold transition-transform active:scale-95 cursor-pointer ${
                            s.status === 'active' ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                          }`}
                          title="Click to toggle Active / Suspended"
                        >
                          {s.status === 'active' ? 'ACTIVE' : 'SUSPENDED'}
                        </button>
                      </td>
                      <td className="p-3 text-slate-400">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => openEditSupport(s)}
                            className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                            title="Edit Support Account"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                          <button
                            onClick={() => openSupportPasswordModal(s)}
                            className="p-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold transition-colors"
                            title="Change Password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleSupportStatus(s)}
                            className={`p-1.5 rounded-lg text-xs font-semibold transition-colors ${
                              s.status === 'active' ? 'bg-amber-50 hover:bg-amber-100 text-amber-700' : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                            }`}
                            title={s.status === 'active' ? 'Suspend Account' : 'Enable Account'}
                          >
                            {s.status === 'active' ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => openDeleteSupportModal(s)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-xs font-semibold transition-colors"
                            title="Permanently Delete Support Account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredSupportUsers.length === 0 && (
                    <tr>
                      <td colSpan="10" className="p-8 text-center text-slate-400">
                        No support staff accounts found matching query.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 text-xs">
              <div className="text-slate-500">
                Showing <strong>{filteredSupportUsers.length === 0 ? 0 : (supportPage - 1) * supportEffectivePageSize + 1}</strong> to <strong>{Math.min(supportPage * supportEffectivePageSize, filteredSupportUsers.length)}</strong> of <strong>{filteredSupportUsers.length}</strong> support members
              </div>
              {totalSupportPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={supportPage === 1}
                    onClick={() => setSupportPage(p => Math.max(1, p - 1))}
                    className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-slate-100 bg-white font-medium text-slate-700"
                  >
                    Previous
                  </button>
                  <span className="text-xs font-bold text-slate-700 px-2">
                    Page {supportPage} of {totalSupportPages}
                  </span>
                  <button
                    type="button"
                    disabled={supportPage === totalSupportPages}
                    onClick={() => setSupportPage(p => Math.min(totalSupportPages, p + 1))}
                    className="px-2.5 py-1 text-xs border rounded-md disabled:opacity-40 hover:bg-slate-100 bg-white font-medium text-slate-700"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* VIEW: GLOBAL ATTENDANCE & REPORTS */}
      {(activeTab === 'attendance' || activeTab === 'reports') && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900">Cross-Tenant Global Attendance Records</h3>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Custom Column Export (Excel/PDF)
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Employee</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Date</th>
                  <th className="p-3">Punch In</th>
                  <th className="p-3">Punch Out</th>
                  <th className="p-3">Total Hours</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {attendanceRecords.map(a => (
                  <tr key={a.id} className="hover:bg-slate-50/50">
                    <td className="p-3 font-semibold text-slate-900">{a.employee_name} ({a.employee_code})</td>
                    <td className="p-3 text-slate-600">{a.company_name}</td>
                    <td className="p-3 text-slate-700 font-medium">{a.date}</td>
                    <td className="p-3 text-emerald-700 font-mono">{a.punch_in_time || '-'}</td>
                    <td className="p-3 text-rose-700 font-mono">{a.punch_out_time || '-'}</td>
                    <td className="p-3 font-medium">{a.total_hours} hrs</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        a.status === 'Present' ? 'bg-emerald-100 text-emerald-700' :
                        a.status === 'Half Day' ? 'bg-amber-100 text-amber-700' : 'bg-rose-100 text-rose-700'
                      }`}>
                        {a.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW: SYSTEM MODULES REGISTRY & COMPANY ENTITLEMENTS */}
      {activeTab === 'modules' && (
        <div className="space-y-6">
          {/* Top Stat Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => {
                setModuleTypeFilter('all');
                setModuleCategoryFilter('all');
                setModuleAdoptionFilter('all');
                setModuleSearch('');
              }}
              className={`p-5 border shadow-sm cursor-pointer transition-all ${
                moduleTypeFilter === 'all' && !moduleSearch && moduleCategoryFilter === 'all'
                  ? 'bg-sky-50/60 border-sky-400 ring-2 ring-sky-300'
                  : 'bg-white border-slate-200 hover:border-sky-400'
              }`}
              title="Click to view all modules"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Modules</span>
                <div className="p-2 bg-sky-50 text-sky-600">
                  <Sliders className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">{effectiveModules.length}</p>
              <p className="text-[11px] text-slate-400 mt-1">Platform capabilities registry</p>
            </div>

            <div
              onClick={() => {
                setModuleTypeFilter('core');
              }}
              className={`p-5 border shadow-sm cursor-pointer transition-all ${
                moduleTypeFilter === 'core'
                  ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-300'
                  : 'bg-white border-slate-200 hover:border-emerald-400'
              }`}
              title="Click to filter Core System modules"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Core System Modules</span>
                <div className="p-2 bg-emerald-50 text-emerald-600">
                  <Shield className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {effectiveModules.filter(m => m.is_core).length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Built-in standard modules</p>
            </div>

            <div
              onClick={() => {
                setModuleTypeFilter('custom');
              }}
              className={`p-5 border shadow-sm cursor-pointer transition-all ${
                moduleTypeFilter === 'custom'
                  ? 'bg-purple-50/70 border-purple-500 ring-2 ring-purple-300'
                  : 'bg-white border-slate-200 hover:border-purple-400'
              }`}
              title="Click to filter Custom (Manually Added) modules"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-purple-700 uppercase tracking-wider">Custom (Manually)</span>
                <div className="p-2 bg-purple-100 text-purple-600">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-purple-950 mt-2">
                {effectiveModules.filter(m => !m.is_core).length}
              </p>
              <p className="text-[11px] text-purple-600 font-medium mt-1">Custom business extensions (Click to view)</p>
            </div>

            <div className="bg-white p-5 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Managed Companies</span>
                <div className="p-2 bg-amber-50 text-amber-600">
                  <Building2 className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-black text-slate-900 mt-2">
                {allCompaniesList.length || companies.length || (systemModules[0]?.total_companies || 0)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Multi-tenant client accounts</p>
            </div>
          </div>

          {/* Module Filters & Display Controls Card */}
          <div className="bg-white p-4 rounded-none border-2 border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                  Module Filters & Display Controls
                </h3>
              </div>
              <div className="text-xs text-slate-500 font-medium flex items-center gap-2">
                <span>
                  Matching Modules: <strong className="text-slate-900 font-mono font-bold">{filteredModules.length}</strong> / {effectiveModules.length}
                </span>
                {moduleTypeFilter === 'custom' && (
                  <span className="px-2 py-0.5 bg-purple-100 text-purple-700 font-bold text-[10px] uppercase tracking-wider border border-purple-300">
                    Custom (Manually) Active
                  </span>
                )}
                {moduleTypeFilter === 'core' && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 font-bold text-[10px] uppercase tracking-wider border border-emerald-300">
                    Core Only Active
                  </span>
                )}
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {/* 1. Module Scope / Type */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Module Scope / Type</label>
                <select
                  value={moduleTypeFilter}
                  onChange={(e) => setModuleTypeFilter(e.target.value)}
                  className={`w-full py-2 px-3 border rounded-none font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500 ${
                    moduleTypeFilter === 'custom'
                      ? 'bg-purple-50 text-purple-900 border-purple-300'
                      : 'bg-slate-50 text-slate-800 border-slate-300'
                  }`}
                >
                  <option value="all">All Modules (Core & Custom)</option>
                  <option value="core">Core Platform Modules</option>
                  <option value="custom">Custom (Manually Added)</option>
                </select>
              </div>

              {/* 2. Category Dropdown */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Module Category</label>
                <select
                  value={moduleCategoryFilter}
                  onChange={(e) => setModuleCategoryFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-none text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Categories</option>
                  {Array.from(new Set(effectiveModules.map(m => m.category).filter(Boolean))).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* 3. Company Adoption Status */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Company Adoption</label>
                <select
                  value={moduleAdoptionFilter}
                  onChange={(e) => setModuleAdoptionFilter(e.target.value)}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-300 rounded-none text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Adoption Levels</option>
                  <option value="all_enabled">Active in All Companies (100%)</option>
                  <option value="partial">Partially Enabled (&gt;0%)</option>
                  <option value="all_disabled">Disabled Across All (0%)</option>
                </select>
              </div>

              {/* 4. Search Query */}
              <div>
                <label className="font-semibold text-slate-600 block mb-1">Search Name / Key</label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={moduleSearch}
                    onChange={(e) => setModuleSearch(e.target.value)}
                    placeholder="Search name, key, description..."
                    className="w-full pl-8 pr-7 py-2 bg-slate-50 border border-slate-300 rounded-none text-slate-800 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {moduleSearch && (
                    <button
                      type="button"
                      onClick={() => setModuleSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 font-bold"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Filter Buttons & Quick Selection Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    fetchSystemModules();
                    fetchData();
                  }}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all uppercase tracking-wider cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>Apply Filter</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModuleSearch('');
                    setModuleCategoryFilter('all');
                    setModuleTypeFilter('all');
                    setModuleAdoptionFilter('all');
                    setModuleSortFilter('default');
                  }}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-none text-xs font-bold flex items-center gap-1.5 transition-all uppercase tracking-wider cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>

                {/* Quick Toggle Tabs */}
                <div className="h-5 w-[1px] bg-slate-300 mx-1 hidden sm:block" />

                <button
                  type="button"
                  onClick={() => setModuleTypeFilter('all')}
                  className={`px-3 py-1.5 text-xs font-bold transition-all border cursor-pointer ${
                    moduleTypeFilter === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  All ({effectiveModules.length})
                </button>

                <button
                  type="button"
                  onClick={() => setModuleTypeFilter('core')}
                  className={`px-3 py-1.5 text-xs font-bold transition-all border cursor-pointer ${
                    moduleTypeFilter === 'core'
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  Core System ({effectiveModules.filter(m => m.is_core).length})
                </button>

                <button
                  type="button"
                  onClick={() => setModuleTypeFilter('custom')}
                  className={`px-3 py-1.5 text-xs font-bold transition-all border flex items-center gap-1.5 cursor-pointer ${
                    moduleTypeFilter === 'custom'
                      ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
                      : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-purple-300'
                  }`}
                >
                  <Sparkles className="w-3 h-3" />
                  <span>Custom (Manually) ({effectiveModules.filter(m => !m.is_core).length})</span>
                </button>
              </div>

              {/* Action Button: Single Add New Module */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModuleForm({ name: '', key: '', category: 'Workforce Management', description: '' });
                    setShowCreateModuleModal(true);
                  }}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-none text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all uppercase tracking-wider cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add New Module</span>
                </button>
              </div>
            </div>

            {/* Explanatory Notice */}
            <div className="p-2.5 bg-sky-50/60 border border-sky-200 text-sky-900 text-xs flex items-start gap-2">
              <Sliders className="w-4 h-4 shrink-0 text-sky-600 mt-0.5" />
              <div>
                <span className="font-bold">Module Provisioning Rules:</span> Any new module registered here will automatically appear in every company's module configuration list with access set to <strong className="text-rose-700">OFF (disabled)</strong> by default. Companies only gain access when Super Admin enables it.
              </div>
            </div>
          </div>

          {/* Modules Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredModules.length === 0 ? (
              moduleTypeFilter === 'custom' ? (
                <div className="col-span-full bg-white border-2 border-dashed border-purple-300 p-10 text-center space-y-4">
                  <div className="w-14 h-14 mx-auto bg-purple-100 text-purple-600 flex items-center justify-center">
                    <Sparkles className="w-7 h-7" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h4 className="text-base font-bold text-slate-900">
                      No Custom (Manually Added) Modules Found
                    </h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      You are currently viewing the <strong>Custom (Manually)</strong> filter. All 16 built-in modules are Core System modules. You can add a new custom module manually at any time by clicking the button below.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCreateModuleForm({ name: '', key: '', category: 'Workforce Management', description: '' });
                        setShowCreateModuleModal(true);
                      }}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all uppercase tracking-wider cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add New Custom Module</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModuleTypeFilter('all');
                        setModuleCategoryFilter('all');
                        setModuleAdoptionFilter('all');
                        setModuleSearch('');
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all border border-slate-300 uppercase tracking-wider cursor-pointer"
                    >
                      View All Platform Modules ({effectiveModules.length})
                    </button>
                  </div>
                </div>
              ) : (
                <div className="col-span-full bg-white border-2 border-dashed border-slate-300 p-10 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto bg-slate-100 text-slate-500 flex items-center justify-center">
                    <Search className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-slate-800">No Modules Match Your Filter Criteria</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    No modules match your current filter selection. Try changing the category, adoption level, or search term.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setModuleTypeFilter('all');
                      setModuleCategoryFilter('all');
                      setModuleAdoptionFilter('all');
                      setModuleSearch('');
                    }}
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold transition-all uppercase tracking-wider cursor-pointer"
                  >
                    Reset All Filters
                  </button>
                </div>
              )
            ) : (
              filteredModules.map(m => {
                const totalComp = m.total_companies || (systemModules[0]?.total_companies || allCompaniesList.length || companies.length || 1);
                const enabledComp = m.enabled_companies || 0;
                const disabledComp = m.disabled_companies !== undefined ? m.disabled_companies : Math.max(0, totalComp - enabledComp);
                const adoptionRate = totalComp > 0 ? Math.round((enabledComp / totalComp) * 100) : 0;

                return (
                  <div
                    key={m.key}
                    className={`bg-white border-2 p-5 shadow-sm hover:shadow transition-all flex flex-col justify-between ${
                      !m.is_core ? 'border-purple-200 hover:border-purple-400' : 'border-slate-200 hover:border-sky-300'
                    }`}
                  >
                    <div className="space-y-3">
                      {/* Top Header of Card */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200">
                              {m.category || 'General'}
                            </span>
                            {m.is_core ? (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-sky-100 text-sky-800 border border-sky-200 flex items-center gap-1">
                                <Shield className="w-3 h-3 text-sky-600" />
                                Core Module
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-purple-600" />
                                Custom (Manually Added)
                              </span>
                            )}
                          </div>
                          <h4 className="font-bold text-sm text-slate-900 leading-snug pt-1">
                            {m.label}
                          </h4>
                          <code className="inline-block text-[11px] font-mono text-slate-500 bg-slate-50 px-1.5 py-0.5 border border-slate-200">
                            {m.key}
                          </code>
                        </div>

                        {!m.is_core && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const orig = systemModules.find(sm => sm.module_key === m.key) || m;
                                setModuleToEdit(orig);
                                setEditModuleForm({
                                  name: orig.name || orig.label,
                                  category: orig.category || 'Custom',
                                  description: orig.description || orig.desc || '',
                                  is_active: orig.is_active !== undefined ? orig.is_active : 1
                                });
                                setShowEditModuleModal(true);
                              }}
                              className="p-1 text-slate-400 hover:text-sky-600 hover:bg-slate-100"
                              title="Edit Custom Module"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const orig = systemModules.find(sm => sm.module_key === m.key) || m;
                                setModuleToDelete(orig);
                                setShowDeleteModuleModal(true);
                              }}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                              title="Delete Custom Module"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Description */}
                      <p className="text-xs text-slate-600 leading-relaxed min-h-[38px]">
                        {m.desc || 'No description available.'}
                      </p>

                      {/* Adoption / Company Access Metrics */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-slate-700">Company Access:</span>
                          <span className="font-mono text-slate-600 font-bold">
                            {enabledComp}/{totalComp} Active ({adoptionRate}%)
                          </span>
                        </div>

                        {/* Adoption Progress Bar */}
                        <div className="w-full bg-slate-100 h-2 overflow-hidden border border-slate-200">
                          <div
                            className={`h-full transition-all duration-300 ${
                              adoptionRate === 100
                                ? 'bg-emerald-500'
                                : adoptionRate > 0
                                ? 'bg-sky-500'
                                : 'bg-slate-300'
                            }`}
                            style={{ width: `${adoptionRate}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            {enabledComp} Enabled
                          </span>
                          <span className="flex items-center gap-1 text-slate-500">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                            {disabledComp} Disabled (OFF)
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const orig = systemModules.find(sm => sm.module_key === m.key) || m;
                          setSelectedModuleForAccess(orig);
                          setShowCompanyAccessModal(true);
                        }}
                        className="w-full py-2 px-3 bg-slate-100 hover:bg-sky-600 hover:text-white text-slate-800 text-xs font-bold flex items-center justify-center gap-2 transition-all uppercase tracking-wide border border-slate-200 hover:border-sky-600 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        <span>Manage Company Access</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* VIEW: AUDIT LOGS */}
      {activeTab === 'audit-logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">System Audit Trail</h3>
            <span className="text-xs text-slate-400">All modifications logged with WHO, WHAT, WHEN, REASON</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">User & Role</th>
                  <th className="p-3">Company</th>
                  <th className="p-3">Panel</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Target</th>
                  <th className="p-3">Reason</th>
                  <th className="p-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {auditLogs.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50/50">
                    <td className="p-3 text-slate-500">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-3 font-semibold text-slate-900">{l.user_name} ({l.role})</td>
                    <td className="p-3 text-slate-600">{l.company_name || 'Global'}</td>
                    <td className="p-3 text-slate-700">{l.panel}</td>
                    <td className="p-3 font-bold text-sky-600">{l.action}</td>
                    <td className="p-3 text-slate-600">{l.target_entity} #{l.target_id || ''}</td>
                    <td className="p-3 text-slate-700 not-italic font-sans">{l.reason}</td>
                    <td className="p-3 text-slate-400">{l.ip_address}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: CALENDAR */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar role="super_admin" />
      )}

      {/* TAB: PLATFORM SETTINGS */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Card 1: Platform & Company Branding */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-sky-100 text-sky-600">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Platform & Organization Branding</h3>
                  <p className="text-xs text-slate-500">Configure global platform brand name, company logo, and browser favicon</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-5 text-xs">
              {/* Company Legal / Platform Name */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1.5 flex items-center justify-between">
                  <span>Platform / Company Brand Name *</span>
                  <span className="text-[11px] text-slate-400 font-normal">Displays on headers, login screen, & emails</span>
                </label>
                <input
                  type="text"
                  required
                  value={settingsForm.platform_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, platform_name: e.target.value })}
                  placeholder="e.g. NPB HRMS"
                  className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 text-sm font-medium"
                />
              </div>

              {/* Company Logo Upload & Live Preview */}
              <div className="space-y-2">
                <label className="font-semibold text-slate-700 block">
                  Company System Logo
                </label>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 border border-slate-200 rounded-xl bg-slate-50/50">
                  {/* Preview box */}
                  <div className="w-48 h-20 bg-white border border-slate-200 rounded-lg flex items-center justify-center p-2 overflow-hidden shadow-inner shrink-0 relative group">
                    {settingsForm.platform_logo ? (
                      <>
                        <img
                          src={settingsForm.platform_logo}
                          alt="Platform Logo"
                          className="max-h-full max-w-full object-contain"
                        />
                        <button
                          type="button"
                          onClick={() => setSettingsForm(prev => ({ ...prev, platform_logo: '' }))}
                          className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      </>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400">
                        <Image className="w-6 h-6 stroke-1 mb-1" />
                        <span className="text-[10px]">No Logo Set</span>
                      </div>
                    )}
                  </div>

                  {/* Upload controls */}
                  <div className="flex-1 space-y-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm text-xs transition-colors">
                      <Upload className="w-3.5 h-3.5 text-sky-600" />
                      <span>{settingsForm.platform_logo ? 'Change Company Logo' : 'Upload Company Logo'}</span>
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/svg+xml, image/webp"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      PNG, JPG, SVG or WebP format. Maximum 2MB. Recommended dimensions: 240×60px with transparent background.
                    </p>

                    <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={logoSetAsFavicon}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setLogoSetAsFavicon(checked);
                            if (checked && settingsForm.platform_logo) {
                              setSettingsForm(prev => ({ ...prev, browser_favicon: prev.platform_logo }));
                              setBrowserFavicon(settingsForm.platform_logo);
                            }
                          }}
                          className="w-3.5 h-3.5 text-sky-600 rounded border-slate-300 focus:ring-sky-500"
                        />
                        <span>Set as browser favicon</span>
                      </label>
                      {settingsForm.platform_logo && (
                        <button
                          type="button"
                          onClick={() => {
                            setSettingsForm(prev => ({ ...prev, browser_favicon: prev.platform_logo }));
                            setBrowserFavicon(settingsForm.platform_logo);
                            setSuccess('System logo applied to browser favicon.');
                          }}
                          className="text-[10px] text-sky-600 hover:text-sky-700 font-semibold underline"
                        >
                          Use Logo as Favicon
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Browser Favicon Icon Upload, Preview, and Tab Simulation */}
              <div className="space-y-2">
                <label className="font-semibold text-slate-700 block flex items-center justify-between">
                  <span>Browser Tab Favicon Icon</span>
                  <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                    <Sparkles className="w-3 h-3" /> Live Browser Dynamic Update
                  </span>
                </label>

                {/* Realistic Browser Tab Simulation */}
                <div className="p-3 bg-slate-900 rounded-xl border border-slate-800 text-white">
                  <div className="flex items-center gap-1.5 mb-2 px-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    <span className="text-[10px] text-slate-400 font-mono ml-2">Live Browser Tab Mockup</span>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-800/90 border border-slate-700/60 rounded-t-lg px-3 py-1.5 max-w-xs shadow-inner">
                    {settingsForm.browser_favicon ? (
                      <img
                        src={settingsForm.browser_favicon}
                        alt="Favicon"
                        className="w-4 h-4 rounded-sm object-contain"
                      />
                    ) : (
                      <div className="w-4 h-4 rounded bg-sky-500 flex items-center justify-center text-[9px] font-bold text-white">
                        N
                      </div>
                    )}
                    <span className="text-xs font-medium text-slate-200 truncate">
                      {settingsForm.platform_name || 'NPB HRMS'} - Portal
                    </span>
                    <span className="ml-auto text-slate-400 hover:text-white text-xs cursor-default">×</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center shadow-sm shrink-0">
                    {settingsForm.browser_favicon ? (
                      <img
                        src={settingsForm.browser_favicon}
                        alt="Favicon"
                        className="w-6 h-6 object-contain"
                      />
                    ) : (
                      <Globe className="w-5 h-5 text-slate-400" />
                    )}
                  </div>

                  <div className="flex-1">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-semibold rounded-lg shadow-sm text-xs transition-colors">
                      <Upload className="w-3.5 h-3.5 text-sky-600" />
                      <span>{settingsForm.browser_favicon ? 'Update Favicon (.ico/.png/.svg)' : 'Upload Browser Favicon'}</span>
                      <input
                        type="file"
                        accept=".ico, image/x-icon, image/png, image/svg+xml"
                        onChange={handleFaviconUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Instantly updates the icon shown in the user's browser tab when applied.
                    </p>
                  </div>

                  {settingsForm.browser_favicon && (
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsForm(prev => ({ ...prev, browser_favicon: '' }));
                        setBrowserFavicon('/favicon.ico');
                      }}
                      className="text-rose-600 hover:text-rose-700 text-xs font-semibold p-1.5 rounded hover:bg-rose-50"
                      title="Reset to default favicon"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              {/* Super Administrator AI Assistant Setting (Default OFF) */}
              <div className="p-4 rounded-xl border border-indigo-150 bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-pink-50/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Super Administrator AI Assistant (Pihu AI)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Default: OFF. When enabled and saved, Pihu AI Assistant is available in the Super Admin panel.
                      </div>
                    </div>
                  </div>

                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    settingsForm.enable_super_admin_ai
                      ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                      : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {settingsForm.enable_super_admin_ai ? 'AI Enabled' : 'AI Disabled (OFF)'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setSettingsForm({ ...settingsForm, enable_super_admin_ai: true })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      settingsForm.enable_super_admin_ai === true
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-400/30'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                    }`}
                  >
                    <Sparkles className={`w-3.5 h-3.5 ${settingsForm.enable_super_admin_ai === true ? 'text-yellow-300' : 'text-indigo-500'}`} />
                    <span>Enable AI Assistant</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSettingsForm({ ...settingsForm, enable_super_admin_ai: false })}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      settingsForm.enable_super_admin_ai === false
                        ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                    }`}
                  >
                    <X className="w-3.5 h-3.5 text-slate-400" />
                    <span>Disable AI Assistant (Default OFF)</span>
                  </button>
                </div>
              </div>

              {/* Branding Mode */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Branding Display Mode</label>
                <select
                  value={settingsForm.show_branding_mode}
                  onChange={(e) => setSettingsForm({ ...settingsForm, show_branding_mode: e.target.value })}
                  className="w-full px-3 py-2 border rounded-xl focus:ring-1 focus:ring-sky-500 text-xs bg-white"
                >
                  <option value="both">Show Both Company Logo & Platform Name</option>
                  <option value="logo_only">Show Logo Only</option>
                  <option value="name_only">Show Platform Name Only</option>
                </select>
              </div>

              <div className="pt-2 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2 text-xs"
                >
                  {savingSettings ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Save Platform Branding</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Super Admin Account & Security */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-100 text-purple-600">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Super Administrator Credentials</h3>
                  <p className="text-xs text-slate-500">Change root username and update root Super Admin password</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full font-bold text-[10px] uppercase tracking-wider">
                Root Authority
              </span>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-4 text-xs">
              {/* Change Username */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Super Admin Username *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={adminAccountForm.username}
                    onChange={(e) => setAdminAccountForm({ ...adminAccountForm, username: e.target.value })}
                    placeholder="e.g. superadmin"
                    className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 text-xs font-mono font-medium"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Used for sign-in access to the primary SaaS platform administrator dashboard.
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  Administrator Full Name
                </label>
                <input
                  type="text"
                  value={adminAccountForm.full_name}
                  onChange={(e) => setAdminAccountForm({ ...adminAccountForm, full_name: e.target.value })}
                  placeholder="e.g. Platform Administrator"
                  className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-1 focus:ring-purple-500 text-xs"
                />
              </div>

              {/* Change Password Section */}
              <div className="pt-3 border-t border-slate-100 space-y-3">
                <div className="flex items-center gap-2 text-slate-800 font-bold">
                  <Key className="w-4 h-4 text-amber-500" />
                  <span>Change Password</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Leave both fields blank if you do not wish to change your current password.
                </p>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">New Password</label>
                  <input
                    type="password"
                    value={adminAccountForm.new_password}
                    onChange={(e) => setAdminAccountForm({ ...adminAccountForm, new_password: e.target.value })}
                    placeholder="Enter new password (min 4 characters)"
                    className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-1 focus:ring-amber-500 text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Confirm New Password</label>
                  <input
                    type="password"
                    value={adminAccountForm.confirm_password}
                    onChange={(e) => setAdminAccountForm({ ...adminAccountForm, confirm_password: e.target.value })}
                    placeholder="Confirm new password"
                    className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-1 focus:ring-amber-500 text-xs"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="submit"
                  disabled={savingAccount}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2 text-xs"
                >
                  {savingAccount ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Key className="w-4 h-4" />
                  )}
                  <span>Update Super Admin Credentials</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 3: Firebase Realtime Database & Cloud Sync */}
          <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  <Flame className="w-5 h-5 text-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-slate-900">Firebase Realtime Database & Cloud Sync</h3>
                    {firebaseStatus.connected ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        Connected & Active ({firebaseStatus.projectId})
                      </span>
                    ) : firebaseStatus.configured ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200">
                        <span className="w-2 h-2 rounded-full bg-sky-500" />
                        Configured ({firebaseStatus.projectId})
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        Awaiting Project Credentials (SQLite Active)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Connect Google Cloud Firebase for live GPS tracking route streaming, ticket chat messaging, and push notifications
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={fetchFirebaseStatus}
                  disabled={loadingFirebase}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5"
                  title="Reload Firebase status"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingFirebase ? 'animate-spin' : ''}`} />
                  <span>Refresh Status</span>
                </button>

                {(firebaseStatus.connected || firebaseStatus.hasServiceAccountKey) && (
                  <button
                    type="button"
                    onClick={handleResetFirebase}
                    disabled={resettingFirebase}
                    className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5"
                    title="Disconnect current Firebase account to configure another project"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>{resettingFirebase ? 'Disconnecting...' : 'Change Firebase Account'}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Architecture Overview Banner */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/5 via-orange-500/5 to-amber-500/5 border border-amber-200/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                  <Database className="w-4 h-4 text-amber-600" />
                  <span>Dual-Engine Architecture: SQLite Core + Firebase Realtime Cloud</span>
                </div>
                <p className="text-xs text-amber-800/80 leading-relaxed max-w-3xl">
                  NPB HRMS runs SQLite for ultra-fast queries, transactional data, and payroll. When Firebase is connected, all companies, employees, users, attendance punches, and live routes synchronize to Google Firebase in real-time. You can fetch and restore all cloud data at any time, or push full database updates.
                </p>
              </div>

              {/* Service Indicator Badges */}
              <div className="flex items-center gap-2 shrink-0 flex-wrap">
                <div className="px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 bg-sky-50 border-sky-200 text-sky-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse" />
                  <span>Background Auto-Sync: Active</span>
                </div>
                <div className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${
                  firebaseStatus.services?.firestore
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${firebaseStatus.services?.firestore ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>Cloud Firestore</span>
                </div>
                <div className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${
                  firebaseStatus.services?.realtimeDb
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${firebaseStatus.services?.realtimeDb ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  <span>Realtime DB</span>
                </div>
                <div className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 ${
                  firebaseStatus.services?.fcm
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}>
                  <Radio className={`w-3 h-3 ${firebaseStatus.services?.fcm ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>FCM Push</span>
                </div>
              </div>
            </div>

            {/* Test Results Message */}
            {firebaseTestResult && (
              <div className={`p-3.5 rounded-xl border text-xs flex items-start gap-3 ${
                firebaseTestResult.success
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}>
                {firebaseTestResult.success ? (
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-bold">{firebaseTestResult.message || (firebaseTestResult.success ? 'Connection Verified' : 'Connection Error')}</p>
                  {firebaseTestResult.success ? (
                    <div className="flex items-center gap-4 text-[11px] text-emerald-700">
                      <span>Project: <strong className="font-mono">{firebaseTestResult.projectId}</strong></span>
                      <span>Firestore Latency: <strong>{firebaseTestResult.firestoreLatencyMs}ms</strong></span>
                      <span>Write Test: <strong>Passed</strong></span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-rose-700 leading-relaxed font-mono">
                      {firebaseTestResult.error}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Firebase Recovery / Restore Results Message */}
            {firebaseSummary && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <p className="font-bold text-emerald-950">Firebase Data Recovery Completed Successfully!</p>
                  <div className="flex items-center gap-4 text-[11px] text-emerald-800 flex-wrap font-medium">
                    <span className="bg-emerald-100/70 px-2 py-0.5 rounded-md">Companies: <strong className="font-bold">{firebaseSummary.restoredCompanies}</strong></span>
                    <span className="bg-emerald-100/70 px-2 py-0.5 rounded-md">Employees: <strong className="font-bold">{firebaseSummary.restoredEmployees}</strong></span>
                    <span className="bg-emerald-100/70 px-2 py-0.5 rounded-md">User Accounts: <strong className="font-bold">{firebaseSummary.restoredUsers}</strong></span>
                    <span className="bg-emerald-100/70 px-2 py-0.5 rounded-md">Attendance Records: <strong className="font-bold">{firebaseSummary.restoredAttendances}</strong></span>
                  </div>
                  <p className="text-[11px] text-emerald-700 leading-relaxed">
                    {firebaseSummary.message || 'All company accounts, managers, support users, and employees can immediately log in and access all data without error.'}
                  </p>
                </div>
              </div>
            )}

            {/* Firebase Form */}
            <form onSubmit={handleSaveFirebaseConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Firebase Project ID *
                  </label>
                  <input
                    type="text"
                    required
                    value={firebaseForm.projectId}
                    onChange={(e) => setFirebaseForm({ ...firebaseForm, projectId: e.target.value })}
                    placeholder="e.g. npb-hrms-live-12345"
                    className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Your Google Cloud / Firebase Project ID found in Firebase Console.
                  </p>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    Realtime Database URL <span className="font-normal text-slate-400">(Optional for Firestore-only)</span>
                  </label>
                  <input
                    type="url"
                    value={firebaseForm.databaseUrl}
                    onChange={(e) => setFirebaseForm({ ...firebaseForm, databaseUrl: e.target.value })}
                    placeholder="https://your-project-default-rtdb.firebaseio.com"
                    className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Firebase Realtime Database instance URL for high-frequency GPS ping sockets.
                  </p>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1 flex items-center justify-between">
                  <span>Firebase Service Account Private Key JSON</span>
                  <span className="text-[11px] text-slate-400 font-normal">
                    {firebaseStatus.hasServiceAccountKey ? '✅ Credentials currently loaded' : 'Paste JSON content below'}
                  </span>
                </label>
                <textarea
                  rows={4}
                  value={firebaseForm.serviceAccountJson}
                  onChange={(e) => setFirebaseForm({ ...firebaseForm, serviceAccountJson: e.target.value })}
                  placeholder={`Paste your Firebase Service Account JSON here, for example:\n{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...",\n  "client_email": "firebase-adminsdk@your-project.iam.gserviceaccount.com"\n}`}
                  className="w-full px-3.5 py-2.5 border rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-mono leading-relaxed bg-slate-900 text-amber-200 placeholder-slate-500"
                />
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mt-1 text-[11px] text-slate-500">
                  <span>Download from: Firebase Console &gt; Project Settings &gt; Service Accounts &gt; "Generate new private key".</span>
                  <span className="text-slate-400">Or place file directly at <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-600">server/config/serviceAccountKey.json</code></span>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* BUTTON 1: Fetch All Data from Firebase */}
                  <button
                    type="button"
                    onClick={handleFetchAllFirebase}
                    disabled={fetchingFirebase || !firebaseStatus.connected}
                    className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl font-semibold transition-all flex items-center gap-2 text-xs shadow-sm disabled:opacity-50"
                    title={firebaseStatus.connected ? "Fetch all company, employee, user, and attendance data from Firebase and restore into website without any error" : "Connect Firebase first to fetch and recover data"}
                  >
                    {fetchingFirebase ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
                    ) : (
                      <DownloadCloud className="w-4 h-4 text-emerald-600" />
                    )}
                    <span>{fetchingFirebase ? 'Fetching All Data...' : 'Fetch All Data from Database'}</span>
                  </button>

                  {/* BUTTON 2: Refresh / Update Database */}
                  <button
                    type="button"
                    onClick={handleSyncAllFirebase}
                    disabled={syncingAllFirebase || !firebaseStatus.connected}
                    className="px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 rounded-xl font-semibold transition-all flex items-center gap-2 text-xs shadow-sm disabled:opacity-50"
                    title={firebaseStatus.connected ? "Refresh and push all website data, companies, and employees into Firebase cloud database without issue" : "Connect Firebase first to refresh database"}
                  >
                    {syncingAllFirebase ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-sky-600" />
                    ) : (
                      <UploadCloud className="w-4 h-4 text-sky-600" />
                    )}
                    <span>{syncingAllFirebase ? 'Refreshing Firebase...' : 'Refresh / Update Database'}</span>
                  </button>

                  {/* Test Connection Ping */}
                  <button
                    type="button"
                    onClick={handleTestFirebaseConnection}
                    disabled={testingFirebase}
                    className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium transition-all flex items-center gap-1.5 text-xs"
                    title="Ping Firebase Firestore and Realtime Database"
                  >
                    {testingFirebase ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-600" />
                    ) : (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{testingFirebase ? 'Testing...' : 'Test Connection'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Change Firebase Account Option */}
                  {(firebaseStatus.connected || firebaseStatus.hasServiceAccountKey) && (
                    <button
                      type="button"
                      onClick={handleResetFirebase}
                      disabled={resettingFirebase}
                      className="px-3.5 py-2.5 bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-700 border border-slate-200 hover:border-rose-200 rounded-xl font-medium transition-colors flex items-center gap-1.5 text-xs"
                      title="Disconnect and change to another Firebase account"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>{resettingFirebase ? 'Disconnecting...' : 'Change Firebase Account'}</span>
                    </button>
                  )}

                  <button
                    type="submit"
                    disabled={savingFirebase}
                    className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:opacity-50 text-white rounded-xl font-semibold shadow-sm transition-all flex items-center gap-2 text-xs"
                  >
                    {savingFirebase ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Flame className="w-4 h-4" />
                    )}
                    <span>Save & Connect Firebase</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE COMPANY */}
      {showCreateCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Create New Tenant Company & Portal
                </h3>
                <p className="text-xs text-slate-500">Register new enterprise workspace & admin account</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateCompany(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCompany} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Company Legal Name *</label>
                    <input
                      type="text"
                      required
                      value={newComp.name}
                      onChange={(e) => setNewComp({ ...newComp, name: e.target.value })}
                      placeholder="e.g. Acme Corporation"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Company Code *</label>
                    <input
                      type="text"
                      required
                      value={newComp.code}
                      onChange={(e) => setNewComp({ ...newComp, code: e.target.value.toUpperCase() })}
                      placeholder="e.g. ACM01"
                      className="w-full px-3 py-2 border rounded-lg uppercase focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Company Email (Optional)</label>
                    <input
                      type="email"
                      value={newComp.email}
                      onChange={(e) => setNewComp({ ...newComp, email: e.target.value })}
                      placeholder="contact@acme.com"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Company Phone (Optional)</label>
                    <input
                      type="text"
                      value={newComp.phone}
                      onChange={(e) => setNewComp({ ...newComp, phone: e.target.value })}
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Company Address (Optional)</label>
                    <input
                      type="text"
                      value={newComp.address}
                      onChange={(e) => setNewComp({ ...newComp, address: e.target.value })}
                      placeholder="e.g. Tower B, Tech Park, Bangalore"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Plan Expiry Date (Optional)</label>
                    <input
                      type="date"
                      value={newComp.plan_expiry_date}
                      onChange={(e) => setNewComp({ ...newComp, plan_expiry_date: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500 font-semibold"
                    />
                    <span className="text-[10px] text-slate-400">Account auto-suspends after this date</span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <span className="font-bold text-slate-800 block mb-0.5">Company Administrator Account (Required on Signup)</span>
                  <p className="text-[11px] text-slate-500 mb-2.5">
                    Set username as Mobile Number, Email Address, or Custom User ID. The administrator can log in using any of these credentials with their custom password.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Admin Username (Mobile No. / Email / Custom User ID) *
                      </label>
                      <input
                        type="text"
                        required
                        value={newComp.admin_username}
                        onChange={(e) => setNewComp({ ...newComp, admin_username: e.target.value })}
                        placeholder="e.g. 9876543210, admin@acme.com, or acme_admin"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-700 block mb-1">
                        Admin Password (Custom Password) *
                      </label>
                      <input
                        type="password"
                        required
                        value={newComp.admin_password}
                        onChange={(e) => setNewComp({ ...newComp, admin_password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                  <div className="mt-2.5">
                    <label className="font-semibold text-slate-700 block mb-1">Admin Email (Optional / Recovery)</label>
                    <input
                      type="email"
                      value={newComp.admin_email}
                      onChange={(e) => setNewComp({ ...newComp, admin_email: e.target.value })}
                      placeholder="admin@acme.com"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                {/* AI Assistant Question & Selection Buttons */}
                <div className="p-3.5 rounded-xl border border-indigo-150 bg-gradient-to-br from-indigo-50/80 via-purple-50/40 to-pink-50/60 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-pink-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Do you want to add AI Feature (Pihu AI) for this Company?
                      </div>
                      <div className="text-[11px] text-slate-500">
                        If enabled, Pihu AI Assistant is accessible across all panels (Admin, Manager, Employee).
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewComp({ ...newComp, enable_ai_assistant: true })}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newComp.enable_ai_assistant === true
                          ? 'bg-indigo-600 text-white border-indigo-700 shadow-md ring-2 ring-indigo-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40'
                      }`}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${newComp.enable_ai_assistant === true ? 'text-yellow-300' : 'text-indigo-500'}`} />
                      <span>Yes, Add AI Feature</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewComp({ ...newComp, enable_ai_assistant: false })}
                      className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newComp.enable_ai_assistant === false
                          ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>No, Do Not Add AI</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowCreateCompany(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Create Company
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREATE SUPPORT USER */}
      {showCreateSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Provision Support Account
                </h3>
                <p className="text-xs text-slate-500">Create new support personnel credentials, scoping & authority</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateSupport(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSupport} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Staff Member Full Name *</label>
                  <input
                    type="text"
                    required
                    value={newSupport.full_name}
                    onChange={(e) => setNewSupport({ ...newSupport, full_name: e.target.value })}
                    placeholder="e.g. Support Specialist"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={newSupport.username}
                    onChange={(e) => setNewSupport({ ...newSupport, username: e.target.value })}
                    placeholder="e.g. support_agent"
                    className="w-full px-3 py-2 border rounded-lg font-mono focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Password *</label>
                  <input
                    type="password"
                    required
                    value={newSupport.password}
                    onChange={(e) => setNewSupport({ ...newSupport, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Address (Optional)</label>
                  <input
                    type="email"
                    value={newSupport.email}
                    onChange={(e) => setNewSupport({ ...newSupport, email: e.target.value })}
                    placeholder="agent@npbhrms.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 text-xs">Support Level / Permission Level *</label>
                    <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                      Level {newSupport.permission_level || 4}
                    </span>
                  </div>
                  <select
                    value={newSupport.permission_level}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setNewSupport({ ...newSupport, permission_level: val, support_level: `Level ${val}` });
                    }}
                    className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-1 focus:ring-purple-500 font-medium text-slate-800"
                  >
                    <option value={1}>Level 1 – View Only Support (Audit Logs & Read-only Access)</option>
                    <option value={2}>Level 2 – Operator Support (Edit Employee, Shifts & Attendance)</option>
                    <option value={3}>Level 3 – Advanced Support (Device Unlock & Attendance Correction)</option>
                    <option value={4}>Level 4 – Full Support Authority (Device Unlock, Biometrics Reset, Account Ops, Realtime Sync)</option>
                  </select>
                  {parseInt(newSupport.permission_level, 10) === 4 && (
                    <div className="mt-1.5 p-2.5 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-[11px] text-purple-900 flex items-start gap-2 shadow-sm">
                      <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>Level 4 Full Authority Active:</strong> User is granted highest privilege support level including Device Unbinding, Biometric Reset, Account Management, Attendance Adjustments, and Live Audit Trail. Stored as Level 4 with automated Firebase Firestore &amp; RTDB real-time sync.
                      </div>
                    </div>
                  )}
                </div>

                {/* Assign Company Scope Selection */}
                <div className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/40 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Assign Company Access *
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Choose whether this support member accesses all companies or only selected companies
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewSupport({ ...newSupport, assign_scope: 'all', assigned_companies: [] })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.assign_scope === 'all'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>All Companies</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const init = newSupport.assigned_companies && newSupport.assigned_companies.length > 0
                          ? newSupport.assigned_companies
                          : (companies.length > 0 ? [companies[0].id] : []);
                        setNewSupport({ ...newSupport, assign_scope: 'custom', assigned_companies: init });
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.assign_scope === 'custom'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Specific Companies</span>
                    </button>
                  </div>

                  {newSupport.assign_scope === 'custom' && (
                    <div className="mt-2 space-y-2 bg-white rounded-xl p-3 border border-purple-200 shadow-xs">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Filter by company name or code..."
                            value={supportCompanySearch}
                            onChange={(e) => setSupportCompanySearch(e.target.value)}
                            className="w-full pl-8 pr-2.5 py-1 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400"
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setNewSupport({ ...newSupport, assigned_companies: companies.map(c => c.id) })}
                            className="text-[10px] px-2 py-0.5 font-semibold text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded"
                          >
                            Select All
                          </button>
                          <span className="text-slate-300 text-xs">|</span>
                          <button
                            type="button"
                            onClick={() => setNewSupport({ ...newSupport, assigned_companies: [] })}
                            className="text-[10px] px-2 py-0.5 font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] font-semibold text-purple-700 flex items-center justify-between px-0.5">
                        <span>Assigned: {newSupport.assigned_companies?.length || 0} company(ies) selected</span>
                        {(!newSupport.assigned_companies || newSupport.assigned_companies.length === 0) && (
                          <span className="text-rose-500 font-normal">Select at least one company</span>
                        )}
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {companies
                          .filter(c => {
                            if (!supportCompanySearch.trim()) return true;
                            const term = supportCompanySearch.toLowerCase();
                            return (c.name || '').toLowerCase().includes(term) || (c.code || '').toLowerCase().includes(term);
                          })
                          .map(c => {
                            const isSelected = newSupport.assigned_companies?.includes(c.id);
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  const current = newSupport.assigned_companies || [];
                                  const updated = isSelected ? current.filter(id => id !== c.id) : [...current, c.id];
                                  setNewSupport({ ...newSupport, assigned_companies: updated });
                                }}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-purple-50 border-purple-400 text-purple-900 font-semibold'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded text-purple-600 focus:ring-purple-400 pointer-events-none"
                                  />
                                  <div className="truncate">
                                    <span>{c.name}</span>
                                    <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({c.code})</span>
                                  </div>
                                </div>
                                {c.total_employees !== undefined && (
                                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                    {c.total_employees} emp
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        {companies.length === 0 && (
                          <div className="text-center py-4 text-slate-400 text-xs">
                            No companies available in system yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Feature Question & Selection for Support Account */}
                <div className="p-3.5 rounded-xl border border-purple-150 bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-pink-50/60 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Do you want to add AI Feature (Pihu AI) for this Support Account?
                      </div>
                      <div className="text-[11px] text-slate-500">
                        If enabled, this support staff member can access and chat with Pihu AI.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewSupport({ ...newSupport, enable_ai_assistant: true })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.enable_ai_assistant === true
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${newSupport.enable_ai_assistant === true ? 'text-yellow-300' : 'text-purple-500'}`} />
                      <span>Yes, Add AI Feature</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewSupport({ ...newSupport, enable_ai_assistant: false })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.enable_ai_assistant === false
                          ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>No, Do Not Add AI</span>
                    </button>
                  </div>
                </div>

                {/* Audit Log Access Permission for Support Account */}
                <div className="p-3.5 rounded-xl border border-emerald-150 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-slate-50/60 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Audit Log Access Permission
                      </div>
                      <div className="text-[11px] text-slate-500">
                        If enabled, this support staff can view and manage the Audit Action Logs page in Support Panel. If disabled, the page is completely hidden from their Support Panel.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setNewSupport({ ...newSupport, enable_audit_logs: true })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.enable_audit_logs === true
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                      }`}
                    >
                      <CheckCircle className={`w-3.5 h-3.5 ${newSupport.enable_audit_logs === true ? 'text-emerald-100' : 'text-emerald-500'}`} />
                      <span>Enable Audit Logs</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setNewSupport({ ...newSupport, enable_audit_logs: false })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        newSupport.enable_audit_logs === false
                          ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Disable (Hide Page)</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowCreateSupport(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT COMPANY & ADMIN DETAILS */}
      {showEditCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Edit Company & Administrator Details</h3>
                <p className="text-xs text-slate-400">Modify corporate master data, status, and administrator credentials</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditCompany(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditCompany} className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Legal Name *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.name}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, name: e.target.value })}
                    placeholder="e.g. Acme Corporation"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Code *</label>
                  <input
                    type="text"
                    required
                    value={editCompanyForm.code}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, code: e.target.value.toUpperCase() })}
                    placeholder="e.g. ACM01"
                    className="w-full px-3 py-2 border rounded-lg uppercase font-mono focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Email (Optional)</label>
                  <input
                    type="email"
                    value={editCompanyForm.email}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, email: e.target.value })}
                    placeholder="contact@acme.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Phone (Optional)</label>
                  <input
                    type="text"
                    value={editCompanyForm.phone}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, phone: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Address (Optional)</label>
                  <input
                    type="text"
                    value={editCompanyForm.address}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, address: e.target.value })}
                    placeholder="Corporate office address"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Company Status *</label>
                  <select
                    value={editCompanyForm.status}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, status: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg bg-white focus:ring-1 focus:ring-sky-500 font-semibold"
                  >
                    <option value="active">Active (Full Access)</option>
                    <option value="disabled">Disabled (Portal Suspended)</option>
                    <option value="banned">Banned (Restricted)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Subscription Plan Expiry Date</label>
                  <input
                    type="date"
                    value={editCompanyForm.plan_expiry_date || ''}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, plan_expiry_date: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500 font-semibold"
                  />
                  <span className="text-[10px] text-slate-400">Company & all users suspended after this date</span>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-3">
                <span className="font-bold text-slate-800 block mb-1">Company Administrator Account</span>
                <p className="text-[11px] text-slate-500 mb-2">
                  Admin username can be updated if required. Password change is optional during editing.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Admin Username</label>
                    <input
                      type="text"
                      value={editCompanyForm.admin_username}
                      onChange={(e) => setEditCompanyForm({ ...editCompanyForm, admin_username: e.target.value })}
                      placeholder="e.g. acme_admin"
                      className="w-full px-3 py-2 border rounded-lg font-mono focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">
                      New Admin Password <span className="font-normal text-slate-400">(Optional)</span>
                    </label>
                    <input
                      type="password"
                      value={editCompanyForm.admin_password}
                      onChange={(e) => setEditCompanyForm({ ...editCompanyForm, admin_password: e.target.value })}
                      placeholder="Leave blank to keep unchanged"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div className="mt-2">
                  <label className="font-semibold text-slate-700 block mb-1">Admin Contact Email (Optional)</label>
                  <input
                    type="email"
                    value={editCompanyForm.admin_email}
                    onChange={(e) => setEditCompanyForm({ ...editCompanyForm, admin_email: e.target.value })}
                    placeholder="admin@acme.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditCompany(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE ADMIN PASSWORD */}
      {showPasswordModal && passwordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Change Admin Password</h3>
                <p className="text-xs text-slate-500">{passwordTarget.companyName}</p>
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Company Administrator Username</label>
                <input
                  type="text"
                  disabled
                  value={passwordTarget.username}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-100 font-mono text-slate-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">New Secure Password *</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new administrator password"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-amber-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">Minimum 4 characters required.</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PERMANENTLY DELETE COMPANY */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Permanently Delete Company</h3>
                <p className="text-xs text-rose-600 font-semibold">Irreversible Database Deletion</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-2">
              <p className="font-bold">
                Are you sure you want to permanently purge "{deleteTarget.name}" ({deleteTarget.code})?
              </p>
              <p className="text-[11px] leading-relaxed">
                This will permanently delete from the website, database, and cloud:
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-700">
                <li>All company staff, managers & employees</li>
                <li>All user login accounts & device bindings</li>
                <li>All attendance logs, GPS punches & tracking coordinates</li>
                <li>All leave records, balances, quotas & transactions</li>
                <li>All geofences, shifts, and helpdesk tickets</li>
                <li>Permanent purge tombstone recorded: Zero data can ever be recovered or resurrected even upon Firebase reconnection</li>
              </ul>
              <p className="font-black text-rose-900 text-[11px] pt-1">
                ⚠️ THIS ACTION IS 100% PERMANENT AND CAN NEVER BE RECOVERED OR UNDONE!
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Permanently</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BULK DELETE COMPANIES PERMANENTLY */}
      {showBulkDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Bulk Delete Companies Permanently</h3>
                <p className="text-xs text-rose-600 font-semibold">100% Irreversible Database Purge</p>
              </div>
            </div>

            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-3">
              <p className="font-bold text-sm text-rose-900">
                You have selected {selectedCompanyIds.length} company portal(s) for permanent hard deletion:
              </p>

              <div className="max-h-36 overflow-y-auto bg-white/80 p-2.5 rounded-lg border border-rose-200 space-y-1">
                {companies.filter(c => selectedCompanyIds.includes(c.id)).map(c => (
                  <div key={c.id} className="flex items-center justify-between text-[11px] font-medium text-slate-800">
                    <span className="font-semibold">{c.name} ({c.code})</span>
                    <span className="text-rose-600 font-mono text-[10px] uppercase font-bold">{c.status}</span>
                  </div>
                ))}
              </div>

              <div className="space-y-1">
                <p className="font-bold text-rose-900">Permanent Hard Deletion Warning:</p>
                <ul className="list-disc list-inside text-[11px] text-rose-700 space-y-0.5">
                  <li>Zero recovery: Purged tombstones recorded so data CANNOT be recovered or resurrected even upon Firebase reconnection.</li>
                  <li>All employee profiles, users, login credentials, and device bindings will be deleted.</li>
                  <li>All attendance punches, GPS tracking coordinates, and shift rosters will be wiped out.</li>
                  <li>All leave requests, balances, service tickets, and company settings will be permanently destroyed.</li>
                </ul>
              </div>

              <p className="font-black text-rose-950 text-xs bg-rose-200/60 p-2 rounded-lg text-center">
                ⚠️ THIS HARD DELETION IS ABSOLUTE AND PERMANENT WITH ZERO RECOVERY!
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={() => setShowBulkDeleteModal(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkDeleting}
                onClick={handleBulkDeleteCompanies}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                {bulkDeleting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Deleting Permanently...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All {selectedCompanyIds.length} Companies Permanently</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT SUPPORT USER */}
      {showEditSupport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Support Staff Account
                </h3>
                <p className="text-xs text-slate-500">Update support user permissions and settings</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditSupport(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSupport} className="flex flex-col flex-1 overflow-hidden min-h-0">
              <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Staff Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editSupportForm.full_name}
                    onChange={(e) => setEditSupportForm({ ...editSupportForm, full_name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={editSupportForm.username}
                    onChange={(e) => setEditSupportForm({ ...editSupportForm, username: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg font-mono focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email Address</label>
                  <input
                    type="email"
                    value={editSupportForm.email}
                    onChange={(e) => setEditSupportForm({ ...editSupportForm, email: e.target.value })}
                    placeholder="support@npbhrms.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Support Level *</label>
                    <select
                      value={editSupportForm.permission_level}
                      onChange={(e) => {
                        const val = parseInt(e.target.value, 10);
                        setEditSupportForm({ ...editSupportForm, permission_level: val, support_level: `Level ${val}` });
                      }}
                      className="w-full px-2.5 py-2 border rounded-lg bg-white font-medium"
                    >
                      <option value={1}>Level 1 – View Only</option>
                      <option value={2}>Level 2 – Edit Attendance</option>
                      <option value={3}>Level 3 – Device Unlock</option>
                      <option value={4}>Level 4 – Full Authority</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Status *</label>
                    <select
                      value={editSupportForm.status}
                      onChange={(e) => setEditSupportForm({ ...editSupportForm, status: e.target.value })}
                      className="w-full px-2.5 py-2 border rounded-lg bg-white font-semibold"
                    >
                      <option value="active">Active</option>
                      <option value="disabled">Disabled / Suspended</option>
                    </select>
                  </div>
                </div>
                {parseInt(editSupportForm.permission_level, 10) === 4 && (
                  <div className="p-2 rounded-lg bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 text-[11px] text-purple-900 flex items-start gap-1.5 shadow-sm">
                    <ShieldCheck className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <span><strong>Level 4 Full Authority Active:</strong> User possesses complete permissions for live audit reports, biometric reset, device unlock, and immediate Firebase realtime synchronization.</span>
                  </div>
                )}

                {/* Assign Company Scope Selection */}
                <div className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/40 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Assign Company Access *
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Choose whether this support member accesses all companies or only selected companies
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditSupportForm({ ...editSupportForm, assign_scope: 'all', assigned_companies: [] })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.assign_scope === 'all'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Globe className="w-3.5 h-3.5" />
                      <span>All Companies</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const init = editSupportForm.assigned_companies && editSupportForm.assigned_companies.length > 0
                          ? editSupportForm.assigned_companies
                          : (companies.length > 0 ? [companies[0].id] : []);
                        setEditSupportForm({ ...editSupportForm, assign_scope: 'custom', assigned_companies: init });
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.assign_scope === 'custom'
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Building2 className="w-3.5 h-3.5" />
                      <span>Specific Companies</span>
                    </button>
                  </div>

                  {editSupportForm.assign_scope === 'custom' && (
                    <div className="mt-2 space-y-2 bg-white rounded-xl p-3 border border-purple-200 shadow-xs">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-slate-100">
                        <div className="relative flex-1">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder="Filter by company name or code..."
                            value={supportCompanySearch}
                            onChange={(e) => setSupportCompanySearch(e.target.value)}
                            className="w-full pl-8 pr-2.5 py-1 text-[11px] border border-slate-200 rounded-lg focus:outline-none focus:border-purple-400"
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditSupportForm({ ...editSupportForm, assigned_companies: companies.map(c => c.id) })}
                            className="text-[10px] px-2 py-0.5 font-semibold text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded"
                          >
                            Select All
                          </button>
                          <span className="text-slate-300 text-xs">|</span>
                          <button
                            type="button"
                            onClick={() => setEditSupportForm({ ...editSupportForm, assigned_companies: [] })}
                            className="text-[10px] px-2 py-0.5 font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] font-semibold text-purple-700 flex items-center justify-between px-0.5">
                        <span>Assigned: {editSupportForm.assigned_companies?.length || 0} company(ies) selected</span>
                        {(!editSupportForm.assigned_companies || editSupportForm.assigned_companies.length === 0) && (
                          <span className="text-rose-500 font-normal">Select at least one company</span>
                        )}
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                        {companies
                          .filter(c => {
                            if (!supportCompanySearch.trim()) return true;
                            const term = supportCompanySearch.toLowerCase();
                            return (c.name || '').toLowerCase().includes(term) || (c.code || '').toLowerCase().includes(term);
                          })
                          .map(c => {
                            const isSelected = editSupportForm.assigned_companies?.includes(c.id);
                            return (
                              <div
                                key={c.id}
                                onClick={() => {
                                  const current = editSupportForm.assigned_companies || [];
                                  const updated = isSelected ? current.filter(id => id !== c.id) : [...current, c.id];
                                  setEditSupportForm({ ...editSupportForm, assigned_companies: updated });
                                }}
                                className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                                  isSelected
                                    ? 'bg-purple-50 border-purple-400 text-purple-900 font-semibold'
                                    : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => {}}
                                    className="rounded text-purple-600 focus:ring-purple-400 pointer-events-none"
                                  />
                                  <div className="truncate">
                                    <span>{c.name}</span>
                                    <span className="text-[10px] text-slate-400 ml-1.5 font-mono">({c.code})</span>
                                  </div>
                                </div>
                                {c.total_employees !== undefined && (
                                  <span className="text-[10px] text-slate-400 shrink-0 font-mono">
                                    {c.total_employees} emp
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        {companies.length === 0 && (
                          <div className="text-center py-4 text-slate-400 text-xs">
                            No companies available in system yet.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* AI Feature Assignment for Edit Support */}
                <div className="p-3.5 rounded-xl border border-purple-150 bg-gradient-to-br from-purple-50/80 via-indigo-50/40 to-pink-50/60 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <Sparkles className="w-4 h-4 text-yellow-300" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        AI Feature (Pihu AI) Access
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Enable or disable Pihu AI assistant for this support staff user
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditSupportForm({ ...editSupportForm, enable_ai_assistant: true })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.enable_ai_assistant === true
                          ? 'bg-purple-600 text-white border-purple-700 shadow-md ring-2 ring-purple-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50/40'
                      }`}
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${editSupportForm.enable_ai_assistant === true ? 'text-yellow-300' : 'text-purple-500'}`} />
                      <span>Enabled</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditSupportForm({ ...editSupportForm, enable_ai_assistant: false })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.enable_ai_assistant === false
                          ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Disabled</span>
                    </button>
                  </div>
                </div>

                {/* Audit Log Access Permission for Support Account */}
                <div className="p-3.5 rounded-xl border border-emerald-150 bg-gradient-to-br from-emerald-50/80 via-teal-50/40 to-slate-50/60 space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-600 to-teal-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs">
                        Audit Log Access Permission
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Enable or disable the Audit Action Logs & Reports page in Support Panel for this user
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setEditSupportForm({ ...editSupportForm, enable_audit_logs: true })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.enable_audit_logs === true
                          ? 'bg-emerald-600 text-white border-emerald-700 shadow-md ring-2 ring-emerald-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                      }`}
                    >
                      <CheckCircle className={`w-3.5 h-3.5 ${editSupportForm.enable_audit_logs === true ? 'text-emerald-100' : 'text-emerald-500'}`} />
                      <span>Enabled</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEditSupportForm({ ...editSupportForm, enable_audit_logs: false })}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        editSupportForm.enable_audit_logs === false
                          ? 'bg-slate-800 text-white border-slate-900 shadow-md ring-2 ring-slate-400/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                      <span>Disabled (Hidden)</span>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 block mb-1">
                    New Password <span className="font-normal text-slate-400">(Leave blank to keep unchanged)</span>
                  </label>
                  <input
                    type="password"
                    value={editSupportForm.password}
                    onChange={(e) => setEditSupportForm({ ...editSupportForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 flex justify-end gap-2 shrink-0 bg-slate-50">
                <button
                  type="button"
                  onClick={() => setShowEditSupport(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CHANGE SUPPORT PASSWORD */}
      {showSupportPasswordModal && supportPasswordTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Change Support Password</h3>
                <p className="text-xs text-slate-500">{supportPasswordTarget.fullName} ({supportPasswordTarget.username})</p>
              </div>
            </div>

            <form onSubmit={handleSaveSupportPassword} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Support Username</label>
                <input
                  type="text"
                  disabled
                  value={supportPasswordTarget.username}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-100 font-mono text-slate-600"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">New Secure Password *</label>
                <input
                  type="password"
                  required
                  value={newSupportPassword}
                  onChange={(e) => setNewSupportPassword(e.target.value)}
                  placeholder="Enter new support password"
                  className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-amber-500"
                  autoFocus
                />
                <p className="text-[11px] text-slate-400 mt-1">Minimum 4 characters required.</p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupportPasswordModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE SUPPORT USER */}
      {showDeleteSupportModal && supportToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Support Staff Account</h3>
                <p className="text-xs text-rose-600 font-semibold">Irreversible Action</p>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1.5">
              <p className="font-bold">
                Are you sure you want to permanently delete support member "{supportToDelete.fullName}" ({supportToDelete.username})?
              </p>
              <p className="text-[11px] text-rose-700 leading-relaxed">
                This will delete their user login credentials and revoke all operations authority across all tenant companies immediately.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setShowDeleteSupportModal(false); setSupportToDelete(null); }}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSupport}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Account</span>
              </button>
            </div>
          </div>
        </div>
      )}


      {/* MODAL: EDIT DIRECTORY EMPLOYEE */}
      {showEditDirEmployeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Employee Record
                </h3>
                <p className="text-xs text-slate-500">Update account profile, department & status</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditDirEmployeeModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditDirEmployee} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={editDirEmployeeForm.employee_id}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono uppercase"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editDirEmployeeForm.full_name}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, full_name: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={editDirEmployeeForm.email}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, email: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={editDirEmployeeForm.mobile}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, mobile: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={editDirEmployeeForm.department}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={editDirEmployeeForm.designation}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">City / Location</label>
                  <input
                    type="text"
                    value={editDirEmployeeForm.city}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Account Status</label>
                  <select
                    value={editDirEmployeeForm.status}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, status: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white font-medium"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="suspended">Suspended</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Reset Password</label>
                  <input
                    type="password"
                    value={editDirEmployeeForm.password}
                    onChange={(e) => setEditDirEmployeeForm({ ...editDirEmployeeForm, password: e.target.value })}
                    placeholder="Leave blank to keep"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditDirEmployeeModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MODULE CONFIGURATION */}
      {modulesModalOpen && selectedCompanyModules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-none max-w-4xl w-full p-6 shadow-2xl border-2 border-slate-300 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    Module Configuration: {selectedCompanyModules.companyName}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Enable or disable system modules. Disabled modules are immediately hidden and blocked across Company Admin, Manager, and Employee portals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModulesModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
              {effectiveModules.map((m) => {
                const isEnabled = selectedCompanyModules.modules[m.key] === true || selectedCompanyModules.modules[m.key] === 1;
                return (
                  <div
                    key={m.key}
                    onClick={() => toggleCompanyModule(m.key)}
                    className={`p-3.5 border rounded-none transition-all cursor-pointer select-none flex items-start justify-between gap-3 ${
                      isEnabled
                        ? 'bg-sky-50/50 border-sky-300 shadow-xs'
                        : 'bg-slate-50 border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-800">{m.label}</span>
                        {m.is_core ? (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 uppercase tracking-wider">
                            Core
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-100 text-purple-700 uppercase tracking-wider">
                            Custom
                          </span>
                        )}
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider ${
                          isEnabled
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}>
                          {isEnabled ? 'Enabled' : 'Disabled (OFF)'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 leading-relaxed">{m.desc}</p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleCompanyModule(m.key);
                      }}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                        isEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                Active Modules: <strong className="text-slate-800">
                  {effectiveModules.filter(m => selectedCompanyModules.modules[m.key] === true || selectedCompanyModules.modules[m.key] === 1).length}
                </strong> of {effectiveModules.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setModulesModalOpen(false)}
                  className="px-4 py-2 border border-slate-300 rounded-none text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveModules}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-none font-bold text-xs shadow-sm"
                >
                  Save Module Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW MODULE */}
      {showCreateModuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-none max-w-xl w-full p-6 shadow-2xl border-2 border-slate-300 space-y-4 my-8">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    Add New Platform Module
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register a new module to extend system capabilities and tenant entitlements.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModuleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateModule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Module Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Visitor Management System"
                  value={createModuleForm.name}
                  onChange={(e) => {
                    const nameVal = e.target.value;
                    const autoKey = nameVal.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
                    setCreateModuleForm(prev => ({
                      ...prev,
                      name: nameVal,
                      key: prev.key === '' || prev.key === prev.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') ? autoKey : prev.key
                    }));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Module Key (System Identifier) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. visitor_management"
                  value={createModuleForm.key}
                  onChange={(e) => {
                    const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    setCreateModuleForm(prev => ({ ...prev, key: clean }));
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs font-mono focus:ring-1 focus:ring-sky-500 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1 font-mono">
                  Unique programmatic slug (lowercase letters, numbers, and underscores).
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Category
                </label>
                <select
                  value={createModuleForm.category}
                  onChange={(e) => setCreateModuleForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none bg-white"
                >
                  <option value="Workforce Management">Workforce Management</option>
                  <option value="Attendance & Time">Attendance & Time</option>
                  <option value="Security & Compliance">Security & Compliance</option>
                  <option value="Operations & Logistics">Operations & Logistics</option>
                  <option value="Finance & Payroll">Finance & Payroll</option>
                  <option value="AI & Intelligence">AI & Intelligence</option>
                  <option value="Communication & Support">Communication & Support</option>
                  <option value="Custom Extensions">Custom Extensions</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  placeholder="Explain what this module allows employees, managers, or company admins to do..."
                  value={createModuleForm.description}
                  onChange={(e) => setCreateModuleForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                <span className="font-bold">Notice on Default Status:</span> This newly added module will immediately appear inside the company accounts rows and module configure button with access set to <strong className="text-rose-700">OFF (disabled)</strong> by default across all companies. Once you enable it for a company, that company will gain access.
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowCreateModuleModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-none text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingModule}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-none font-bold text-xs shadow-sm flex items-center gap-1.5 uppercase tracking-wider"
                >
                  {creatingModule ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      Create Module
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: MANAGE COMPANY ACCESS FOR A SPECIFIC MODULE */}
      {showCompanyAccessModal && selectedModuleForAccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-none max-w-3xl w-full p-6 shadow-2xl border-2 border-slate-300 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    Company Entitlements: {selectedModuleForAccess.name || selectedModuleForAccess.label}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Module Key: <code className="font-mono text-slate-700 bg-slate-100 px-1">{selectedModuleForAccess.module_key || selectedModuleForAccess.key}</code> • Category: <strong className="text-slate-700">{selectedModuleForAccess.category}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCompanyAccessModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* Quick Actions & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter companies by name or code..."
                  value={accessCompanySearch}
                  onChange={(e) => setAccessCompanySearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleBatchToggleAccess(true)}
                  disabled={togglingCompanyId !== null}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 text-xs font-bold rounded-none transition-colors"
                >
                  Enable for All
                </button>
                <button
                  type="button"
                  onClick={() => handleBatchToggleAccess(false)}
                  disabled={togglingCompanyId !== null}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold rounded-none transition-colors"
                >
                  Disable for All
                </button>
              </div>
            </div>

            {/* Companies List */}
            <div className="border border-slate-200 max-h-[50vh] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="p-2.5">Company Name & Code</th>
                    <th className="p-2.5">Account Status</th>
                    <th className="p-2.5 text-center">Module Access</th>
                    <th className="p-2.5 text-right">Action Toggle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(selectedModuleForAccess.company_access || [])
                    .filter(ca => {
                      if (!accessCompanySearch.trim()) return true;
                      const q = accessCompanySearch.toLowerCase();
                      return (
                        ca.name.toLowerCase().includes(q) ||
                        ca.code.toLowerCase().includes(q)
                      );
                    })
                    .map(ca => {
                      const isEnabled = ca.is_enabled === true || ca.is_enabled === 1;
                      const isTogglingThis = togglingCompanyId === ca.id;

                      return (
                        <tr key={ca.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2.5">
                            <div className="font-bold text-slate-800">{ca.name}</div>
                            <span className="font-mono text-[11px] text-slate-500">{ca.code}</span>
                          </td>
                          <td className="p-2.5">
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                              ca.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-600 border border-slate-200'
                            }`}>
                              {ca.status || 'Active'}
                            </span>
                          </td>
                          <td className="p-2.5 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded ${
                              isEnabled
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}>
                              {isEnabled ? 'Enabled (ON)' : 'Disabled (OFF)'}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            <button
                              type="button"
                              disabled={isTogglingThis || togglingCompanyId === 'all'}
                              onClick={() => handleToggleCompanyModuleAccess(ca.id, isEnabled)}
                              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
                                isEnabled ? 'bg-emerald-600' : 'bg-slate-300'
                              } ${isTogglingThis ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {(!selectedModuleForAccess.company_access || selectedModuleForAccess.company_access.length === 0) && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-400 text-xs">
                        No active companies found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-200">
              <span className="text-xs text-slate-500">
                Enabled for <strong className="text-slate-800">{selectedModuleForAccess.enabled_companies}</strong> of {selectedModuleForAccess.total_companies} companies
              </span>
              <button
                type="button"
                onClick={() => setShowCompanyAccessModal(false)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-none font-bold text-xs uppercase tracking-wider"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT CUSTOM MODULE */}
      {showEditModuleModal && moduleToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-none max-w-lg w-full p-6 shadow-2xl border-2 border-slate-300 space-y-4 my-8">
            <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-sky-600" />
                  <h3 className="text-base font-bold text-slate-900 uppercase tracking-wide">
                    Edit Custom Module: {moduleToEdit.name || moduleToEdit.label}
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Key: <code className="font-mono text-slate-700 bg-slate-100 px-1">{moduleToEdit.module_key || moduleToEdit.key}</code>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModuleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateModule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Module Name *
                </label>
                <input
                  type="text"
                  required
                  value={editModuleForm.name}
                  onChange={(e) => setEditModuleForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={editModuleForm.category}
                  onChange={(e) => setEditModuleForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={editModuleForm.description}
                  onChange={(e) => setEditModuleForm(prev => ({ ...prev, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-none text-xs focus:ring-1 focus:ring-sky-500 outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowEditModuleModal(false)}
                  className="px-4 py-2 border border-slate-300 rounded-none text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingModule}
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-none font-bold text-xs shadow-sm flex items-center gap-1.5 uppercase tracking-wider"
                >
                  {updatingModule ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CUSTOM MODULE CONFIRMATION */}
      {showDeleteModuleModal && moduleToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-none max-w-md w-full p-6 shadow-2xl border-2 border-rose-300 space-y-4">
            <div className="flex items-center gap-2.5 border-b border-rose-100 pb-3">
              <div className="p-2 bg-rose-50 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 uppercase">Delete Custom Module</h3>
                <p className="text-xs text-slate-500 font-mono">{moduleToDelete.name || moduleToDelete.label} ({moduleToDelete.module_key || moduleToDelete.key})</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete this custom module? This will remove the module and revoke access across all company accounts.
            </p>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowDeleteModuleModal(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingModule}
                onClick={handleDeleteModule}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-none font-bold text-xs shadow-sm flex items-center gap-1.5 uppercase tracking-wider"
              >
                {deletingModule ? 'Deleting...' : 'Delete Module'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMPLOYEE PASSWORD RESET MODAL */}
      <EmployeeChangePasswordModal
        isOpen={showDirPasswordModal}
        onClose={() => {
          setShowDirPasswordModal(false);
          setSelectedDirEmployeeForPassword(null);
        }}
        employee={selectedDirEmployeeForPassword}
        onSuccess={(msg) => {
          setSuccess(msg);
          fetchData();
        }}
      />

      {/* Custom Export Modal */}
      <CustomExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
      />
    </div>
  );
}
