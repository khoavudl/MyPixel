import React, { useState } from 'react';
import { FileDown, X, CheckCircle, Loader2, FileText, Check } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose }) => {
  const { runId } = useInspectionStore();

  const [inspectorName, setInspectorName] = useState('');
  const [format, setFormat] = useState<'docx' | 'pdf' | 'both'>('docx');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const downloadSingleFormat = async (fmt: 'docx' | 'pdf') => {
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        run_id: runId,
        format: fmt,
        inspector_name: inspectorName.trim() || undefined,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to export ${fmt.toUpperCase()}`);
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report_${runId}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleExport = async () => {
    if (!runId) return;
    setIsExporting(true);
    setErrorMessage(null);

    try {
      if (format === 'both') {
        await downloadSingleFormat('docx');
        await new Promise((resolve) => setTimeout(resolve, 400));
        await downloadSingleFormat('pdf');
      } else {
        await downloadSingleFormat(format);
      }

      setExportSuccess(true);
      setTimeout(() => {
        setExportSuccess(false);
        onClose();
      }, 1200);
    } catch (err) {
      console.error('Export error:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FileDown className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-tight">Export Artwork Report</h3>
              <p className="text-xs text-slate-400">Word document or Print-ready PDF</p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inspector Name Field */}
        <div className="mb-5">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Inspector / Prepared By
          </label>
          <input
            type="text"
            value={inspectorName}
            onChange={(e) => setInspectorName(e.target.value)}
            placeholder="e.g. Alex Nguyen, QC Dept"
            disabled={isExporting}
            className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Format Selection Cards */}
        <div className="mb-6">
          <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
            Export Format
          </label>
          <div className="grid grid-cols-3 gap-2.5">
            {/* DOCX Option */}
            <button
              type="button"
              onClick={() => setFormat('docx')}
              disabled={isExporting}
              className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                format === 'docx'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <FileText className="w-4 h-4" />
                <span className="text-xs font-bold text-white">DOCX</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium leading-tight">
                Editable Word
              </span>
            </button>

            {/* PDF Option */}
            <button
              type="button"
              onClick={() => setFormat('pdf')}
              disabled={isExporting}
              className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                format === 'pdf'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <FileDown className="w-4 h-4" />
                <span className="text-xs font-bold text-white">PDF</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium leading-tight">
                Print-ready
              </span>
            </button>

            {/* Both Option */}
            <button
              type="button"
              onClick={() => setFormat('both')}
              disabled={isExporting}
              className={`p-3 rounded-xl border flex flex-col items-center text-center transition-all cursor-pointer ${
                format === 'both'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400 shadow-md shadow-blue-500/10'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-1 mb-1">
                <Check className="w-4 h-4" />
                <span className="text-xs font-bold text-white">Both</span>
              </div>
              <span className="text-[10px] text-slate-400 font-medium leading-tight">
                DOCX & PDF
              </span>
            </button>
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mb-4 p-2.5 rounded-xl bg-red-950/50 border border-red-800/80 text-red-300 text-xs text-center font-medium">
            {errorMessage}
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting || exportSuccess}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all shadow-lg ${
              exportSuccess
                ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25 cursor-pointer hover:scale-[1.02]'
            }`}
          >
            {isExporting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : exportSuccess ? (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Downloaded!</span>
              </>
            ) : (
              <>
                <FileDown className="w-4 h-4" />
                <span>Export Report</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
