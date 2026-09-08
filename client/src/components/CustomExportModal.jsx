import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileText, CheckSquare, Square, X, AlertCircle } from 'lucide-react';
import { apiRequest } from '../api';

const ALL_EXPORT_COLUMNS = [
  'Employee Name',
  'Employee ID',
  'Company',
  'Department',
  'Designation',
  'Manager Name',
  'Date',
  'Punch In',
  'Punch Out',
  'Location Name',
  'Latitude',
  'Longitude',
  'GPS Accuracy',
  'Attendance Status',
  'Total Working Hours',
  'Shift',
  'Remarks'
];

export default function CustomExportModal({ isOpen, onClose, filters = {} }) {
  const [selectedColumns, setSelectedColumns] = useState([
    'Employee Name', 'Employee ID', 'Department', 'Date',
    'Punch In', 'Punch Out', 'Attendance Status', 'Total Working Hours'
  ]);
  const [format, setFormat] = useState('xlsx'); // 'xlsx' or 'pdf'
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const toggleColumn = (col) => {
    if (selectedColumns.includes(col)) {
      if (selectedColumns.length === 1) {
        setError('At least one column must be selected.');
        return;
      }
      setSelectedColumns(selectedColumns.filter(c => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
    setError('');
  };

  const selectAll = () => {
    setSelectedColumns([...ALL_EXPORT_COLUMNS]);
    setError('');
  };

  const deselectAll = () => {
    setSelectedColumns(['Employee Name', 'Date', 'Attendance Status']);
    setError('');
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      setError('Please select at least one column.');
      return;
    }

    setDownloading(true);
    setError('');

    try {
      const res = await apiRequest('/reports/export', {
        method: 'POST',
        body: {
          format,
          selected_columns: selectedColumns,
          ...filters
        }
      });

      if (res.isBlob) {
        const url = window.URL.createObjectURL(res.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `HRMS_Attendance_Report_${Date.now()}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        onClose();
      } else if (res.isHtmlReport) {
        // Open printable landscape HTML report in new tab for direct PDF printing
        const reportWindow = window.open('', '_blank');
        reportWindow.document.write(res.htmlText);
        reportWindow.document.close();
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Export failed.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-sky-600" />
              Custom Export Builder
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Select exactly which columns to include in your exported report
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-2 text-xs text-rose-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Format Selector */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
            Export Format
          </label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setFormat('xlsx')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                format === 'xlsx'
                  ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700 ring-2 ring-emerald-500/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
              Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-medium transition-all ${
                format === 'pdf'
                  ? 'border-sky-600 bg-sky-50/50 text-sky-700 ring-2 ring-sky-500/20'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <FileText className="w-5 h-5 text-sky-600" />
              Printable PDF (Landscape)
            </button>
          </div>
        </div>

        {/* Column Checklist */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              Select Columns ({selectedColumns.length}/{ALL_EXPORT_COLUMNS.length})
            </label>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectAll}
                className="text-sky-600 hover:text-sky-700 font-medium"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-slate-500 hover:text-slate-700 font-medium"
              >
                Reset Default
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-56 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 custom-scrollbar">
            {ALL_EXPORT_COLUMNS.map((col) => {
              const isSelected = selectedColumns.includes(col);
              return (
                <button
                  key={col}
                  type="button"
                  onClick={() => toggleColumn(col)}
                  className={`flex items-center gap-2 p-2 rounded-lg text-xs text-left transition-colors ${
                    isSelected
                      ? 'bg-white text-slate-900 font-medium shadow-sm border border-slate-200'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-sky-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <span className="truncate">{col}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <span className="text-xs text-slate-400">
            Export actions are audited to database
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={downloading}
              className="px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-sm font-medium flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {downloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download {format.toUpperCase()}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
