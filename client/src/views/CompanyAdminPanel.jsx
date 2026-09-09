import React, { useState, useEffect } from 'react';
import {
  Layers, Users, Clock, Calendar, Compass, MapPin, FileText,
  Ticket, Settings, Plus, CheckCircle, AlertTriangle, RefreshCw,
  Edit3, Trash2, ArrowRight, Upload, Download, Smartphone, Image,
  UserCheck, Shield, Check, Eye, MessageSquare, X, GitMerge, ShieldCheck, CheckCircle2,
  Key, Ban, Filter, Search, FileSpreadsheet, ChevronLeft, ChevronRight, SlidersHorizontal,
  Building2, Globe, LocateFixed
} from 'lucide-react';
import { apiRequest } from '../api';
import LiveTrackingMap from '../components/LiveTrackingMap';
import CustomExportModal from '../components/CustomExportModal';
import UnifiedCalendar from '../components/UnifiedCalendar';
import TicketChatModal from '../components/TicketChatModal';
import ExcelImportModal from '../components/ExcelImportModal';
import EmployeeChangePasswordModal from '../components/EmployeeChangePasswordModal';
import EmployeeMappingView from '../components/EmployeeMappingView';
import AttendanceManagementView from '../components/AttendanceManagementView';
import AttendanceCorrectionReviewView from '../components/AttendanceCorrectionReviewView';
import ShiftManagementView from '../components/ShiftManagementView';
import HolidaysWeeklyOffView from '../components/HolidaysWeeklyOffView';

export default function CompanyAdminPanel({ company, user, activeTab, onUpdateCompany }) {
  const [employees, setEmployees] = useState([]);
  const [geofences, setGeofences] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [weeklyOffs, setWeeklyOffs] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Role filter for Personnel tab: 'all', 'employee', 'manager'
  const [roleFilter, setRoleFilter] = useState('all');

  // Employee Directory state: Pagination, Filtering & Excel
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const [customPageSize, setCustomPageSize] = useState('');
  const [isCustomPageSize, setIsCustomPageSize] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'suspended'
  const [cityFilter, setCityFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [availableCities, setAvailableCities] = useState([]);
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedEmployeeForPassword, setSelectedEmployeeForPassword] = useState(null);

  // Mapping state
  const [mappings, setMappings] = useState([]);
  const [mappingSupervisorId, setMappingSupervisorId] = useState('');
  const [mappingRoleType, setMappingRoleType] = useState('manager'); // 'manager'
  const [selectedMappingEmpIds, setSelectedMappingEmpIds] = useState([]);
  const [mappingSubmitting, setMappingSubmitting] = useState(false);

  // Tickets / Helpdesk state
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [showSolveTicketModal, setShowSolveTicketModal] = useState(false);
  const [chatTicketId, setChatTicketId] = useState(null);
  const [showChatModal, setShowChatModal] = useState(false);
  const [ticketStatusFilter, setTicketStatusFilter] = useState('all');

  // Edit Staff state
  const [showEditStaffModal, setShowEditStaffModal] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState(null);
  const [editStaffForm, setEditStaffForm] = useState({
    employee_id: '',
    full_name: '',
    email: '',
    mobile: '',
    department: '',
    designation: '',
    city: '',
    role: 'employee',
    reports_to_manager: false,
    manager_id: '',
    reports_to_hr: false,
    hr_id: '',
    reports_to_admin: false,
    shift_id: '',
    geofence_id: '',
    geofence_mode: 'custom',
    status: 'active',
    password: ''
  });

  // Leave & Accrual state
  const [leaveTypes, setLeaveTypes] = useState([]);
  const [leaveAccruals, setLeaveAccruals] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState({
    cl: { total_balance: 0, total_used: 0, total_quota: 0 },
    el: { total_balance: 0, total_accrued: 0, total_used: 0 },
    pendingRequests: 0,
    year: new Date().getFullYear()
  });
  const [masterPolicyForm, setMasterPolicyForm] = useState({
    cl_quota: 12,
    el_monthly_rate: 1.25
  });
  const [masterPolicySubmitting, setMasterPolicySubmitting] = useState(false);
  const [showManualLeaveModal, setShowManualLeaveModal] = useState(false);
  const [manualLeaveForm, setManualLeaveForm] = useState({
    employee_id: '',
    leave_type_id: '',
    cadence: 'month', // 'month' | 'year'
    days: 1.25,
    reason: 'Monthly Earned Leave credit',
    apply_to_all: true
  });

  // Delete / Deduct Leave state
  const [showDeleteLeaveModal, setShowDeleteLeaveModal] = useState(false);
  const [deleteLeaveForm, setDeleteLeaveForm] = useState({
    leave_type_id: '',
    target_type: 'all', // 'all' | 'single'
    employee_id: '',
    action_type: 'deduct_days', // 'deduct_days' | 'reset_zero'
    days: 1.0,
    reason: 'Administrative leave balance adjustment'
  });
  const [deleteLeaveSubmitting, setDeleteLeaveSubmitting] = useState(false);

  // Modals
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [showGeofenceModal, setShowGeofenceModal] = useState(false);
  const [showShiftModal, setShowShiftModal] = useState(false);
  const [showHolidayModal, setShowHolidayModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // New Staff (Employee / Manager) Form State
  const [staffForm, setStaffForm] = useState({
    role: 'employee', // 'employee' | 'manager'
    employee_id: '',
    full_name: '',
    username: '',
    password: 'User@12345',
    email: '',
    mobile: '',
    department: 'Operations',
    designation: 'Staff',
    city: '',
    reports_to_manager: false,
    manager_id: '',
    reports_to_hr: false,
    hr_id: '',
    reports_to_admin: false,
    shift_id: '',
    geofence_id: '',
    geofence_mode: 'custom'
  });

  // Geofence & Shift & Holiday Forms
  const [geofenceForm, setGeofenceForm] = useState({
    location_name: '', latitude: 28.4950, longitude: 77.0890, radius: 200
  });

  // Geofence Management & Master Bulk Assignment state
  const [geofenceEmployees, setGeofenceEmployees] = useState([]);
  const [selectedGeofenceEmpIds, setSelectedGeofenceEmpIds] = useState([]);
  const [bulkTargetGeofenceId, setBulkTargetGeofenceId] = useState('anywhere');
  const [bulkGeofenceSubmitting, setBulkGeofenceSubmitting] = useState(false);
  const [geofenceSearchQuery, setGeofenceSearchQuery] = useState('');
  const [geofenceCityFilter, setGeofenceCityFilter] = useState('all');
  const [geofenceStatusFilter, setGeofenceStatusFilter] = useState('all'); // 'all' | 'assigned' | 'anywhere'
  const [showEditGeofenceModal, setShowEditGeofenceModal] = useState(false);
  const [editGeofenceForm, setEditGeofenceForm] = useState({
    id: null, location_name: '', latitude: 28.4950, longitude: 77.0890, radius: 200, status: 'active'
  });
  const [locatingGps, setLocatingGps] = useState(false);
  const [companyGeofencePolicy, setCompanyGeofencePolicy] = useState('strict');
  const [pendingPolicy, setPendingPolicy] = useState('strict');
  const [companyPolicyUpdating, setCompanyPolicyUpdating] = useState(false);
  const [applyPolicyToAll, setApplyPolicyToAll] = useState(false);

  const [shiftForm, setShiftForm] = useState({
    name: '', start_time: '09:00', end_time: '18:00', grace_time_mins: 15, working_hours: 8.0
  });

  const [holidayForm, setHolidayForm] = useState({
    name: '', holiday_date: new Date().toISOString().split('T')[0], is_optional: false
  });

  // Company Settings & Logo Form
  const [settingsForm, setSettingsForm] = useState({
    portal_name: company?.portalName || '',
    working_hours_per_day: company?.settings?.working_hours_per_day || 8.0,
    half_day_min_hours: company?.settings?.half_day_min_hours || 4.0,
    full_day_min_hours: company?.settings?.full_day_min_hours || 8.0,
    show_branding_mode: company?.settings?.show_branding_mode || 'both',
    auto_archive_days: company?.settings?.auto_archive_days || 1
  });

  // Logo upload state
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState(company?.logo || null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      if (activeTab === 'dashboard' || activeTab === 'employees' || activeTab === 'mapping') {
        const queryParams = new URLSearchParams();
        if (activeTab === 'employees') {
          queryParams.append('limit', pageSize);
          queryParams.append('offset', (page - 1) * pageSize);
          if (roleFilter !== 'all') queryParams.append('role', roleFilter);
          if (statusFilter !== 'all') queryParams.append('status', statusFilter);
          if (cityFilter !== 'all') queryParams.append('city', cityFilter);
          if (searchQuery.trim()) queryParams.append('search', searchQuery.trim());
        } else {
          queryParams.append('limit', '100');
        }
        const empRes = await apiRequest(`/employees?${queryParams.toString()}`);
        setEmployees(empRes.employees || []);
        if (activeTab === 'employees') {
          setTotalEmployees(empRes.total !== undefined ? empRes.total : (empRes.employees || []).length);
          if (empRes.cities) setAvailableCities(empRes.cities);
        }
      }
      if (activeTab === 'dashboard' || activeTab === 'attendance') {
        const attRes = await apiRequest('/attendance/list?limit=25');
        setAttendance(attRes.records || []);
      }
      if (activeTab === 'geofences' || activeTab === 'dashboard' || activeTab === 'employees') {
        const gfRes = await apiRequest('/geofences');
        setGeofences(gfRes.geofences || []);
        if (gfRes.employees) {
          setGeofenceEmployees(gfRes.employees || []);
        }
        if (gfRes.company_policy) {
          setCompanyGeofencePolicy(gfRes.company_policy);
          setPendingPolicy(gfRes.company_policy);
        }
      }
      if (activeTab === 'shifts' || activeTab === 'dashboard' || activeTab === 'employees') {
        const shiftRes = await apiRequest('/shifts');
        setShifts(shiftRes.shifts || []);
        setWeeklyOffs(shiftRes.weeklyOffs || []);
      }
      if (activeTab === 'holidays' || activeTab === 'dashboard') {
        const holRes = await apiRequest('/holidays');
        setHolidays(holRes.holidays || []);
      }
      if (activeTab === 'mapping') {
        const mapRes = await apiRequest('/employees/mappings');
        setMappings(mapRes.mappings || []);
      }
      if (activeTab === 'tickets') {
        const tickRes = await apiRequest('/tickets/service-requests?view=all');
        setTickets(tickRes.requests || []);
      }
      if (activeTab === 'dashboard' || activeTab === 'leave') {
        const sumRes = await apiRequest('/leave/summary');
        if (sumRes.summary) setLeaveSummary(sumRes.summary);
      }
      if (activeTab === 'leave' || activeTab === 'settings') {
        const ltRes = await apiRequest('/leave/types');
        setLeaveTypes(ltRes.leaveTypes || []);
        const histRes = await apiRequest('/leave/accrual/history');
        setLeaveAccruals(histRes.logs || []);
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
  }, [activeTab, roleFilter, statusFilter, cityFilter, page, pageSize, searchQuery]);

  // Open modal pre-configured for Employee, Manager, or HR
  const openAddStaffModal = (targetRole = 'employee') => {
    setStaffForm({
      role: targetRole,
      employee_id: '',
      full_name: '',
      username: '',
      password: 'User@12345',
      email: '',
      mobile: '',
      department: targetRole === 'manager' ? 'Management' : 'Operations',
      designation: targetRole === 'manager' ? 'Team Manager' : 'Associate',
      city: '',
      reports_to_manager: false,
      manager_id: '',
      reports_to_admin: targetRole === 'manager',
      shift_id: shifts[0]?.id ? String(shifts[0].id) : '',
      geofence_id: geofences[0]?.id ? String(geofences[0].id) : '',
      geofence_mode: 'custom'
    });
    setShowAddStaffModal(true);
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Validate mapping requirements based on position
      if (staffForm.role === 'employee') {
        if (!staffForm.reports_to_manager && !staffForm.reports_to_admin) {
          setError('Please select at least one reporting line (Manager or Company Admin).');
          return;
        }
        if (staffForm.reports_to_manager && !staffForm.manager_id) {
          setError('Please select a Reporting Manager from the dropdown.');
          return;
        }
      }

      const payload = {
        ...staffForm,
        manager_id: (staffForm.role === 'employee' && staffForm.reports_to_manager) ? staffForm.manager_id : null,
        hr_id: null,
        reports_to_admin: staffForm.role === 'manager' ? 1 : (staffForm.reports_to_admin ? 1 : 0),
        geofence_mode: staffForm.geofence_id ? 'custom' : 'company'
      };

      const res = await apiRequest('/employees', {
        method: 'POST',
        body: payload
      });
      setSuccess(`${staffForm.role.toUpperCase()} "${staffForm.full_name}" added successfully${res.employeeCode ? ` (Code: ${res.employeeCode})` : ' (No ID assigned - can update later)'}.`);
      setShowAddStaffModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Open Edit Modal with prefilled employee data and multi-level mapping
  const openEditStaffModal = (emp) => {
    setEditingStaffId(emp.id);
    const role = emp.role_name || 'employee';
    setEditStaffForm({
      employee_id: emp.employee_id || '',
      full_name: emp.full_name || '',
      username: emp.username || '',
      email: emp.email || '',
      mobile: emp.mobile || '',
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      city: emp.city || '',
      role: role === 'hr' ? 'employee' : role,
      reports_to_manager: !!emp.manager_id,
      manager_id: emp.manager_id ? String(emp.manager_id) : '',
      reports_to_admin: !!emp.reports_to_admin,
      shift_id: emp.shift_id ? String(emp.shift_id) : '',
      geofence_id: emp.geofence_id ? String(emp.geofence_id) : '',
      geofence_mode: emp.geofence_id ? 'custom' : (emp.geofence_mode || 'company'),
      status: emp.status || 'active',
      password: ''
    });
    setShowEditStaffModal(true);
  };

  const handleSaveEditStaff = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editStaffForm.role === 'employee') {
        if (!editStaffForm.reports_to_manager && !editStaffForm.reports_to_admin) {
          setError('Please select at least one reporting line (Manager or Company Admin).');
          return;
        }
        if (editStaffForm.reports_to_manager && !editStaffForm.manager_id) {
          setError('Please select a Reporting Manager from the dropdown.');
          return;
        }
      }

      const payload = {
        ...editStaffForm,
        username: editStaffForm.username ? editStaffForm.username.trim() : undefined,
        manager_id: (editStaffForm.role === 'employee' && editStaffForm.reports_to_manager) ? editStaffForm.manager_id : null,
        hr_id: null,
        reports_to_admin: editStaffForm.role === 'manager' ? 1 : (editStaffForm.reports_to_admin ? 1 : 0),
        geofence_mode: editStaffForm.geofence_id ? 'custom' : 'company'
      };

      await apiRequest(`/employees/${editingStaffId}`, {
        method: 'PUT',
        body: payload
      });
      setSuccess(`Account details for "${editStaffForm.full_name}" updated successfully.`);
      setShowEditStaffModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Toggle Employee Status (active / suspended)
  const handleToggleStatus = async (emp) => {
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

  // Soft Delete Employee
  const handleDeleteStaff = async (emp) => {
    if (!window.confirm(`Are you sure you want to permanently delete account for "${emp.full_name}" (${emp.employee_id})?`)) return;
    try {
      const res = await apiRequest(`/employees/${emp.id}`, { method: 'DELETE' });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Mapping Handlers
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!mappingSupervisorId) {
      setError('Please select a supervisor (Manager).');
      return;
    }
    if (selectedMappingEmpIds.length === 0) {
      setError('Please select at least one employee to map.');
      return;
    }

    setMappingSubmitting(true);
    setError('');
    try {
      await apiRequest('/employees/mapping', {
        method: 'POST',
        body: {
          supervisor_id: parseInt(mappingSupervisorId, 10),
          role_type: mappingRoleType,
          employee_ids: selectedMappingEmpIds
        }
      });
      setSuccess(`Mapped ${selectedMappingEmpIds.length} employees to selected ${mappingRoleType.toUpperCase()} successfully.`);
      setSelectedMappingEmpIds([]);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setMappingSubmitting(false);
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    try {
      await apiRequest(`/employees/mapping/${mappingId}`, { method: 'DELETE' });
      setSuccess('Employee mapping removed successfully.');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Ticket Resolution Handlers
  const handleResolveTicket = async (status = 'resolved') => {
    if (!selectedTicket) return;
    try {
      await apiRequest(`/tickets/service-requests/${selectedTicket.id}/resolve`, {
        method: 'PUT',
        body: {
          status,
          resolution_notes: resolutionNotes.trim()
        }
      });
      setSuccess(`Ticket #${selectedTicket.id} marked as ${status}.`);
      setShowSolveTicketModal(false);
      setResolutionNotes('');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  // Master Apply Policy Handler (Sets CL annual quota and EL monthly accrual rate for all employees)
  const handleMasterLeaveApply = async (e) => {
    e?.preventDefault();
    setMasterPolicySubmitting(true);
    setError('');
    setSuccess('');
    try {
      const res = await apiRequest('/leave/master-apply', {
        method: 'POST',
        body: {
          cl_quota: parseFloat(masterPolicyForm.cl_quota) || 12,
          el_monthly_rate: parseFloat(masterPolicyForm.el_monthly_rate) || 1.25
        }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to apply master leave policy');
    } finally {
      setMasterPolicySubmitting(false);
    }
  };

  // Monthly Accrual Handlers
  const handleRunMonthlyAccrual = async () => {
    setError('');
    try {
      const res = await apiRequest('/leave/accrual/monthly', {
        method: 'POST',
        body: { force: true }
      });
      setSuccess(res.message);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleManualLeaveCredit = async (e) => {
    e.preventDefault();
    setError('');

    const selectedType = leaveTypes.find(lt => String(lt.id) === String(manualLeaveForm.leave_type_id));
    const isEL = selectedType && (selectedType.code === 'EL' || selectedType.name.toLowerCase().includes('earned'));
    if (isEL && manualLeaveForm.cadence === 'month' && parseFloat(manualLeaveForm.days) > 1.25) {
      setError('Statutory cap exceeded: Earned Leave (EL) cannot exceed 1.25 days per month.');
      return;
    }

    try {
      const res = await apiRequest('/leave/manual-credit', {
        method: 'POST',
        body: manualLeaveForm
      });
      setSuccess(res.message);
      setShowManualLeaveModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDeleteOrDeductLeave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setDeleteLeaveSubmitting(true);
    try {
      const res = await apiRequest('/leave/delete-or-deduct', {
        method: 'POST',
        body: {
          leave_type_id: deleteLeaveForm.leave_type_id,
          action_type: deleteLeaveForm.action_type,
          apply_to_all: deleteLeaveForm.target_type === 'all',
          employee_id: deleteLeaveForm.target_type === 'single' ? deleteLeaveForm.employee_id : undefined,
          days: deleteLeaveForm.action_type === 'deduct_days' ? parseFloat(deleteLeaveForm.days) : 0,
          reason: deleteLeaveForm.reason
        }
      });
      setSuccess(res.message);
      setShowDeleteLeaveModal(false);
      fetchData();
    } catch (err) {
      setError(err.message || 'Failed to delete/deduct leave.');
    } finally {
      setDeleteLeaveSubmitting(false);
    }
  };

  // Handle Logo File Selection & Preview
  const handleLogoFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setLogoFile(selected);
      const objectUrl = URL.createObjectURL(selected);
      setLogoPreview(objectUrl);
    }
  };

  // Upload Logo to Backend
  const handleUploadLogo = async () => {
    if (!logoFile) {
      setError('Please select an image file first.');
      return;
    }

    setUploadingLogo(true);
    setError('');

    const formData = new FormData();
    formData.append('logo', logoFile);

    try {
      const res = await apiRequest(`/companies/${company.id}/logo`, {
        method: 'POST',
        body: formData
      });

      setSuccess('Company logo uploaded and saved successfully.');
      setLogoPreview(res.logoUrl);
      setLogoFile(null);

      // Instantly update parent Layout navbar branding!
      onUpdateCompany?.({ logo: res.logoUrl });
    } catch (err) {
      setError(err.message);
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCreateGeofence = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/geofences', {
        method: 'POST',
        body: geofenceForm
      });
      setSuccess(`Geofence "${geofenceForm.location_name}" created successfully.`);
      setShowGeofenceModal(false);
      setGeofenceForm({ location_name: '', latitude: 28.4950, longitude: 77.0890, radius: 200 });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleGetGpsLocation = (isEdit = false) => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocatingGps(false);
        const lat = parseFloat(pos.coords.latitude.toFixed(6));
        const lng = parseFloat(pos.coords.longitude.toFixed(6));
        if (isEdit) {
          setEditGeofenceForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
        } else {
          setGeofenceForm(prev => ({ ...prev, latitude: lat, longitude: lng }));
        }
        setSuccess(`📍 Acquired GPS location: ${lat}, ${lng} (Accuracy: ~${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setLocatingGps(false);
        setError(`Unable to acquire GPS coordinates: ${err.message}. You can enter them manually.`);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const openEditGeofenceModal = (gf) => {
    setEditGeofenceForm({
      id: gf.id,
      location_name: gf.location_name,
      latitude: gf.latitude,
      longitude: gf.longitude,
      radius: gf.radius,
      status: gf.status || 'active'
    });
    setShowEditGeofenceModal(true);
  };

  const handleUpdateGeofence = async (e) => {
    e.preventDefault();
    if (!editGeofenceForm.id) return;
    try {
      await apiRequest(`/geofences/${editGeofenceForm.id}`, {
        method: 'PUT',
        body: {
          location_name: editGeofenceForm.location_name,
          latitude: parseFloat(editGeofenceForm.latitude),
          longitude: parseFloat(editGeofenceForm.longitude),
          radius: parseFloat(editGeofenceForm.radius),
          status: editGeofenceForm.status
        }
      });
      setSuccess(`Office location "${editGeofenceForm.location_name}" updated successfully.`);
      setShowEditGeofenceModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkAssignGeofence = async () => {
    if (selectedGeofenceEmpIds.length === 0) {
      setError('Please select at least one employee using the checkboxes.');
      return;
    }
    setBulkGeofenceSubmitting(true);
    setError('');
    try {
      const res = await apiRequest('/geofences/bulk-assign', {
        method: 'POST',
        body: {
          employee_ids: selectedGeofenceEmpIds,
          geofence_id: bulkTargetGeofenceId
        }
      });
      setSuccess(res.message || 'Geofence assignments updated successfully.');
      setSelectedGeofenceEmpIds([]);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkGeofenceSubmitting(false);
    }
  };

  const handleSingleAssignGeofence = async (empId, geofenceId) => {
    try {
      const res = await apiRequest('/geofences/bulk-assign', {
        method: 'POST',
        body: {
          employee_ids: [empId],
          geofence_id: geofenceId
        }
      });
      setSuccess(res.message || 'Assignment updated.');
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdateCompanyPolicy = async (newPolicy, resetAll) => {
    setCompanyPolicyUpdating(true);
    setError('');
    try {
      const res = await apiRequest('/geofences/company-policy', {
        method: 'PUT',
        body: {
          policy: newPolicy,
          apply_to_all_employees: !!resetAll
        }
      });
      setSuccess(res.message);
      setCompanyGeofencePolicy(newPolicy);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setCompanyPolicyUpdating(false);
    }
  };

  const handleCreateShift = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/shifts', {
        method: 'POST',
        body: shiftForm
      });
      setSuccess(`Shift "${shiftForm.name}" created successfully.`);
      setShowShiftModal(false);
      setShiftForm({ name: '', start_time: '09:00', end_time: '18:00', grace_time_mins: 15, working_hours: 8.0 });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCreateHoliday = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/holidays', {
        method: 'POST',
        body: holidayForm
      });
      setSuccess(`Holiday "${holidayForm.name}" added and reflected in calendars.`);
      setShowHolidayModal(false);
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await apiRequest(`/companies/${company.id}`, {
        method: 'PUT',
        body: settingsForm
      });
      setSuccess('Company settings and branding configuration saved.');
      onUpdateCompany?.({
        portalName: settingsForm.portal_name,
        settings: { ...company?.settings, ...settingsForm }
      });
    } catch (err) {
      setError(err.message);
    }
  };

  const deleteGeofence = async (id) => {
    if (!window.confirm('Delete this geofence boundary?')) return;
    try {
      await apiRequest(`/geofences/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const managersList = employees.filter(e => e.role_name === 'manager');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {activeTab === 'dashboard'
              ? `Welcome, ${user.fullName || user.username} (Company Admin)`
              : 'Company Portal Administration'}
          </h2>
          <p className="text-xs text-slate-500">
            {company?.name} ({company?.code}) • Complete tenant workforce, branding, geofencing & master auto-sync
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'employees' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExcelModal(true)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Import Excel / Template</span>
              </button>
              <button
                onClick={() => openAddStaffModal('employee')}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md shadow-sky-500/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Personnel / Staff</span>
              </button>
            </div>
          )}

          {activeTab === 'geofences' && (
            <button
              onClick={() => setShowGeofenceModal(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Geofence
            </button>
          )}

          {activeTab === 'shifts' && (
            <button
              onClick={() => setShowShiftModal(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Shift Schedule
            </button>
          )}

          {activeTab === 'holidays' && (
            <button
              onClick={() => setShowHolidayModal(true)}
              className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Company Holiday
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

      {/* DASHBOARD */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase">Workforce Total</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{employees.length}</p>
              <div className="flex items-center gap-2 mt-2 text-[11px] font-medium text-slate-500">
                <span className="text-sky-600">{employees.filter(e => e.role_name === 'employee').length} Employees</span>
                <span>•</span>
                <span className="text-purple-600">{employees.filter(e => e.role_name === 'manager').length} Managers</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase">Geofence Zones</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{geofences.length}</p>
              <span className="text-[11px] text-sky-600 font-semibold">GPS Verified Sites</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase">Active Shifts</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{shifts.length}</p>
              <span className="text-[11px] text-purple-600 font-semibold">Morning / Evening / Night</span>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <span className="text-xs font-medium text-slate-500 uppercase">Holidays Scheduled</span>
              <p className="text-2xl font-black text-slate-900 mt-1">{holidays.length}</p>
              <span className="text-[11px] text-amber-600 font-semibold">Calendar Synced</span>
            </div>
          </div>

          {/* Workforce Leave Pools Section (Zero-Payroll Operational) */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-sky-600" />
                  Workforce Leave Pools (Annual CL & Monthly EL)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Two-tier statutory leave policy • Zero-Payroll Compliant: Balances & operational quotas only
                </p>
              </div>
              <div className="text-xs font-semibold text-slate-500">
                Year: <span className="text-sky-700 font-bold">{leaveSummary.year || new Date().getFullYear()}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
              {/* Casual Leave Card */}
              <div className="p-4 rounded-xl border border-sky-100 bg-gradient-to-br from-sky-50/70 to-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-900 uppercase">Casual Leave (CL)</span>
                  <span className="px-2 py-0.5 bg-sky-100 text-sky-700 rounded-full text-[10px] font-bold">12 Days / Year</span>
                </div>
                <div className="text-2xl font-black text-sky-800">
                  {leaveSummary.cl?.total_balance || 0} <span className="text-xs font-medium text-slate-500">days available</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-600">
                  <span>Total Quota: <strong>{leaveSummary.cl?.total_quota || 0}d</strong></span>
                  <span>•</span>
                  <span>Total Used: <strong className="text-rose-600">{leaveSummary.cl?.total_used || 0}d</strong></span>
                </div>
              </div>

              {/* Earned Leave Card */}
              <div className="p-4 rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-900 uppercase">Earned Leave (EL)</span>
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold">+1.25 / Month</span>
                </div>
                <div className="text-2xl font-black text-emerald-800">
                  {leaveSummary.el?.total_balance || 0} <span className="text-xs font-medium text-slate-500">days available</span>
                </div>
                <div className="flex items-center gap-3 text-[11px] text-slate-600">
                  <span>Accrued: <strong>{leaveSummary.el?.total_accrued || 0}d</strong></span>
                  <span>•</span>
                  <span>Total Used: <strong className="text-rose-600">{leaveSummary.el?.total_used || 0}d</strong></span>
                </div>
              </div>

              {/* Total Pool & Policy Summary */}
              <div className="p-4 rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50/70 to-white space-y-1.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-900 uppercase">Total Workforce Balance</span>
                    <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-[10px] font-bold">CL + EL</span>
                  </div>
                  <div className="text-2xl font-black text-purple-800 mt-1">
                    {Number((leaveSummary.cl?.total_balance || 0) + (leaveSummary.el?.total_balance || 0)).toFixed(2)} <span className="text-xs font-medium text-slate-500">days pool</span>
                  </div>
                </div>
                <div className="text-[11px] text-slate-600">
                  <span>Pending Leave Requests: <strong className="text-amber-700">{leaveSummary.pendingRequests || 0}</strong></span>
                </div>
              </div>
            </div>
          </div>

          <LiveTrackingMap companyId={company?.id} />
        </div>
      )}

      {/* EMPLOYEES / HR / MANAGERS TAB */}
      {activeTab === 'employees' && (
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
                  onClick={() => { setRoleFilter('all'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  All ({totalEmployees})
                </button>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('employee'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'employee' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Employees
                </button>
                <button
                  type="button"
                  onClick={() => { setRoleFilter('manager'); setPage(1); }}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                    roleFilter === 'manager' ? 'bg-purple-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Managers
                </button>
              </div>

              <div className="text-xs text-slate-400">
                Total matching: <span className="font-bold text-slate-700">{totalEmployees}</span> records
              </div>
            </div>

            {/* Dropdown Filters & Search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                  placeholder="Search name, ID, mobile..."
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-sky-500 text-slate-800"
                />
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
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
                  value={cityFilter}
                  onChange={(e) => { setCityFilter(e.target.value); setPage(1); }}
                  className="w-full py-1.5 px-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All Cities</option>
                  {availableCities.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-1.5">
                <span className="text-slate-400 whitespace-nowrap">Show:</span>
                {[10, 25, 50].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => { setPageSize(sz); setIsCustomPageSize(false); setPage(1); }}
                    className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-colors ${
                      pageSize === sz && !isCustomPageSize
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
                {!isCustomPageSize ? (
                  <button
                    type="button"
                    onClick={() => setIsCustomPageSize(true)}
                    className="px-2 py-1 rounded-lg text-slate-600 hover:bg-slate-100 border border-slate-200 text-[11px] font-semibold"
                  >
                    Custom
                  </button>
                ) : (
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={customPageSize}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      setCustomPageSize(e.target.value);
                      if (val > 0) { setPageSize(val); setPage(1); }
                    }}
                    placeholder="Qty"
                    className="w-14 py-1 px-2 text-center bg-white border border-sky-400 rounded-lg text-xs font-bold text-sky-700 focus:outline-none"
                    autoFocus
                  />
                )}
              </div>
            </div>
          </div>

          {/* Personnel Table */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Staff Member</th>
                    <th className="p-3">ID / Code</th>
                    <th className="p-3">Assigned Role</th>
                    <th className="p-3">Department & Title</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Reporting Hierarchy</th>
                    <th className="p-3">Assigned Geofence</th>
                    <th className="p-3">Shift</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Row Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {employees.map(e => (
                    <tr key={e.id} className="hover:bg-slate-50/50">
                      <td className="p-3">
                        <p className="font-bold text-slate-900">{e.full_name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{e.username} • {e.mobile || 'No mobile'}</p>
                      </td>
                      <td className="p-3 font-mono font-bold text-sky-600">{e.employee_id}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          e.role_name === 'manager' ? 'bg-purple-100 text-purple-800' :
                          'bg-sky-100 text-sky-800'
                        }`}>
                          {e.role_name || 'Employee'}
                        </span>
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-slate-800">{e.department}</p>
                        <p className="text-[11px] text-slate-500">{e.designation}</p>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-700 font-medium">
                          {e.city || <span className="text-slate-400 italic">Not set</span>}
                        </span>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap items-center gap-1 max-w-xs">
                          {e.manager_name && (
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 text-[10px] font-semibold flex items-center gap-1 shadow-xs" title={`Reports to Manager: ${e.manager_name} (${e.manager_code || ''})`}>
                              <Users className="w-2.5 h-2.5 shrink-0 text-purple-600" />
                              <span className="truncate max-w-[100px]">Mgr: {e.manager_name}</span>
                            </span>
                          )}
                          {e.reports_to_admin && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-semibold flex items-center gap-1 shadow-xs" title="Reports directly to Company Administrator">
                              <Shield className="w-2.5 h-2.5 shrink-0 text-amber-600" />
                              <span>Direct Admin</span>
                            </span>
                          )}
                          {!e.manager_name && !e.reports_to_admin && (
                            <span className="text-slate-400 italic text-[11px]">Direct Report</span>
                          )}
                        </div>
                      </td>
                      <td className="p-3">
                        {e.role_name === 'manager' && !e.geofence_id ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Exempt (Not Required)
                          </span>
                        ) : (
                          <div className="flex items-center gap-1 text-slate-700 font-medium">
                            <Compass className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                            <span className="truncate max-w-[120px]" title={e.geofence_name || 'Company Default'}>
                              {e.geofence_name || 'Company Default'}
                            </span>
                            {e.geofence_radius && (
                              <span className="text-[10px] text-slate-400 font-mono">({e.geofence_radius}m)</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-slate-700 font-medium">
                          <Clock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span className="truncate max-w-[110px]" title={e.shift_name || 'General'}>
                            {e.shift_name || 'General'}
                          </span>
                        </div>
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
                            onClick={() => openEditStaffModal(e)}
                            className="px-2 py-1 text-slate-700 hover:text-sky-600 bg-white hover:bg-sky-50 border border-slate-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Edit Account Details"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-sky-600" />
                            <span>Edit</span>
                          </button>

                          {/* 2. Active / Suspend Toggle */}
                          <button
                            type="button"
                            onClick={() => handleToggleStatus(e)}
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
                              setSelectedEmployeeForPassword(e);
                              setShowPasswordModal(true);
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
                            onClick={() => handleDeleteStaff(e)}
                            className="px-2 py-1 text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 shadow-xs transition-colors"
                            title="Delete Account Permanently"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {employees.length === 0 && (
                    <tr>
                      <td colSpan="10" className="p-8 text-center text-slate-400">
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
                  {totalEmployees === 0 ? 0 : (page - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(page * pageSize, totalEmployees)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{totalEmployees}</span> employees
              </div>

              {/* Page Number Buttons */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 font-medium"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Prev</span>
                </button>

                {Array.from({ length: Math.max(1, Math.ceil(totalEmployees / pageSize)) }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === Math.ceil(totalEmployees / pageSize) || Math.abs(p - page) <= 2)
                  .map((p, idx, arr) => (
                    <React.Fragment key={p}>
                      {idx > 0 && arr[idx - 1] !== p - 1 && (
                        <span className="px-1 text-slate-400">...</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setPage(p)}
                        className={`min-w-[28px] py-1 px-2 rounded-lg font-bold text-xs transition-colors ${
                          page === p
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
                  onClick={() => setPage(p => Math.min(Math.ceil(totalEmployees / pageSize), p + 1))}
                  disabled={page >= Math.ceil(totalEmployees / pageSize) || totalEmployees === 0}
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

      {/* UNIFIED CALENDAR TAB */}
      {activeTab === 'calendar' && (
        <UnifiedCalendar companyId={company?.id} role="company_admin" />
      )}

      {/* EMPLOYEE MAPPING TAB */}
      {activeTab === 'mapping' && (
        <EmployeeMappingView role="company_admin" />
      )}

      {/* ATTENDANCE MANAGEMENT TAB */}
      {activeTab === 'attendance' && (
        <AttendanceManagementView role="company_admin" company={company} />
      )}

      {/* HELPDESK & TICKETS TAB */}
      {activeTab === 'tickets' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Helpdesk Service Requests & Missing Punches</h3>
                <p className="text-[11px] text-slate-400">Review, resolve, and take action on employee tickets</p>
              </div>

              <div className="flex items-center gap-2">
                {['all', 'pending', 'in_progress', 'resolved'].map(st => (
                  <button
                    key={st}
                    onClick={() => setTicketStatusFilter(st)}
                    className={`px-3 py-1 rounded-xl text-xs font-bold capitalize transition-colors ${
                      ticketStatusFilter === st
                        ? 'bg-sky-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Ticket ID</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Title & Details</th>
                    <th className="p-3">Suggested Timing</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets
                    .filter(t => ticketStatusFilter === 'all' || t.status === ticketStatusFilter)
                    .map(t => (
                      <tr key={t.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-mono font-bold text-sky-600">#{t.id}</td>
                        <td className="p-3 font-semibold text-slate-900">
                          <div>{t.employee_name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{t.employee_code} &bull; {t.department}</div>
                        </td>
                        <td className="p-3 capitalize text-slate-700">
                          <span className="bg-slate-100 px-2 py-0.5 rounded font-medium text-[11px]">
                            {t.request_type ? t.request_type.replace('_', ' ') : 'General'}
                          </span>
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-slate-800">{t.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{t.description || 'No description'}</p>
                        </td>
                        <td className="p-3 font-mono text-slate-600">
                          {t.punch_date && <div>{t.punch_date}</div>}
                          {(t.suggested_punch_in || t.suggested_punch_out) && (
                            <div className="text-[10px] text-slate-400">{t.suggested_punch_in || '--'} - {t.suggested_punch_out || '--'}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            t.status === 'resolved' ? 'bg-emerald-100 text-emerald-800' :
                            t.status === 'in_progress' ? 'bg-sky-100 text-sky-800' :
                            t.status === 'closed' ? 'bg-slate-100 text-slate-600' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setChatTicketId(t.id);
                                setShowChatModal(true);
                              }}
                              className="px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                              title="Open Ticket Conversation"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Chat
                            </button>
                            <button
                              onClick={() => {
                                setSelectedTicket(t);
                                setResolutionNotes(t.resolution_notes || '');
                                setShowSolveTicketModal(true);
                              }}
                              className="px-3 py-1 bg-sky-50 hover:bg-sky-100 text-sky-700 font-bold rounded-lg text-xs"
                            >
                              Solve Ticket
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  {tickets.length === 0 && (
                    <tr>
                      <td colSpan="7" className="p-8 text-center text-xs text-slate-400">
                        No service requests found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* LEAVE MANAGEMENT & ACCRUAL TAB */}
      {activeTab === 'leave' && (
        <div className="space-y-6">
          {/* Master Policy & Manual Credit Control Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="p-2 bg-sky-50 text-sky-600 rounded-xl">
                    <Calendar className="w-5 h-5" />
                  </span>
                  <h3 className="text-base font-bold text-slate-900">Master Leave Policy (CL = 12/yr, EL = 1.25/mo)</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Two-tier statutory leave policy: Casual Leave (12 days/year) and Earned Leave (1.25 days/month). Zero-Payroll Compliant.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleRunMonthlyAccrual}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  title="Auto-credit monthly +1.25 Earned Leave to all active staff"
                >
                  <span>⚡ Run Monthly Accrual (+1.25 EL)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualLeaveModal(true)}
                  className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  title="Manually credit custom leave quota to all staff or a specific employee"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Manual Leave Credit</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteLeaveModal(true)}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  title="Master reset or manually deduct leave balances"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete / Deduct Leave</span>
                </button>
              </div>
            </div>

            {/* Master Policy Apply Box */}
            <form onSubmit={handleMasterLeaveApply} className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Master Apply Policy To All Employees</h4>
                  <p className="text-[11px] text-slate-500">
                    Set policy defaults and batch apply to all active staff. Updates will instantly reflect in employee portals.
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={masterPolicySubmitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                >
                  {masterPolicySubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>⚡ Master Apply to All Staff ({employees.length})</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Casual Leave (CL) Annual Quota (Days/Year)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="1"
                      min="1"
                      max="365"
                      required
                      value={masterPolicyForm.cl_quota}
                      onChange={(e) => setMasterPolicyForm({ ...masterPolicyForm, cl_quota: e.target.value })}
                      className="w-full p-2 text-sm font-bold text-sky-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">days / year</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Default: 12 days per calendar year</span>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Earned Leave (EL) Accrual Rate (Days/Month)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.05"
                      min="0.25"
                      max="30"
                      required
                      value={masterPolicyForm.el_monthly_rate}
                      onChange={(e) => setMasterPolicyForm({ ...masterPolicyForm, el_monthly_rate: e.target.value })}
                      className="w-full p-2 text-sm font-bold text-emerald-700 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">days / mo</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-1 block">Default: 1.25 days per month (custom entered supported)</span>
                </div>
              </div>
            </form>

            {/* Leave Balance Pools */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-sky-200 bg-sky-50/50 space-y-1">
                <span className="text-xs font-bold text-sky-900 uppercase">Casual Leave (CL) Balance Pool</span>
                <div className="text-2xl font-black text-sky-800">
                  {leaveSummary.cl?.total_balance || 0} <span className="text-xs font-medium text-slate-500">days available</span>
                </div>
                <div className="text-[11px] text-slate-600 flex items-center gap-2">
                  <span>Yearly Quota: <strong>{leaveSummary.cl?.total_quota || 0}d</strong></span>
                  <span>•</span>
                  <span>Used: <strong className="text-rose-600">{leaveSummary.cl?.total_used || 0}d</strong></span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-xs font-bold text-emerald-900 uppercase">Earned Leave (EL) Balance Pool</span>
                <div className="text-2xl font-black text-emerald-800">
                  {leaveSummary.el?.total_balance || 0} <span className="text-xs font-medium text-slate-500">days available</span>
                </div>
                <div className="text-[11px] text-slate-600 flex items-center gap-2">
                  <span>Accrued: <strong>{leaveSummary.el?.total_accrued || 0}d</strong></span>
                  <span>•</span>
                  <span>Used: <strong className="text-rose-600">{leaveSummary.el?.total_used || 0}d</strong></span>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-xs font-bold text-slate-800 uppercase">Configured Leave Types</span>
                <div className="text-sm font-semibold text-slate-700 space-y-0.5 pt-1">
                  {leaveTypes.filter(lt => !lt.name.toLowerCase().includes('paid leave')).map(lt => (
                    <div key={lt.id} className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-800">{lt.name} ({lt.code})</span>
                      <span className="text-slate-500">{lt.code === 'CL' ? `${lt.default_yearly_quota}d/yr` : `+${lt.monthly_accrual_rate || 1.25}d/mo`}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Accrual Logs History */}
            <div className="pt-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Recent Monthly Accrual History</h4>
              <div className="overflow-x-auto border border-slate-200 rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th className="p-2.5">Leave Type</th>
                      <th className="p-2.5">Period (Month / Year)</th>
                      <th className="p-2.5">Credited Rate</th>
                      <th className="p-2.5">Total Staff Credited</th>
                      <th className="p-2.5">Executed By</th>
                      <th className="p-2.5">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaveAccruals.map(la => (
                      <tr key={la.id} className="hover:bg-slate-50/50">
                        <td className="p-2.5 font-bold text-slate-800">{la.leave_type_name}</td>
                        <td className="p-2.5 font-mono text-sky-600 font-semibold">{la.month}/{la.year}</td>
                        <td className="p-2.5 text-emerald-700 font-semibold">+{la.rate} days</td>
                        <td className="p-2.5 text-slate-700">{la.total_employees} employees</td>
                        <td className="p-2.5 text-slate-600">{la.applied_by_name || 'Admin'}</td>
                        <td className="p-2.5 text-slate-400">{la.created_at}</td>
                      </tr>
                    ))}
                    {leaveAccruals.length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-4 text-center text-slate-400">
                          No automated accruals run yet. Click "Run Monthly Accrual" to credit the monthly quota.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Attendance Correction Requests Section */}
          <AttendanceCorrectionReviewView role="company_admin" title="Attendance Correction Applications" />
        </div>
      )}

      {/* ATTENDANCE CORRECTIONS TAB */}
      {activeTab === 'corrections' && (
        <AttendanceCorrectionReviewView role="company_admin" />
      )}

      {/* GEOFENCES TAB */}
      {activeTab === 'geofences' && (
        <div className="space-y-6">
          {/* Company-Wide Geofence Mode Policy Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Company-Wide Geofence Mode Setting
                  </h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                    companyGeofencePolicy === 'anywhere'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                      : 'bg-sky-100 text-sky-800 border border-sky-200'
                  }`}>
                    {companyGeofencePolicy === 'anywhere' ? '🌐 Anywhere Punching Active' : '🏢 Office Geofence Strict Mode'}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Configure whether company attendance enforces office meter perimeters or permits punching from anywhere without restrictions.
                </p>
              </div>

              {/* Status Pill */}
              <div className="text-xs font-semibold">
                {companyGeofencePolicy === 'anywhere' ? (
                  <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Anywhere Punching Enabled (No Restrictions)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-sky-700 bg-sky-50 px-3 py-1.5 rounded-xl border border-sky-200">
                    <Building2 className="w-4 h-4 text-sky-600" />
                    <span>Strict Office Perimeter Enforced</span>
                  </div>
                )}
              </div>
            </div>

            {/* Policy Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Anywhere Punching */}
              <div
                onClick={() => setPendingPolicy('anywhere')}
                className={`cursor-pointer p-4 rounded-xl border-2 transition-all space-y-2 ${
                  pendingPolicy === 'anywhere'
                    ? 'border-emerald-500 bg-emerald-50/40 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-emerald-100 text-emerald-700 rounded-lg">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">🌐 Anywhere Punching Mode</div>
                      <div className="text-[10px] text-emerald-700 font-semibold">Recommended for remote/flexible workforce</div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="company_geofence_policy"
                    checked={pendingPolicy === 'anywhere'}
                    onChange={() => setPendingPolicy('anywhere')}
                    className="text-emerald-600"
                  />
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Allows employees across the entire company to punch attendance from <strong>any location</strong> without being blocked by office distance radiuses.
                </p>
              </div>

              {/* Option 2: Strict Office Geofencing */}
              <div
                onClick={() => setPendingPolicy('strict')}
                className={`cursor-pointer p-4 rounded-xl border-2 transition-all space-y-2 ${
                  pendingPolicy === 'strict'
                    ? 'border-sky-500 bg-sky-50/40 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-sky-100 text-sky-700 rounded-lg">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">🏢 Strict Office Geofence Mode</div>
                      <div className="text-[10px] text-sky-700 font-semibold">Strict meter perimeter validation</div>
                    </div>
                  </div>
                  <input
                    type="radio"
                    name="company_geofence_policy"
                    checked={pendingPolicy === 'strict'}
                    onChange={() => setPendingPolicy('strict')}
                    className="text-sky-600"
                  />
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Restricts employee attendance to authorized office sites within designated meter radiuses (e.g. 100m, 200m). Punches outside are blocked.
                </p>
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
              <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                <input
                  type="checkbox"
                  checked={applyPolicyToAll}
                  onChange={(e) => setApplyPolicyToAll(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                />
                <span>Also reset all existing employee profiles to "Anywhere" mode</span>
              </label>

              <button
                onClick={() => handleUpdateCompanyPolicy(pendingPolicy, applyPolicyToAll)}
                disabled={companyPolicyUpdating || (pendingPolicy === companyGeofencePolicy && !applyPolicyToAll)}
                className="px-4 py-2 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
              >
                {companyPolicyUpdating ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Update Company Geofence Policy</span>
              </button>
            </div>
          </div>

          {/* Policy Information Banner */}
          <div className="bg-gradient-to-r from-sky-50 via-indigo-50 to-blue-50 rounded-2xl border border-sky-100 p-5 shadow-sm">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-sky-600 text-white rounded-xl shadow-md shadow-sky-600/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div className="space-y-1.5 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900">
                    Geofencing Policy: Enforced Exclusively for Employees
                  </h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-600 text-white uppercase tracking-wider">
                    Employee Only
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                    Manager Exempt
                  </span>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Geofence boundaries are enforced <strong>strictly for staff with the Employee role</strong>. Managers are exempt from location boundaries and can mark attendance from anywhere.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-2 text-slate-700 bg-white/70 p-2.5 rounded-xl border border-sky-100/60">
                    <Globe className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span><strong>Anywhere Attendance:</strong> Employees set to "Anywhere" or unassigned can punch attendance from any location without distance limits.</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-700 bg-white/70 p-2.5 rounded-xl border border-sky-100/60">
                    <MapPin className="w-4 h-4 text-sky-600 flex-shrink-0" />
                    <span><strong>Meter Radius Boundary:</strong> Assigned employees must punch strictly within their office radius in meters; otherwise attendance is blocked.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section 1: Configured Office Geofence Locations */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-sky-600" />
                  <h3 className="text-sm font-bold text-slate-900">Configured Office Geofences</h3>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                    {geofences.length} Offices
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">Manage multiple office sites with designated meter boundary radiuses</p>
              </div>
              <button
                onClick={() => setShowGeofenceModal(true)}
                className="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Add Office Geofence</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold">
                  <tr>
                    <th className="p-3">Office / Location Name</th>
                    <th className="p-3">Coordinates (Lat, Lng)</th>
                    <th className="p-3">Meter Radius</th>
                    <th className="p-3">Assigned Staff</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {geofences.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="p-6 text-center text-slate-400">
                        No office geofences configured. Click "Add Office Geofence" to create one.
                      </td>
                    </tr>
                  ) : (
                    geofences.map(g => (
                      <tr key={g.id} className="hover:bg-slate-50/50">
                        <td className="p-3 font-semibold text-slate-900 flex items-center gap-2">
                          <Compass className="w-4 h-4 text-sky-600" />
                          <span>{g.location_name}</span>
                        </td>
                        <td className="p-3 font-mono text-slate-600">{g.latitude}, {g.longitude}</td>
                        <td className="p-3">
                          <span className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-100">
                            {g.radius} meters
                          </span>
                        </td>
                        <td className="p-3 text-slate-600 font-medium">
                          {g.assigned_employees_count || 0} employee(s)
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${g.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {g.status || 'active'}
                          </span>
                        </td>
                        <td className="p-3 text-right space-x-1">
                          <button
                            onClick={() => openEditGeofenceModal(g)}
                            title="Edit Office Location"
                            className="p-1.5 text-slate-400 hover:text-sky-600 rounded-lg hover:bg-sky-50"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteGeofence(g.id)}
                            title="Delete Office Geofence"
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 2: Master Employee Geofence Assignment Hub */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Master Employee Geofence Assignment Hub</h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700">
                      Bulk Assignment Tool
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Assign 1 employee to Office A, multiple employees to Office B, or batch set to Anywhere in one click.
                  </p>
                </div>

                {/* Master Action Toolbar */}
                <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 font-semibold">
                    <span>Assign To:</span>
                    <select
                      value={bulkTargetGeofenceId}
                      onChange={(e) => setBulkTargetGeofenceId(e.target.value)}
                      className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50 font-medium focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    >
                      <option value="anywhere">🌐 Anywhere (No Geofence Restriction)</option>
                      {geofences.map(g => (
                        <option key={g.id} value={g.id}>
                          🏢 {g.location_name} ({g.radius}m)
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleBulkAssignGeofence}
                    disabled={selectedGeofenceEmpIds.length === 0 || bulkGeofenceSubmitting}
                    className="px-3.5 py-1.5 bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-500 hover:to-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                  >
                    {bulkGeofenceSubmitting ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>Apply Master Assignment ({selectedGeofenceEmpIds.length})</span>
                  </button>
                </div>
              </div>

              {/* Filtering & Search Bar */}
              <div className="mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2 flex-1">
                  {/* Search */}
                  <div className="relative flex-1 min-w-[200px] max-w-xs">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search employee name or ID..."
                      value={geofenceSearchQuery}
                      onChange={(e) => setGeofenceSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>

                  {/* City Filter */}
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-medium">City:</span>
                    <select
                      value={geofenceCityFilter}
                      onChange={(e) => setGeofenceCityFilter(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="all">All Cities</option>
                      {[...new Set(geofenceEmployees.map(e => e.city).filter(Boolean))].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Geofence Status Filter */}
                  <div className="flex items-center gap-1">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <select
                      value={geofenceStatusFilter}
                      onChange={(e) => setGeofenceStatusFilter(e.target.value)}
                      className="px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="all">All Employees</option>
                      <option value="assigned">Assigned to Office</option>
                      <option value="anywhere">Anywhere Mode</option>
                    </select>
                  </div>
                </div>

                <div className="text-slate-500 text-[11px] font-medium">
                  Showing {
                    geofenceEmployees.filter(emp => {
                      if (geofenceSearchQuery.trim()) {
                        const q = geofenceSearchQuery.toLowerCase();
                        if (!emp.full_name?.toLowerCase().includes(q) && !emp.employee_id?.toLowerCase().includes(q)) return false;
                      }
                      if (geofenceCityFilter !== 'all' && emp.city !== geofenceCityFilter) return false;
                      if (geofenceStatusFilter === 'assigned' && (!emp.geofence_id || emp.geofence_mode === 'none')) return false;
                      if (geofenceStatusFilter === 'anywhere' && (emp.geofence_id && emp.geofence_mode !== 'none')) return false;
                      return true;
                    }).length
                  } staff
                </div>
              </div>
            </div>

            {/* Employee Table */}
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 text-slate-600 uppercase font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="p-3 w-10 text-center">
                      <input
                        type="checkbox"
                        aria-label="Select all employees"
                        checked={
                          (() => {
                            const filtered = geofenceEmployees.filter(emp => {
                              if (geofenceSearchQuery.trim()) {
                                const q = geofenceSearchQuery.toLowerCase();
                                if (!emp.full_name?.toLowerCase().includes(q) && !emp.employee_id?.toLowerCase().includes(q)) return false;
                              }
                              if (geofenceCityFilter !== 'all' && emp.city !== geofenceCityFilter) return false;
                              if (geofenceStatusFilter === 'assigned' && (!emp.geofence_id || emp.geofence_mode === 'none')) return false;
                              if (geofenceStatusFilter === 'anywhere' && (emp.geofence_id && emp.geofence_mode !== 'none')) return false;
                              return true;
                            });
                            return filtered.length > 0 && filtered.every(e => selectedGeofenceEmpIds.includes(e.id));
                          })()
                        }
                        onChange={(e) => {
                          const filtered = geofenceEmployees.filter(emp => {
                            if (geofenceSearchQuery.trim()) {
                              const q = geofenceSearchQuery.toLowerCase();
                              if (!emp.full_name?.toLowerCase().includes(q) && !emp.employee_id?.toLowerCase().includes(q)) return false;
                            }
                            if (geofenceCityFilter !== 'all' && emp.city !== geofenceCityFilter) return false;
                            if (geofenceStatusFilter === 'assigned' && (!emp.geofence_id || emp.geofence_mode === 'none')) return false;
                            if (geofenceStatusFilter === 'anywhere' && (emp.geofence_id && emp.geofence_mode !== 'none')) return false;
                            return true;
                          });
                          if (e.target.checked) {
                            const newIds = Array.from(new Set([...selectedGeofenceEmpIds, ...filtered.map(emp => emp.id)]));
                            setSelectedGeofenceEmpIds(newIds);
                          } else {
                            const filteredIds = new Set(filtered.map(emp => emp.id));
                            setSelectedGeofenceEmpIds(selectedGeofenceEmpIds.filter(id => !filteredIds.has(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                    </th>
                    <th className="p-3">Employee Name</th>
                    <th className="p-3">Role & Department</th>
                    <th className="p-3">City</th>
                    <th className="p-3">Current Geofence Status</th>
                    <th className="p-3 text-right">Instant Assign</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(() => {
                    const filtered = geofenceEmployees.filter(emp => {
                      if (geofenceSearchQuery.trim()) {
                        const q = geofenceSearchQuery.toLowerCase();
                        if (!emp.full_name?.toLowerCase().includes(q) && !emp.employee_id?.toLowerCase().includes(q)) return false;
                      }
                      if (geofenceCityFilter !== 'all' && emp.city !== geofenceCityFilter) return false;
                      if (geofenceStatusFilter === 'assigned' && (!emp.geofence_id || emp.geofence_mode === 'none')) return false;
                      if (geofenceStatusFilter === 'anywhere' && (emp.geofence_id && emp.geofence_mode !== 'none')) return false;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-slate-400">
                            No employees match the selected criteria.
                          </td>
                        </tr>
                      );
                    }

                    return filtered.map(emp => {
                      const isSelected = selectedGeofenceEmpIds.includes(emp.id);
                      const isAssigned = emp.geofence_id && emp.geofence_mode !== 'none';

                      return (
                        <tr
                          key={emp.id}
                          className={`hover:bg-slate-50/70 transition-colors ${isSelected ? 'bg-sky-50/50' : ''}`}
                        >
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedGeofenceEmpIds([...selectedGeofenceEmpIds, emp.id]);
                                } else {
                                  setSelectedGeofenceEmpIds(selectedGeofenceEmpIds.filter(id => id !== emp.id));
                                }
                              }}
                              className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                            />
                          </td>
                          <td className="p-3">
                            <div className="font-semibold text-slate-900">{emp.full_name}</div>
                            <div className="text-[10px] font-mono text-slate-400">{emp.employee_id}</div>
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                                emp.role_name === 'manager' ? 'bg-purple-100 text-purple-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {emp.role_name}
                              </span>
                              <span className="text-slate-500">{emp.department || 'Operations'}</span>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600">{emp.city || '—'}</td>
                          <td className="p-3">
                            {isAssigned ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200/70">
                                <Building2 className="w-3.5 h-3.5 text-sky-600 flex-shrink-0" />
                                <span>{emp.assigned_geofence_name || 'Assigned Office'} ({emp.assigned_geofence_radius || '—'}m)</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70">
                                <Globe className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                                <span>Anywhere (No Restriction)</span>
                              </div>
                            )}
                          </td>
                          <td className="p-3 text-right">
                            <select
                              value={emp.geofence_id && emp.geofence_mode !== 'none' ? emp.geofence_id : 'anywhere'}
                              onChange={(e) => handleSingleAssignGeofence(emp.id, e.target.value)}
                              className="px-2 py-1 border border-slate-200 rounded-lg text-[11px] bg-white font-medium focus:ring-1 focus:ring-sky-500 focus:outline-none"
                            >
                              <option value="anywhere">🌐 Anywhere</option>
                              {geofences.map(g => (
                                <option key={g.id} value={g.id}>🏢 {g.location_name} ({g.radius}m)</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    });
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <LiveTrackingMap companyId={company?.id} />
        </div>
      )}

      {/* SHIFTS & ROTATIONAL TAB */}
      {activeTab === 'shifts' && (
        <ShiftManagementView company={company} role="company_admin" />
      )}

      {/* HOLIDAYS & WEEKLY OFF TAB */}
      {activeTab === 'holidays' && (
        <HolidaysWeeklyOffView company={company} role="company_admin" />
      )}

      {/* LIVE MAP TAB */}
      {activeTab === 'live-map' && (
        <LiveTrackingMap companyId={company?.id} />
      )}

      {/* SETTINGS & LOGO UPLOAD TAB */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Logo Upload Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4 lg:col-span-1">
            <div className="border-b border-slate-100 pb-2 flex items-center gap-2">
              <Image className="w-4 h-4 text-sky-600" />
              <h3 className="text-sm font-bold text-slate-900">Company Logo Upload</h3>
            </div>

            <p className="text-xs text-slate-500">
              Upload your company logo. Appears dynamically in authenticated panels and headers.
            </p>

            {/* Logo Preview Box */}
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 flex flex-col items-center justify-center min-h-[160px] text-center">
              {logoPreview ? (
                <div className="space-y-2">
                  <img
                    src={logoPreview}
                    alt="Company Logo Preview"
                    className="max-h-24 max-w-[200px] object-contain mx-auto shadow-sm rounded-lg bg-white p-2 border border-slate-100"
                  />
                  <span className="text-[10px] text-emerald-600 font-semibold block">Active Logo Preview</span>
                </div>
              ) : (
                <div className="text-slate-400 space-y-1">
                  <Image className="w-10 h-10 mx-auto opacity-50" />
                  <span className="text-xs">No logo currently uploaded</span>
                </div>
              )}
            </div>

            {/* File Input & Upload Trigger */}
            <div className="space-y-3">
              <input
                type="file"
                id="logo-upload-input"
                accept="image/png, image/jpeg, image/jpg, image/webp, image/svg+xml"
                onChange={handleLogoFileChange}
                className="hidden"
              />
              <label
                htmlFor="logo-upload-input"
                className="w-full py-2 px-3 border border-slate-300 hover:border-sky-500 rounded-xl text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-sm"
              >
                <Upload className="w-4 h-4 text-slate-500" />
                <span>{logoFile ? logoFile.name : 'Select Image File (PNG, JPG, SVG)'}</span>
              </label>

              <button
                type="button"
                onClick={handleUploadLogo}
                disabled={!logoFile || uploadingLogo}
                className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-semibold shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {uploadingLogo ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Upload & Apply Logo</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Company Policy & Settings Form */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5 lg:col-span-2">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
              Company Portal & Attendance Policy Configuration
            </h3>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Portal Display Name</label>
                <input
                  type="text"
                  value={settingsForm.portal_name}
                  onChange={(e) => setSettingsForm({ ...settingsForm, portal_name: e.target.value })}
                  className="w-full p-2.5 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Half Day Minimum Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settingsForm.half_day_min_hours}
                    onChange={(e) => setSettingsForm({ ...settingsForm, half_day_min_hours: parseFloat(e.target.value) })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                  <span className="text-[10px] text-slate-400">Below this is marked Absent</span>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Day Minimum Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={settingsForm.full_day_min_hours}
                    onChange={(e) => setSettingsForm({ ...settingsForm, full_day_min_hours: parseFloat(e.target.value) })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                  <span className="text-[10px] text-slate-400">At or above this is marked Present</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Post-Login Branding Mode</label>
                  <select
                    value={settingsForm.show_branding_mode}
                    onChange={(e) => setSettingsForm({ ...settingsForm, show_branding_mode: e.target.value })}
                    className="w-full p-2.5 border rounded-lg bg-white"
                  >
                    <option value="both">Show Both (Logo & Name)</option>
                    <option value="logo_only">Show Logo Only</option>
                    <option value="name_only">Show Company Name Only</option>
                    <option value="neither">Show Neither</option>
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Auto-Archive Requests (Days)</label>
                  <input
                    type="number"
                    min="1"
                    value={settingsForm.auto_archive_days}
                    onChange={(e) => setSettingsForm({ ...settingsForm, auto_archive_days: parseInt(e.target.value, 10) })}
                    className="w-full p-2.5 border rounded-lg"
                  />
                  <span className="text-[10px] text-slate-400">Archived from active view while preserved in database</span>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t border-slate-100">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Settings Instantly
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD STAFF (EMPLOYEE / MANAGER / HR) */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8 max-h-[92vh] overflow-y-auto">
            <div className="border-b border-slate-100 pb-2 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-sky-600" />
                  Add Personnel / Staff
                </h3>
                <p className="text-xs text-slate-500">Configure role position, multi-level reporting hierarchy & geofencing</p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
              {/* Position / Role Selector Pill Toggle */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Select Position / Role *</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setStaffForm({
                      ...staffForm,
                      role: 'employee',
                      department: 'Operations',
                      designation: 'Associate',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      staffForm.role === 'employee' ? 'bg-sky-50 border-sky-500 text-sky-700 ring-1 ring-sky-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Employee
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffForm({
                      ...staffForm,
                      role: 'manager',
                      department: 'Management',
                      designation: 'Team Manager',
                      reports_to_manager: false,
                      manager_id: '',
                      reports_to_hr: false,
                      hr_id: '',
                      reports_to_admin: false
                    })}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      staffForm.role === 'manager' ? 'bg-purple-50 border-purple-500 text-purple-700 ring-1 ring-purple-500' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Manager
                  </button>
                </div>
              </div>

              {/* Dynamic Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-sky-600" />
                    Reporting Line
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {staffForm.role === 'employee' ? 'Select reporting manager or direct admin' : 'Direct Admin Report'}
                  </span>
                </div>

                {staffForm.role === 'employee' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: Manager */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={staffForm.reports_to_manager}
                          onChange={(e) => setStaffForm({
                            ...staffForm,
                            reports_to_manager: e.target.checked,
                            manager_id: e.target.checked ? staffForm.manager_id : ''
                          })}
                          className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <span>Report to Manager</span>
                      </label>
                      {staffForm.reports_to_manager && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={staffForm.manager_id}
                            onChange={(e) => setStaffForm({ ...staffForm, manager_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={staffForm.reports_to_manager}
                          >
                            <option value="">-- Select Reporting Manager * --</option>
                            {employees.filter(e => e.role_name === 'manager').map(m => (
                              <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id}) - {m.designation || 'Manager'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={staffForm.reports_to_admin}
                          onChange={(e) => setStaffForm({ ...staffForm, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {staffForm.role === 'manager' && (
                  <div className="flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      Direct Report: Company Admin (All Managers report directly to the Company Administrator).
                    </span>
                  </div>
                )}
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {staffForm.role === 'manager' ? (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Geofencing Optional (Exempt)
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Mandatory Punching Geofence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">
                      Assigned Geofence {staffForm.role === 'employee' ? '*' : '(Optional)'}
                    </label>
                    <select
                      value={staffForm.geofence_id}
                      onChange={(e) => setStaffForm({ ...staffForm, geofence_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">
                        {staffForm.role === 'employee' ? 'Default Company Geofence' : 'No Geofencing (Allowed Anywhere)'}
                      </option>
                      {geofences.map(g => (
                        <option key={g.id} value={g.id}>{g.location_name} ({g.radius}m radius)</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {staffForm.role === 'employee'
                        ? 'Attendance punches are strictly blocked outside this perimeter.'
                        : 'Managers are exempt; can punch from anywhere unless customized.'}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">Assigned Shift *</label>
                    <select
                      value={staffForm.shift_id}
                      onChange={(e) => setStaffForm({ ...staffForm, shift_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">Default General Shift</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">Governs working hours and attendance window.</p>
                  </div>
                </div>
              </div>

              {/* Basic Information */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee ID / Code (Optional)</label>
                  <input
                    type="text"
                    value={staffForm.employee_id}
                    onChange={(e) => setStaffForm({ ...staffForm, employee_id: e.target.value.toUpperCase() })}
                    placeholder="Leave blank to assign in future"
                    className="w-full p-2 border rounded-lg uppercase font-mono"
                  />
                  <span className="text-[10px] text-slate-400">Optional: If left blank, it will not be auto-generated and can be assigned later.</span>
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.full_name}
                    onChange={(e) => setStaffForm({ ...staffForm, full_name: e.target.value })}
                    placeholder="e.g. Ramesh Chandra"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Username *</label>
                  <input
                    type="text"
                    required
                    value={staffForm.username}
                    onChange={(e) => setStaffForm({ ...staffForm, username: e.target.value })}
                    placeholder="e.g. ramesh_chandra"
                    className="w-full p-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Temporary Password *</label>
                  <input
                    type="password"
                    required
                    value={staffForm.password}
                    onChange={(e) => setStaffForm({ ...staffForm, password: e.target.value })}
                    placeholder="••••••••"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={staffForm.department}
                    onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={staffForm.designation}
                    onChange={(e) => setStaffForm({ ...staffForm, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">City / Location</label>
                  <input
                    type="text"
                    value={staffForm.city}
                    onChange={(e) => setStaffForm({ ...staffForm, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={staffForm.mobile}
                    onChange={(e) => setStaffForm({ ...staffForm, mobile: e.target.value })}
                    placeholder="+91 9876543210"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={staffForm.email}
                    onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                    placeholder="name@company.com"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Personnel Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT STAFF */}
      {showEditStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Edit Personnel Record
                </h3>
                <p className="text-xs text-slate-500">Update account details, role permissions, geofencing & assignments</p>
              </div>
              <button
                type="button"
                onClick={() => setShowEditStaffModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditStaff} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Employee Code</label>
                  <input
                    type="text"
                    value={editStaffForm.employee_id}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                    placeholder="EMP0001"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Account Role *</label>
                  <select
                    value={editStaffForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      setEditStaffForm({
                        ...editStaffForm,
                        role: newRole,
                        reports_to_manager: newRole === 'employee' ? editStaffForm.reports_to_manager : false,
                        manager_id: newRole === 'employee' ? editStaffForm.manager_id : '',
                        reports_to_admin: newRole === 'manager' ? true : editStaffForm.reports_to_admin
                      });
                    }}
                    className="w-full p-2 border rounded-lg bg-white capitalize font-medium text-slate-800"
                  >
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
              </div>

              {/* Full Name & Username (Admin Editable) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={editStaffForm.full_name}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, full_name: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder="e.g. Ramesh Chandra"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700 block">Username *</label>
                    <span className="text-[10px] text-sky-600 font-bold bg-sky-50 px-1.5 py-0.5 rounded">Admin Editable</span>
                  </div>
                  <input
                    type="text"
                    required
                    value={editStaffForm.username}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, username: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                    placeholder="e.g. ramesh_chandra"
                  />
                </div>
              </div>

              {/* Department & Designation */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Department</label>
                  <input
                    type="text"
                    value={editStaffForm.department}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, department: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder="e.g. Operations"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Designation</label>
                  <input
                    type="text"
                    value={editStaffForm.designation}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, designation: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder="e.g. Staff"
                  />
                </div>
              </div>

              {/* Mobile Phone & Email */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Mobile Phone</label>
                  <input
                    type="text"
                    value={editStaffForm.mobile}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, mobile: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder="+91 9876543210"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Email</label>
                  <input
                    type="email"
                    value={editStaffForm.email}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, email: e.target.value })}
                    className="w-full p-2 border rounded-lg"
                    placeholder="name@company.com"
                  />
                </div>
              </div>

              {/* Dynamic Multi-Level Reporting Hierarchy */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <GitMerge className="w-4 h-4 text-sky-600" />
                    Reporting Line
                  </span>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {editStaffForm.role === 'employee' ? 'Select reporting manager or direct admin' : 'Direct Admin Report'}
                  </span>
                </div>

                {editStaffForm.role === 'employee' && (
                  <div className="space-y-2.5 pt-1">
                    {/* Checkbox 1: Manager */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editStaffForm.reports_to_manager}
                          onChange={(e) => setEditStaffForm({
                            ...editStaffForm,
                            reports_to_manager: e.target.checked,
                            manager_id: e.target.checked ? editStaffForm.manager_id : ''
                          })}
                          className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                        />
                        <span>Report to Manager</span>
                      </label>
                      {editStaffForm.reports_to_manager && (
                        <div className="ml-6 mt-1.5">
                          <select
                            value={editStaffForm.manager_id}
                            onChange={(e) => setEditStaffForm({ ...editStaffForm, manager_id: e.target.value })}
                            className="w-full p-2 border rounded-lg bg-white text-xs"
                            required={editStaffForm.reports_to_manager}
                          >
                            <option value="">-- Select Reporting Manager * --</option>
                            {employees.filter(e => e.role_name === 'manager' && e.id !== editingStaffId).map(m => (
                              <option key={m.id} value={m.id}>{m.full_name} ({m.employee_id}) - {m.designation || 'Manager'}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Checkbox 2: Direct Admin */}
                    <div>
                      <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          checked={editStaffForm.reports_to_admin}
                          onChange={(e) => setEditStaffForm({ ...editStaffForm, reports_to_admin: e.target.checked })}
                          className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Report Directly to Company Admin</span>
                          <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">Admin Level</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}

                {editStaffForm.role === 'manager' && (
                  <div className="flex items-center gap-2 p-2.5 bg-purple-50 border border-purple-200 rounded-lg text-purple-800">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span className="text-[11px] font-medium">
                      Direct Report: Company Admin (All Managers report directly to the Company Administrator).
                    </span>
                  </div>
                )}
              </div>

              {/* Assigned Geofencing & Shift */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-800 flex items-center gap-1.5">
                    <Compass className="w-4 h-4 text-sky-600" />
                    Geofencing & Shift Assignment
                  </span>
                  {editStaffForm.role === 'manager' ? (
                    <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Geofencing Optional (Exempt)
                    </span>
                  ) : (
                    <span className="text-[10px] text-rose-600 font-bold bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Mandatory Punching Geofence
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">
                      Assigned Geofence {editStaffForm.role === 'employee' ? '*' : '(Optional)'}
                    </label>
                    <select
                      value={editStaffForm.geofence_id}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, geofence_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">
                        {editStaffForm.role === 'employee' ? 'Default Company Geofence' : 'No Geofence (Allowed Anywhere)'}
                      </option>
                      {geofences.map(g => (
                        <option key={g.id} value={g.id}>{g.location_name} ({g.radius}m radius)</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      {editStaffForm.role === 'employee'
                        ? 'Attendance punches are strictly blocked outside this perimeter.'
                        : 'Managers are exempt; can punch anywhere unless customized.'}
                    </p>
                  </div>
                  <div>
                    <label className="font-medium text-slate-700 block mb-1">Assigned Shift *</label>
                    <select
                      value={editStaffForm.shift_id}
                      onChange={(e) => setEditStaffForm({ ...editStaffForm, shift_id: e.target.value })}
                      className="w-full p-2 border rounded-lg bg-white"
                    >
                      <option value="">Default General Shift</option>
                      {shifts.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.start_time} - {s.end_time})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">Governs working hours and attendance window.</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">City / Location</label>
                  <input
                    type="text"
                    value={editStaffForm.city}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, city: e.target.value })}
                    placeholder="e.g. Mumbai"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Account Status</label>
                  <select
                    value={editStaffForm.status}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, status: e.target.value })}
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
                    value={editStaffForm.password}
                    onChange={(e) => setEditStaffForm({ ...editStaffForm, password: e.target.value })}
                    placeholder="Leave blank to keep current"
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditStaffModal(false)}
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

      {/* MODAL: SOLVE HELPDESK TICKET */}
      {showSolveTicketModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded">
                    Ticket #{selectedTicket.id}
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                    selectedTicket.status === 'resolved' ? 'bg-emerald-50 text-emerald-700' :
                    selectedTicket.status === 'in_progress' ? 'bg-amber-50 text-amber-700' :
                    'bg-rose-50 text-rose-700'
                  }`}>
                    {selectedTicket.status}
                  </span>
                </div>
                <h3 className="text-base font-bold text-slate-900 mt-1">{selectedTicket.title}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSolveTicketModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div><span className="font-semibold text-slate-800">Submitted By:</span> {selectedTicket.employee_name || 'Staff'} ({selectedTicket.employee_id || 'N/A'})</div>
                <div><span className="font-semibold text-slate-800">Category:</span> {selectedTicket.category || selectedTicket.request_type}</div>
                <div><span className="font-semibold text-slate-800">Priority:</span> <span className="capitalize font-medium">{selectedTicket.priority || 'Normal'}</span></div>
                <div><span className="font-semibold text-slate-800">Date:</span> {new Date(selectedTicket.created_at).toLocaleDateString()}</div>
              </div>
              {selectedTicket.description && (
                <div className="pt-2 border-t border-slate-200/60">
                  <span className="font-semibold text-slate-800 block mb-1">Issue Description:</span>
                  <p className="text-slate-700 bg-white p-2 rounded border border-slate-200">{selectedTicket.description}</p>
                </div>
              )}
            </div>

            <div className="space-y-2 text-xs">
              <label className="font-semibold text-slate-700 block">
                Resolution & Helpdesk Notes *
              </label>
              <textarea
                rows="3"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Enter resolution notes, root cause, or actions taken to resolve this ticket..."
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-sky-500 focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSolveTicketModal(false)}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-xs font-medium"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleResolveTicket('in_progress')}
                  className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold"
                >
                  Mark In Progress
                </button>
                <button
                  type="button"
                  onClick={() => handleResolveTicket('resolved')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Resolve & Close Ticket
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MANUAL LEAVE CREDIT */}
      {showManualLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Manual Leave Credit (Quota Adjustment)
                </h3>
                <p className="text-xs text-slate-500">Credit earned leave or adjustment to staff quotas</p>
              </div>
              <button
                type="button"
                onClick={() => setShowManualLeaveModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleManualLeaveCredit} className="space-y-3 text-xs">
              {/* Cadence Selection: Month-wise vs Year-wise */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Cadence / Period Type *</label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setManualLeaveForm(prev => ({
                      ...prev,
                      cadence: 'month',
                      days: (leaveTypes.find(lt => String(lt.id) === String(prev.leave_type_id))?.code === 'EL' ? 1.25 : 1.0)
                    }))}
                    className={`py-1.5 px-3 rounded-md text-xs font-bold text-center transition-all ${
                      manualLeaveForm.cadence === 'month'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Month-wise
                  </button>
                  <button
                    type="button"
                    onClick={() => setManualLeaveForm(prev => ({
                      ...prev,
                      cadence: 'year',
                      days: (leaveTypes.find(lt => String(lt.id) === String(prev.leave_type_id))?.code === 'CL' ? 12 : 15)
                    }))}
                    className={`py-1.5 px-3 rounded-md text-xs font-bold text-center transition-all ${
                      manualLeaveForm.cadence === 'year'
                        ? 'bg-sky-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Year-wise
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Leave Type *</label>
                <select
                  required
                  value={manualLeaveForm.leave_type_id}
                  onChange={(e) => {
                    const lId = e.target.value;
                    const sel = leaveTypes.find(lt => String(lt.id) === String(lId));
                    const isEL = sel && (sel.code === 'EL' || sel.name.toLowerCase().includes('earned'));
                    setManualLeaveForm({
                      ...manualLeaveForm,
                      leave_type_id: lId,
                      days: isEL && manualLeaveForm.cadence === 'month' ? 1.25 : manualLeaveForm.days
                    });
                  }}
                  className="w-full p-2 border rounded-lg bg-white font-medium"
                >
                  <option value="">Select Leave Type...</option>
                  {leaveTypes.filter(lt => !lt.name.toLowerCase().includes('paid leave')).map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Beneficiaries</label>
                <div className="flex gap-4 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_target"
                      checked={manualLeaveForm.apply_to_all}
                      onChange={() => setManualLeaveForm({ ...manualLeaveForm, apply_to_all: true, employee_id: '' })}
                      className="text-sky-600"
                    />
                    <span className="font-medium text-slate-800">All Company Staff ({employees.length})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="apply_target"
                      checked={!manualLeaveForm.apply_to_all}
                      onChange={() => setManualLeaveForm({ ...manualLeaveForm, apply_to_all: false })}
                      className="text-sky-600"
                    />
                    <span className="font-medium text-slate-800">Specific Employee</span>
                  </label>
                </div>
              </div>

              {!manualLeaveForm.apply_to_all && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Select Employee *</label>
                  <select
                    required={!manualLeaveForm.apply_to_all}
                    value={manualLeaveForm.employee_id}
                    onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option value="">Select an employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id}) - {emp.department}</option>
                    ))}
                  </select>
                </div>
              )}

              {(() => {
                const selLT = leaveTypes.find(lt => String(lt.id) === String(manualLeaveForm.leave_type_id));
                const isEL = selLT && (selLT.code === 'EL' || selLT.name.toLowerCase().includes('earned'));
                const isMonth = manualLeaveForm.cadence === 'month';
                const isOverCap = isEL && isMonth && parseFloat(manualLeaveForm.days) > 1.25;

                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700 block">Days to Credit *</label>
                      {isEL && isMonth && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          Max Cap: 1.25 / mo
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.05"
                      min="0.25"
                      max={isEL && isMonth ? 1.25 : 365}
                      required
                      value={manualLeaveForm.days}
                      onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, days: parseFloat(e.target.value) || 0 })}
                      className={`w-full p-2 border rounded-lg font-mono font-bold ${
                        isOverCap ? 'border-rose-500 text-rose-700 bg-rose-50' : 'text-sky-700'
                      }`}
                    />
                    {isOverCap ? (
                      <span className="text-[11px] text-rose-600 font-bold mt-1 block">
                        ⚠ Warning: Statutory limit is 1.25 Earned Leave per month. Cannot add more than 1.25.
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        {isEL && isMonth
                          ? 'Earned Leave statutory cap: strictly 1.25 days per month'
                          : manualLeaveForm.cadence === 'year' ? 'Annual quota credit' : 'Monthly quota credit'}
                      </span>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Reason / Reference Note</label>
                <input
                  type="text"
                  required
                  value={manualLeaveForm.reason}
                  onChange={(e) => setManualLeaveForm({ ...manualLeaveForm, reason: e.target.value })}
                  placeholder="e.g. Monthly Earned Leave Accrual"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowManualLeaveModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Confirm Credit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE OR DEDUCT LEAVE */}
      {showDeleteLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                  <Trash2 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Delete or Deduct Leave Balances
                  </h3>
                  <p className="text-xs text-slate-500">Master reset or manual employee leave deduction</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteLeaveModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleDeleteOrDeductLeave} className="space-y-3 text-xs">
              {/* Action Type */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Action Type *</label>
                <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-50 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setDeleteLeaveForm({ ...deleteLeaveForm, action_type: 'deduct_days' })}
                    className={`py-1.5 px-3 rounded-md text-xs font-bold text-center transition-all ${
                      deleteLeaveForm.action_type === 'deduct_days'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Deduct Days
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteLeaveForm({ ...deleteLeaveForm, action_type: 'reset_zero' })}
                    className={`py-1.5 px-3 rounded-md text-xs font-bold text-center transition-all ${
                      deleteLeaveForm.action_type === 'reset_zero'
                        ? 'bg-rose-700 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Master Reset to 0
                  </button>
                </div>
              </div>

              {/* Leave Type */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Leave Type *</label>
                <select
                  required
                  value={deleteLeaveForm.leave_type_id}
                  onChange={(e) => setDeleteLeaveForm({ ...deleteLeaveForm, leave_type_id: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white font-medium"
                >
                  <option value="">Select Leave Type...</option>
                  {leaveTypes.filter(lt => !lt.name.toLowerCase().includes('paid leave')).map(lt => (
                    <option key={lt.id} value={lt.id}>{lt.name} ({lt.code})</option>
                  ))}
                </select>
              </div>

              {/* Target Beneficiaries */}
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Target Scope</label>
                <div className="flex gap-4 p-2 bg-slate-50 rounded-lg border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delete_target"
                      checked={deleteLeaveForm.target_type === 'all'}
                      onChange={() => setDeleteLeaveForm({ ...deleteLeaveForm, target_type: 'all', employee_id: '' })}
                      className="text-rose-600"
                    />
                    <span className="font-medium text-slate-800">All Company Staff ({employees.length})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="delete_target"
                      checked={deleteLeaveForm.target_type === 'single'}
                      onChange={() => setDeleteLeaveForm({ ...deleteLeaveForm, target_type: 'single' })}
                      className="text-rose-600"
                    />
                    <span className="font-medium text-slate-800">Specific Employee</span>
                  </label>
                </div>
              </div>

              {deleteLeaveForm.target_type === 'single' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Select Employee *</label>
                  <select
                    required={deleteLeaveForm.target_type === 'single'}
                    value={deleteLeaveForm.employee_id}
                    onChange={(e) => setDeleteLeaveForm({ ...deleteLeaveForm, employee_id: e.target.value })}
                    className="w-full p-2 border rounded-lg bg-white"
                  >
                    <option value="">Select an employee...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_id}) - {emp.department}</option>
                    ))}
                  </select>
                </div>
              )}

              {deleteLeaveForm.action_type === 'deduct_days' && (
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Days to Deduct / Delete *</label>
                  <input
                    type="number"
                    step="0.25"
                    min="0.25"
                    max="365"
                    required
                    value={deleteLeaveForm.days}
                    onChange={(e) => setDeleteLeaveForm({ ...deleteLeaveForm, days: parseFloat(e.target.value) || 0 })}
                    className="w-full p-2 border rounded-lg font-mono font-bold text-rose-700"
                  />
                  <span className="text-[10px] text-slate-400">Balance will be reduced (minimum 0)</span>
                </div>
              )}

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Mandatory Audit Reason *</label>
                <input
                  type="text"
                  required
                  value={deleteLeaveForm.reason}
                  onChange={(e) => setDeleteLeaveForm({ ...deleteLeaveForm, reason: e.target.value })}
                  placeholder="e.g. Annual balance reset / Administrative deduction"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-[11px] font-medium">
                {deleteLeaveForm.action_type === 'reset_zero' ? (
                  <span>⚠ Warning: This will reset {deleteLeaveForm.target_type === 'all' ? `all ${employees.length} employees'` : "this employee's"} selected leave balance to <strong>0 days</strong> immediately.</span>
                ) : (
                  <span>⚠ Notice: This will deduct <strong>{deleteLeaveForm.days} days</strong> from {deleteLeaveForm.target_type === 'all' ? `all ${employees.length} employees'` : "this employee's"} balance.</span>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDeleteLeaveModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deleteLeaveSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl font-bold shadow-sm transition-all flex items-center gap-1.5"
                >
                  {deleteLeaveSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{deleteLeaveForm.action_type === 'reset_zero' ? 'Confirm Reset to 0' : 'Confirm Deduction'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD GEOFENCE */}
      {showGeofenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Add Office Geofence Location
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGeofenceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateGeofence} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Office / Location Name *</label>
                <input
                  type="text"
                  required
                  value={geofenceForm.location_name}
                  onChange={(e) => setGeofenceForm({ ...geofenceForm, location_name: e.target.value })}
                  placeholder="e.g. Headquarters Campus, Warehouse A"
                  className="w-full p-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700">GPS Coordinates *</span>
                  <button
                    type="button"
                    onClick={() => handleGetGpsLocation(false)}
                    disabled={locatingGps}
                    className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <LocateFixed className={`w-3 h-3 ${locatingGps ? 'animate-spin' : ''}`} />
                    <span>{locatingGps ? 'Locating...' : 'Use Current Location'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={geofenceForm.latitude}
                      onChange={(e) => setGeofenceForm({ ...geofenceForm, latitude: parseFloat(e.target.value) })}
                      placeholder="Latitude"
                      className="w-full p-2 border rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={geofenceForm.longitude}
                      onChange={(e) => setGeofenceForm({ ...geofenceForm, longitude: parseFloat(e.target.value) })}
                      placeholder="Longitude"
                      className="w-full p-2 border rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Permitted Radius in Meters *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    required
                    value={geofenceForm.radius}
                    onChange={(e) => setGeofenceForm({ ...geofenceForm, radius: parseFloat(e.target.value) })}
                    className="w-full p-2 pr-16 border rounded-lg font-bold text-sky-700 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-[11px]">meters</span>
                </div>
                <span className="text-[10px] text-slate-400">Attendance punch is strictly blocked if employee is outside this distance</span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowGeofenceModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Save Office Geofence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT GEOFENCE */}
      {showEditGeofenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-sky-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Edit Office Geofence
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEditGeofenceModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateGeofence} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Office / Location Name *</label>
                <input
                  type="text"
                  required
                  value={editGeofenceForm.location_name}
                  onChange={(e) => setEditGeofenceForm({ ...editGeofenceForm, location_name: e.target.value })}
                  placeholder="e.g. Headquarters Campus, Branch 2"
                  className="w-full p-2 border rounded-lg focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-slate-700">GPS Coordinates *</span>
                  <button
                    type="button"
                    onClick={() => handleGetGpsLocation(true)}
                    disabled={locatingGps}
                    className="text-[11px] text-sky-600 hover:text-sky-700 font-semibold flex items-center gap-1 hover:underline"
                  >
                    <LocateFixed className={`w-3 h-3 ${locatingGps ? 'animate-spin' : ''}`} />
                    <span>{locatingGps ? 'Locating...' : 'Use Current Location'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editGeofenceForm.latitude}
                      onChange={(e) => setEditGeofenceForm({ ...editGeofenceForm, latitude: parseFloat(e.target.value) })}
                      placeholder="Latitude"
                      className="w-full p-2 border rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      step="any"
                      required
                      value={editGeofenceForm.longitude}
                      onChange={(e) => setEditGeofenceForm({ ...editGeofenceForm, longitude: parseFloat(e.target.value) })}
                      placeholder="Longitude"
                      className="w-full p-2 border rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Permitted Radius in Meters *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="10"
                    max="10000"
                    required
                    value={editGeofenceForm.radius}
                    onChange={(e) => setEditGeofenceForm({ ...editGeofenceForm, radius: parseFloat(e.target.value) })}
                    className="w-full p-2 pr-16 border rounded-lg font-bold text-sky-700 font-mono"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-[11px]">meters</span>
                </div>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Status</label>
                <select
                  value={editGeofenceForm.status}
                  onChange={(e) => setEditGeofenceForm({ ...editGeofenceForm, status: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-white"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditGeofenceModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm transition-all"
                >
                  Update Office Geofence
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD SHIFT */}
      {showShiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Create Work Shift
            </h3>

            <form onSubmit={handleCreateShift} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Shift Name *</label>
                <input
                  type="text"
                  required
                  value={shiftForm.name}
                  onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })}
                  placeholder="e.g. Afternoon Shift"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Start Time *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">End Time *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.end_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                    className="w-full p-2 border rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Grace Time (Mins)</label>
                  <input
                    type="number"
                    value={shiftForm.grace_time_mins}
                    onChange={(e) => setShiftForm({ ...shiftForm, grace_time_mins: parseInt(e.target.value, 10) })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700 block mb-1">Working Hours</label>
                  <input
                    type="number"
                    step="0.5"
                    value={shiftForm.working_hours}
                    onChange={(e) => setShiftForm({ ...shiftForm, working_hours: parseFloat(e.target.value) })}
                    className="w-full p-2 border rounded-lg"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowShiftModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD HOLIDAY */}
      {showHolidayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900 border-b border-slate-100 pb-2">
              Add Official Holiday
            </h3>

            <form onSubmit={handleCreateHoliday} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  value={holidayForm.name}
                  onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })}
                  placeholder="e.g. Diwali"
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={holidayForm.holiday_date}
                  onChange={(e) => setHolidayForm({ ...holidayForm, holiday_date: e.target.value })}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="optional-hol"
                  checked={holidayForm.is_optional}
                  onChange={(e) => setHolidayForm({ ...holidayForm, is_optional: e.target.checked })}
                  className="rounded text-sky-600"
                />
                <label htmlFor="optional-hol" className="text-xs text-slate-700 font-medium cursor-pointer">
                  Optional / Restricted Holiday
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHolidayModal(false)}
                  className="px-4 py-2 text-slate-600 hover:text-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-medium shadow-sm"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TICKET CONVERSATION / CHAT MODAL */}
      <TicketChatModal
        ticketId={chatTicketId}
        isOpen={showChatModal}
        onClose={() => {
          setShowChatModal(false);
          setChatTicketId(null);
        }}
        currentUser={user}
        onStatusUpdated={fetchData}
      />

      {/* EXCEL IMPORT / UPDATE MODAL */}
      <ExcelImportModal
        isOpen={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        onSuccess={() => {
          setSuccess('Excel data processed and employee records updated successfully.');
          fetchData();
        }}
      />

      {/* EMPLOYEE CHANGE PASSWORD MODAL */}
      <EmployeeChangePasswordModal
        isOpen={showPasswordModal}
        onClose={() => {
          setShowPasswordModal(false);
          setSelectedEmployeeForPassword(null);
        }}
        employee={selectedEmployeeForPassword}
        onSuccess={() => {
          setSuccess('Employee password reset successfully.');
          fetchData();
        }}
      />
    </div>
  );
}
