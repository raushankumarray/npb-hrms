import React, { useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle, AlertTriangle, X, RefreshCw, ArrowRight } from 'lucide-react';
import { apiRequest } from '../api';

export default function ExcelImportModal({ isOpen, onClose, onSuccess, mode = 'import', allowDiff = true }) {
  // mode: 'import' (create batch) or 'diff-update' (preview old vs new)
  const [file, setFile] = useState(null);
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [diffResult, setDiffResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(allowDiff ? mode : 'import'); // 'import' or 'diff-update'

  if (!isOpen) return null;

  const downloadTemplate = async () => {
    try {
      const res = await apiRequest('/employees/excel/template');
      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'NPB_Employee_Master_Template.xlsx';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (err) {
      setError('Failed to download template: ' + err.message);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError('');
      setValidationResult(null);
      setDiffResult(null);
    }
  };

  const handleValidate = async () => {
    if (!file) {
      setError('Please select an Excel (.xlsx) file first.');
      return;
    }

    setValidating(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      if (activeTab === 'import') {
        const res = await apiRequest('/employees/excel/import-validate', {
          method: 'POST',
          body: formData
        });
        setValidationResult(res);
      } else {
        const res = await apiRequest('/employees/excel/diff-preview', {
          method: 'POST',
          body: formData
        });
        setDiffResult(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleCommitImport = async () => {
    if (!validationResult || !validationResult.validRecords || validationResult.validRecords.length === 0) {
      setError('No valid records to commit.');
      return;
    }

    setCommitting(true);
    setError('');

    try {
      await apiRequest('/employees/excel/import-commit', {
        method: 'POST',
        body: { validRecords: validationResult.validRecords }
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCommitting(false);
    }
  };

  const handleCommitDiff = async () => {
    if (!diffResult || !diffResult.diffs || diffResult.diffs.length === 0) {
      setError('No changes detected to commit.');
      return;
    }

    setCommitting(true);
    setError('');

    try {
      await apiRequest('/employees/excel/diff-commit', {
        method: 'POST',
        body: { diffs: diffResult.diffs }
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-none max-w-3xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 uppercase tracking-wide">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Employee Excel Engine
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {allowDiff
                ? 'Strictly validated master data upload and differential updates'
                : 'Batch upload and add new team employees via Excel'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-none text-slate-400 hover:text-slate-600 hover:bg-slate-100 border border-transparent"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher - only when differential update is permitted */}
        {allowDiff && (
          <div className="flex bg-slate-100 p-1 rounded-none border border-slate-200">
            <button
              type="button"
              onClick={() => { setActiveTab('import'); setValidationResult(null); setDiffResult(null); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-none transition-all ${
                activeTab === 'import' ? 'bg-white text-slate-900 shadow-xs border border-slate-300' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Import / Create Employees
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('diff-update'); setValidationResult(null); setDiffResult(null); setError(''); }}
              className={`flex-1 py-2 text-xs font-bold rounded-none transition-all ${
                activeTab === 'diff-update' ? 'bg-white text-slate-900 shadow-xs border border-slate-300' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Diff Update Existing (Match ID)
            </button>
          </div>
        )}

        {/* Template Format Guidance Box in Square Styling */}
        <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-none text-xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-bold text-sky-900 flex items-center gap-1.5 uppercase text-[11px] tracking-wide">
              <FileSpreadsheet className="w-3.5 h-3.5 text-sky-600" />
              Template Column Specifications
            </span>
            <span className="text-[10px] text-sky-700 font-semibold bg-white border border-sky-200 px-2 py-0.5 rounded-none">
              4 Mandatory Fields
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-700 text-[11px] pt-1">
            <div className="bg-white p-2 border border-sky-100 rounded-none">
              <span className="font-bold text-rose-600 block mb-0.5">Mandatory Columns:</span>
              <p className="font-mono text-slate-800 font-semibold">
                Full Name *, Username *, Password *, Role *
              </p>
              <span className="text-[10px] text-slate-500">Role accepts "Employee" or "Manager".</span>
            </div>
            <div className="bg-white p-2 border border-sky-100 rounded-none">
              <span className="font-bold text-slate-700 block mb-0.5">Optional Columns:</span>
              <p className="font-mono text-slate-600">
                Employee ID, Department, Designation, Mobile, Email, City, Shift, Reports To, Status
              </p>
              <span className="text-[10px] text-slate-500">Leave Employee ID blank to assign later.</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-none flex items-center gap-2 text-xs text-rose-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* File Upload Box */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">1. Select Excel File</span>
            <button
              type="button"
              onClick={downloadTemplate}
              className="text-xs text-sky-700 hover:text-sky-800 font-bold flex items-center gap-1 bg-sky-50 px-2.5 py-1 border border-sky-200 rounded-none transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Download Template (.xlsx)
            </button>
          </div>

          <div className="border-2 border-dashed border-slate-300 hover:border-sky-500 rounded-none p-6 text-center transition-colors bg-slate-50/50">
            <input
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              id="excel-file-input"
              className="hidden"
            />
            <label htmlFor="excel-file-input" className="cursor-pointer space-y-2 block">
              <Upload className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-medium text-slate-700">
                {file ? file.name : 'Click to select or drag and drop your Excel file'}
              </p>
              <p className="text-xs text-slate-400">Microsoft Excel (.xlsx)</p>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleValidate}
              disabled={!file || validating}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-none text-xs font-bold flex items-center gap-2 disabled:opacity-50 border border-slate-900 shadow-xs"
            >
              {validating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Validating Data...</span>
                </>
              ) : (
                <>
                  <span>Validate & Preview</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Import Validation Preview */}
        {activeTab === 'import' && validationResult && (
          <div className="flex-1 overflow-y-auto space-y-3 border-t border-slate-200 pt-3 custom-scrollbar">
            <div className="grid grid-cols-4 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-none text-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Total Rows</span>
                <p className="text-lg font-bold text-slate-800">{validationResult.summary.totalRows}</p>
              </div>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-none text-center">
                <span className="text-[10px] text-emerald-600 uppercase font-bold">Valid</span>
                <p className="text-lg font-bold text-emerald-700">{validationResult.summary.validRows}</p>
              </div>
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-none text-center">
                <span className="text-[10px] text-rose-600 uppercase font-bold">Errors</span>
                <p className="text-lg font-bold text-rose-700">{validationResult.summary.invalidRows}</p>
              </div>
              <div className="p-3 bg-sky-50 border border-sky-200 rounded-none text-center">
                <span className="text-[10px] text-sky-600 uppercase font-bold">New Records</span>
                <p className="text-lg font-bold text-sky-700">{validationResult.summary.newEmployees}</p>
              </div>
            </div>

            {validationResult.errors.length > 0 && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-none max-h-36 overflow-y-auto">
                <span className="text-xs font-bold text-rose-800 block mb-1 uppercase tracking-wide">Validation Errors Found:</span>
                <ul className="text-xs text-rose-700 space-y-1 list-disc pl-4 font-mono">
                  {validationResult.errors.map((e, i) => (
                    <li key={i}>
                      Row {e.row} ({e.employeeId || 'No ID'}): {e.errors.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Diff Update Preview */}
        {activeTab === 'diff-update' && diffResult && (
          <div className="flex-1 overflow-y-auto space-y-3 border-t border-slate-200 pt-3 custom-scrollbar">
            <div className="grid grid-cols-3 gap-2">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-none text-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Matched Rows</span>
                <p className="text-lg font-bold text-slate-800">{diffResult.totalRows}</p>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-none text-center">
                <span className="text-[10px] text-amber-600 uppercase font-bold">Changes Detected</span>
                <p className="text-lg font-bold text-amber-700">{diffResult.changedCount}</p>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-none text-center">
                <span className="text-[10px] text-slate-500 uppercase font-bold">Unchanged</span>
                <p className="text-lg font-bold text-slate-600">{diffResult.unchangedCount}</p>
              </div>
            </div>

            {diffResult.diffs.length > 0 && (
              <div className="border border-slate-200 rounded-none overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2">Employee</th>
                      <th className="p-2">Field</th>
                      <th className="p-2 text-rose-600">Old Value</th>
                      <th className="p-2 text-emerald-600">New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {diffResult.diffs.map((d) => (
                      d.changes.map((c, i) => (
                        <tr key={`${d.id}-${i}`} className="hover:bg-slate-50/50">
                          <td className="p-2 font-medium">{d.fullName} ({d.employeeId})</td>
                          <td className="p-2 text-slate-600">{c.field}</td>
                          <td className="p-2 text-rose-600 bg-rose-50/30">{c.oldValue}</td>
                          <td className="p-2 text-emerald-600 font-medium bg-emerald-50/30">{c.newValue}</td>
                        </tr>
                      ))
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-400">
            Database transactions ensure zero partial writes
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-300 rounded-none"
            >
              Cancel
            </button>
            {activeTab === 'import' ? (
              <button
                type="button"
                onClick={handleCommitImport}
                disabled={!validationResult || validationResult.summary.validRows === 0 || committing}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-none text-xs font-bold flex items-center gap-2 shadow-xs border border-emerald-700 disabled:opacity-50"
              >
                {committing ? 'Writing to DB...' : `Commit Import (${validationResult ? validationResult.summary.validRows : 0} Rows)`}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCommitDiff}
                disabled={!diffResult || diffResult.changedCount === 0 || committing}
                className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-none text-xs font-bold flex items-center gap-2 shadow-xs border border-sky-700 disabled:opacity-50"
              >
                {committing ? 'Updating Records...' : `Apply Diff Updates (${diffResult ? diffResult.changedCount : 0})`}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
