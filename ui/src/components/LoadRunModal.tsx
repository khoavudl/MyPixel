import React, { useEffect, useState } from 'react';
import {
  FolderOpen,
  X,
  Search,
  Layers,
  AlertTriangle,
  ArrowRight,
  Loader2,
  FileText,
  Clock,
  Trash2,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { PastRunSummary, RunStatusResponse, DefectBox } from '../types';

interface LoadRunModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoadRunModal: React.FC<LoadRunModalProps> = ({ isOpen, onClose }) => {
  const {
    setRunId,
    setRunStatus,
    setAnnotations,
    setTargetSizeMm,
    setViewMode,
    setInspectionType,
  } = useInspectionStore();

  const [runs, setRuns] = useState<PastRunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchRuns = async () => {
      setLoading(true);
      setErrorMsg(null);
      try {
        const res = await fetch('/api/runs');
        if (!res.ok) throw new Error('Failed to load runs list');
        const data: PastRunSummary[] = await res.json();
        setRuns(data);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchRuns();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectRun = async (run: PastRunSummary) => {
    setLoadingRunId(run.run_id);
    try {
      // 1. Fetch Run Status (with static image URLs & report)
      const statusRes = await fetch(`/api/runs/${run.run_id}`);
      if (!statusRes.ok) throw new Error('Failed to load run details');
      const statusData: RunStatusResponse = await statusRes.json();

      // 2. Fetch saved annotations
      const annRes = await fetch(`/api/runs/${run.run_id}/annotations`);
      const annData: DefectBox[] = annRes.ok ? await annRes.json() : [];

      // 3. Populate Inspection Store
      const isSingle =
        run.run_type === 'single' ||
        statusData.report?.mode === 'single' ||
        statusData.report?.run_type === 'single';

      setInspectionType(isSingle ? 'single' : 'compare');
      setRunId(run.run_id);
      setRunStatus(statusData);
      setAnnotations(annData);

      if (run.target_size_mm && run.target_size_mm.length === 2) {
        setTargetSizeMm(`${run.target_size_mm[0]}x${run.target_size_mm[1]}`);
      }

      // 4. Jump straight to workspace
      setViewMode('workspace');
      onClose();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error opening inspection session');
    } finally {
      setLoadingRunId(null);
    }
  };

  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const handleDeleteRun = async (run: PastRunSummary) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete session "${run.run_id}"?\nThis folder will be moved to the Trash.`
    );
    if (!confirmed) return;

    setDeletingRunId(run.run_id);
    try {
      const res = await fetch(`/api/runs/${run.run_id}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete run');
      }
      setRuns((prev) => prev.filter((r) => r.run_id !== run.run_id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting run');
    } finally {
      setDeletingRunId(null);
    }
  };

  const filteredRuns = runs.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchId = r.run_id.toLowerCase().includes(q);
    const matchBrand = (r.brand_filename || '').toLowerCase().includes(q);
    const matchVendor = (r.vendor_filename || '').toLowerCase().includes(q);
    const matchStatus = r.status.toLowerCase().includes(q);
    return matchId || matchBrand || matchVendor || matchStatus;
  });

  const formatTimestamp = (iso?: string | null) => {
    if (!iso) return '-';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-US', {
        dateStyle: 'short',
        timeStyle: 'medium',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Load Historical Run
              </h2>
              <p className="text-xs text-slate-400">
                Select a saved run to enter the inspection workspace
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Counter Bar */}
        <div className="px-6 py-3.5 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between gap-4">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by run ID, PDF name, or status..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <span className="text-xs font-mono text-slate-500 shrink-0">
            {filteredRuns.length} / {runs.length} runs
          </span>
        </div>

        {/* Body: Run List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading ? (
            <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
              <span className="text-xs font-medium">Scanning runs from out/ folder...</span>
            </div>
          ) : errorMsg ? (
            <div className="py-12 flex flex-col items-center justify-center text-red-400 gap-2">
              <AlertTriangle className="w-8 h-8 text-red-500" />
              <span className="text-xs font-semibold">{errorMsg}</span>
            </div>
          ) : filteredRuns.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm font-semibold">No matching runs found</p>
              <p className="text-xs mt-1">Completed inspection runs will automatically appear here.</p>
            </div>
          ) : (
            filteredRuns.map((r) => {
              const isSelectedLoading = loadingRunId === r.run_id;
              const isDeleting = deletingRunId === r.run_id;

              return (
                <div
                  key={r.run_id}
                  className="bg-slate-950/70 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:bg-slate-950"
                >
                  {/* Left: Metadata */}
                  <div className="min-w-0 flex-1">
                    {/* Line 1: Run Name, Run Type, Defect Count */}
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-400">
                        {r.run_id}
                      </span>

                      {/* Run Type Badge */}
                      {r.run_type === 'single' ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          Single
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          Compare
                        </span>
                      )}

                      {/* Annotations Count */}
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium flex items-center gap-1 ${
                          r.annotations_count > 0
                            ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300 font-semibold'
                            : 'bg-slate-900 border border-slate-800 text-slate-400'
                        }`}
                      >
                        <Layers className="w-3 h-3" /> {r.annotations_count} {r.annotations_count === 1 ? 'defect' : 'defects'}
                      </span>
                    </div>

                    {/* Files & Timestamp */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-slate-300 mt-2">
                      {r.run_type === 'single' ? (
                        <div className="flex items-center gap-1 truncate">
                          <span className="text-slate-500 font-medium">Artwork:</span>
                          <span className="font-medium text-slate-200 truncate">
                            {r.brand_filename || 'Artwork'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 truncate">
                          <span className="text-slate-500 font-medium">Old:</span>
                          <span className="font-medium text-slate-200 truncate">
                            {r.brand_filename || 'brand.pdf'}
                          </span>
                          <span className="text-slate-600 mx-1">vs</span>
                          <span className="text-slate-500 font-medium">New:</span>
                          <span className="font-medium text-slate-200 truncate">
                            {r.vendor_filename || 'vendor.pdf'}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {formatTimestamp(r.timestamp_utc)}
                      </span>
                      {!r.has_images && (
                        <span className="text-amber-500 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> (No result images)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={isDeleting || isSelectedLoading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRun(r);
                      }}
                      title="Delete run (Move to Trash)"
                      className="px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isDeleting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Deleting...</span>
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => handleSelectRun(r)}
                      disabled={isSelectedLoading || isDeleting}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      {isSelectedLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Opening...</span>
                        </>
                      ) : (
                        <>
                          <span>Open Session</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
          <span>Data loaded directly from local <code>out/</code> directory</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium cursor-pointer transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
