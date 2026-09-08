import React, { useState, useEffect } from 'react';
import {
  Building2, Users, Shield, Clock, Plus, CheckCircle, AlertTriangle,
  Ban, ToggleLeft, ToggleRight, Trash2, Edit3, Settings2, Search,
  RefreshCw, FileSpreadsheet, Eye, ArrowUpRight, Key, Lock,
  Upload, Image, Globe, Save, Check, UserCheck, Sparkles, Sliders,
  ChevronLeft, ChevronRight, SlidersHorizontal, Filter, Compass
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
    admin_username: '', admin_password: '', admin_email: ''
  });

  // Change Admin Password Modal State
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordTarget, setPasswordTarget] = useState(null); // { companyId, companyName, username }
  const [newPassword, setNewPassword] = useState('');

  // Permanent Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name, code }

  // Company Portals Directory & Bulk Controls
  const [companyFilterStatus, setCompanyFilterStatus] = useState('all'); // 'all' | 'active' | 'closed'
  const [companySearchQuery, setCompanySearchQuery] = useState('');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState([]);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // New Company Form State (Portal Display Name removed as requested)
  const [newComp, setNewComp] = useState({
    name: '', code: '', email: '', phone: '', address: '',
    admin_username: '', admin_password: '', admin_email: '',
    timezone: 'Asia/Kolkata', working_hours_per_day: 8.0,
    half_day_min_hours: 4.0, full_day_min_hours: 8.0,
    show_branding_mode: 'both'
  });

  // New Support User Form State
  const [newSupport, setNewSupport] = useState({
    full_name: '', username: '', password: '', email: '', permission_level: 3
  });

  // Support Account Management States
  const [showEditSupport, setShowEditSupport] = useState(false);
  const [editingSupportId, setEditingSupportId] = useState(null);
  const [editSupportForm, setEditSupportForm] = useState({
    username: '', full_name: '', email: '', permission_level: 1, status: 'active', password: ''
  });

  const [showSupportPasswordModal, setShowSupportPasswordModal] = useState(false);
  const [supportPasswordTarget, setSupportPasswordTarget] = useState(null); // { userId, username, fullName }
  const [newSupportPassword, setNewSupportPassword] = useState('');

  const [showDeleteSupportModal, setShowDeleteSupportModal] = useState(false);
  const [supportToDelete, setSupportToDelete] = useState(null); // { userId, username, fullName }

  // System Settings State
  const [settingsForm, setSettingsForm] = useState({
    platform_name: 'NPB HRMS',
    platform_logo: '',
    browser_favicon: '',
    show_branding_mode: 'both'
  });
  const [adminAccountForm, setAdminAccountForm] = useState({
    username: '',
    full_name: '',
    new_password: '',
    confirm_password: ''
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);


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
      if (activeTab === 'companies' || activeTab === 'dashboard') {
        const queryParams = new URLSearchParams();
        if (activeTab === 'companies') {
          if (companyFilterStatus !== 'all') queryParams.append('status', companyFilterStatus);
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
              show_branding_mode: setRes.settings.show_branding_mode || 'both'
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
    return () => window.removeEventListener('master-refresh', handleMasterRefresh);
  }, [activeTab, dirPage, dirPageSize, dirCompanyFilter, dirRoleFilter, dirStatusFilter, dirCityFilter, dirSearchQuery, companyFilterStatus, companySearchQuery]);

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
      setSettingsForm(prev => ({ ...prev, platform_logo: reader.result }));
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

  const handleCreateCompany = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest('/companies', {
        method: 'POST',
        body: {
          ...newComp,
          portal_name: newComp.name.trim()
        }
      });
      setSuccess(`Company "${newComp.name}" created successfully with Admin "${newComp.admin_username}".`);
      setShowCreateCompany(false);
      setNewComp({
        name: '', code: '', email: '', phone: '', address: '',
        admin_username: '', admin_password: '', admin_email: '',
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
    const allVisibleIds = companies.map(c => c.id);
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
    try {
      await apiRequest('/support/users', {
        method: 'POST',
        body: newSupport
      });
      setSuccess(`Support account "${newSupport.username}" created successfully.`);
      setShowCreateSupport(false);
      setNewSupport({ full_name: '', username: '', password: '', email: '', permission_level: 3 });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openEditSupport = (s) => {
    setError('');
    setEditingSupportId(s.user_id);
    setEditSupportForm({
      username: s.username || '',
      full_name: s.full_name || '',
      email: s.email || '',
      permission_level: s.permission_level || 1,
      status: s.status || 'active',
      password: ''
    });
    setShowEditSupport(true);
  };

  const handleSaveEditSupport = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await apiRequest(`/support/users/${editingSupportId}`, {
        method: 'PUT',
        body: {
          username: editSupportForm.username.trim(),
          full_name: editSupportForm.full_name.trim(),
          email: editSupportForm.email ? editSupportForm.email.trim() : null,
          permission_level: parseInt(editSupportForm.permission_level, 10),
          status: editSupportForm.status,
          password: editSupportForm.password ? editSupportForm.password.trim() : undefined
        }
      });
      setSuccess(`Support account "${editSupportForm.username}" updated successfully.`);
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
    if (!window.confirm(`Are you sure you want to delete employee "${name}"? This will deactivate the account.`)) return;
    try {
      await apiRequest(`/employees/${empId}`, { method: 'DELETE' });
      setSuccess(`Employee "${name}" deleted.`);
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
    if (!window.confirm(`Are you sure you want to soft-delete company "${name}"? Historical audit records will be preserved.`)) return;
    try {
      await apiRequest(`/companies/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const openModulesModal = async (companyId) => {
    try {
      const res = await apiRequest(`/companies/${companyId}`);
      setSelectedCompanyModules({
        companyId,
        companyName: res.company.name,
        modules: res.modules
      });
      setModulesModalOpen(true);
    } catch (err) {
      setError(err.message);
    }
  };

  const saveModules = async () => {
    if (!selectedCompanyModules) return;
    try {
      await apiRequest(`/companies/${selectedCompanyModules.companyId}/modules`, {
        method: 'PUT',
        body: { modules: selectedCompanyModules.modules }
      });
      setModulesModalOpen(false);
      setSuccess('Modules updated successfully.');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Compute Dashboard Global Stats
  const totalEmployees = companies.reduce((sum, c) => sum + (c.total_employees || 0), 0);
  const activeCompanies = companies.filter(c => c.status === 'active').length;
  const disabledCompanies = companies.filter(c => c.status === 'disabled').length;
  const bannedCompanies = companies.filter(c => c.status === 'banned').length;

  return (
    <div className="space-y-6">
      {/* Top Banner / Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? `Welcome, ${user.fullName || user.username} (Super Admin)`
              : activeTab === 'settings'
              ? 'Platform Settings & System Branding'
              : 'Super Admin Platform Control'}
          </h2>
          <p className="text-xs text-slate-500">
            {activeTab === 'settings'
              ? 'Customize company logo, platform brand name, browser favicon icon, and root credentials'
              : 'Global SaaS tenant management, support provisioning, and multi-tenant audit logs'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'companies' && (
            <button
              onClick={() => setShowCreateCompany(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              Create Company Portal
            </button>
          )}

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
          {/* Controls Bar: Status Filters, Search, and Multi-Select Operations */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-semibold text-slate-500 uppercase mr-1 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-slate-400" /> Portal Status:
                </span>
                <button
                  type="button"
                  onClick={() => setCompanyFilterStatus('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    companyFilterStatus === 'all'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>All Companies</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    companyFilterStatus === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {companies.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompanyFilterStatus('active')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    companyFilterStatus === 'active'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Active</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCompanyFilterStatus('closed')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                    companyFilterStatus === 'closed'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                  <span>Closed / Inactive</span>
                </button>
              </div>

              {/* Action: Create New Company */}
              <button
                type="button"
                onClick={() => setShowCreateCompany(true)}
                className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 ml-auto"
              >
                <Plus className="w-4 h-4" />
                <span>Register New Company</span>
              </button>
            </div>

            {/* Search Input, Search Button, and Multi-Select Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {/* Search Form */}
              <form
                onSubmit={(e) => { e.preventDefault(); fetchData(); }}
                className="flex items-center gap-2 flex-1 max-w-lg"
              >
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={companySearchQuery}
                    onChange={(e) => setCompanySearchQuery(e.target.value)}
                    placeholder="Search name, code, email, phone, admin username, city..."
                    className="w-full pl-8 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800"
                  />
                  {companySearchQuery && (
                    <button
                      type="button"
                      onClick={() => setCompanySearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 font-bold text-xs"
                      title="Clear Search"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Search</span>
                </button>
              </form>

              {/* Multi-Selection Control Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAllCompanies}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                    companies.length > 0 && selectedCompanyIds.length === companies.length
                      ? 'bg-sky-50 text-sky-700 border-sky-300'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Select all visible companies"
                >
                  <input
                    type="checkbox"
                    checked={companies.length > 0 && selectedCompanyIds.length === companies.length}
                    onChange={handleSelectAllCompanies}
                    className="rounded text-sky-600 cursor-pointer pointer-events-none"
                  />
                  <span>Select Multiple / Select All</span>
                </button>

                {selectedCompanyIds.length > 0 && (
                  <div className="flex items-center gap-2 animate-fadeIn">
                    <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg">
                      {selectedCompanyIds.length} Selected
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCompanyIds([])}
                      className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 font-semibold"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowBulkDeleteModal(true)}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
                      title="Permanently hard-delete all selected companies"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected ({selectedCompanyIds.length}) Permanently</span>
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
                        checked={companies.length > 0 && selectedCompanyIds.length === companies.length}
                        onChange={handleSelectAllCompanies}
                        className="rounded text-sky-600 cursor-pointer"
                        title="Select/Deselect All Companies"
                      />
                    </th>
                    <th className="p-3">Company Identity & Portal</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Admin Login</th>
                    <th className="p-3">Contact & Address</th>
                    <th className="p-3">Workforce Breakdown</th>
                    <th className="p-3">Modules</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {companies.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-slate-400 text-xs">
                        No company portals found matching the selected filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    companies.map(c => {
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
                                  : c.status === 'disabled'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              }`}
                            >
                              <option value="active">Active</option>
                              <option value="disabled">Disabled</option>
                              <option value="banned">Banned / Closed</option>
                            </select>
                          </td>
                          <td className="p-3">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-mono font-bold text-slate-800">
                                <Shield className="w-3 h-3 text-sky-500 shrink-0" />
                                <span>{c.admin_username || 'admin'}</span>
                              </div>
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
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold">
                                  {c.total_hrs || 0} HRs
                                </span>
                                <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded font-semibold">
                                  {c.total_users || 0} Users
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => openModulesModal(c.id)}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                            >
                              <Settings2 className="w-3.5 h-3.5" />
                              <span>Configure</span>
                            </button>
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
                <button
                  type="button"
                  onClick={() => { setDirRoleFilter('hr'); setDirPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    dirRoleFilter === 'hr' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  HR Leads
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
                          e.role_name === 'hr' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-sky-100 text-sky-700'
                        }`}>
                          {e.role_name === 'manager' ? 'Manager' : e.role_name === 'hr' ? 'HR Lead' : 'Employee'}
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Support Staff Accounts</h3>
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
                  <th className="p-3">Status</th>
                  <th className="p-3">Created</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {supportUsers.map(s => (
                  <tr key={s.user_id} className="hover:bg-slate-50/50">
                    <td className="p-3">
                      <p className="font-semibold text-slate-900">{s.full_name}</p>
                      <p className="text-[11px] text-slate-400">{s.email || 'No email specified'}</p>
                    </td>
                    <td className="p-3 font-mono text-purple-600">{s.username}</td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 font-bold">
                        Level {s.permission_level}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600">
                      {s.permission_level === 1 && 'Level 1 – View Only'}
                      {s.permission_level === 2 && 'Level 2 – Edit Employee & Attendance'}
                      {s.permission_level === 3 && 'Level 3 – Advanced (Device Unlock & Attendance Correction)'}
                      {s.permission_level === 4 && 'Level 4 – Full Support Authority'}
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
              </tbody>
            </table>
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
        </div>
      )}

      {/* MODAL: CREATE COMPANY */}
      {showCreateCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Create New Tenant Company & Portal
            </h3>

            <form onSubmit={handleCreateCompany} className="space-y-4 text-xs">
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

              <div className="border-t border-slate-100 pt-3">
                <span className="font-bold text-slate-800 block mb-2">Company Administrator Account (Required on Signup)</span>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Admin Username *</label>
                    <input
                      type="text"
                      required
                      value={newComp.admin_username}
                      onChange={(e) => setNewComp({ ...newComp, admin_username: e.target.value })}
                      placeholder="e.g. acme_admin"
                      className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-700 block mb-1">Admin Password *</label>
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
                <div className="mt-2">
                  <label className="font-semibold text-slate-700 block mb-1">Admin Email (Optional)</label>
                  <input
                    type="email"
                    value={newComp.admin_email}
                    onChange={(e) => setNewComp({ ...newComp, admin_email: e.target.value })}
                    placeholder="admin@acme.com"
                    className="w-full px-3 py-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateCompany(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Provision Support Account
            </h3>

            <form onSubmit={handleCreateSupport} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Staff Member Full Name *</label>
                <input
                  type="text"
                  required
                  value={newSupport.full_name}
                  onChange={(e) => setNewSupport({ ...newSupport, full_name: e.target.value })}
                  placeholder="e.g. Rahul Verma"
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={newSupport.username}
                  onChange={(e) => setNewSupport({ ...newSupport, username: e.target.value })}
                  placeholder="e.g. support_rahul"
                  className="w-full px-3 py-2 border rounded-lg"
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
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Support Permission Level *</label>
                <select
                  value={newSupport.permission_level}
                  onChange={(e) => setNewSupport({ ...newSupport, permission_level: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 border rounded-lg bg-white"
                >
                  <option value={1}>Level 1 – View Only Support</option>
                  <option value={2}>Level 2 – Edit Employee & Attendance</option>
                  <option value={3}>Level 3 – Advanced (Device Unlock & Attendance Correction)</option>
                  <option value={4}>Level 4 – Full Support Authority</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateSupport(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Provision Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIGURE MODULES */}
      {modulesModalOpen && selectedCompanyModules && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Configure Modules: {selectedCompanyModules.companyName}
            </h3>

            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
              {Object.keys(selectedCompanyModules.modules).map(modName => {
                const isEnabled = selectedCompanyModules.modules[modName];
                return (
                  <div key={modName} className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50/50">
                    <span className="text-xs font-semibold text-slate-800 capitalize">
                      {modName.replace(/_/g, ' ')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCompanyModules({
                        ...selectedCompanyModules,
                        modules: {
                          ...selectedCompanyModules.modules,
                          [modName]: !isEnabled
                        }
                      })}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        isEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isEnabled ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModulesModalOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveModules}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-medium"
              >
                Save Module Configuration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EDIT COMPANY & ADMIN DETAILS */}
      {showEditCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
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

            <form onSubmit={handleSaveEditCompany} className="space-y-4 text-xs">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
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
                This will permanently delete from the database:
              </p>
              <ul className="list-disc list-inside text-[11px] space-y-0.5 text-rose-700">
                <li>All company staff, HR, managers & employees</li>
                <li>All user login accounts & device bindings</li>
                <li>All attendance logs, GPS punches & tracking coordinates</li>
                <li>All leave records, balances, quotas & transactions</li>
                <li>All geofences, shifts, and helpdesk tickets</li>
              </ul>
              <p className="font-black text-rose-900 text-[11px] pt-1">
                ⚠️ THIS ACTION CANNOT BE UNDONE!
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-rose-200 space-y-4">
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
                  <li>Zero backup: Data CANNOT be restored or recovered under any circumstances.</li>
                  <li>All employee profiles, users, login credentials, and device bindings will be deleted.</li>
                  <li>All attendance punches, GPS tracking coordinates, and shift rosters will be wiped out.</li>
                  <li>All leave requests, balances, service tickets, and company settings will be permanently destroyed.</li>
                </ul>
              </div>

              <p className="font-black text-rose-950 text-xs bg-rose-200/60 p-2 rounded-lg text-center">
                ⚠️ THIS HARD DELETION IS ABSOLUTE AND PERMANENT!
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-base font-bold text-slate-900">
                Edit Support Staff Account
              </h3>
              <button
                type="button"
                onClick={() => setShowEditSupport(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditSupport} className="space-y-3 text-xs">
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
                    onChange={(e) => setEditSupportForm({ ...editSupportForm, permission_level: parseInt(e.target.value, 10) })}
                    className="w-full px-2.5 py-2 border rounded-lg bg-white"
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

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
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
