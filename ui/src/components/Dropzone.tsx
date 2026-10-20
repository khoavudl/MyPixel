import React, { useRef, useState, useEffect } from 'react';
import {
  FileUp,
  FileCheck,
  Play,
  Sparkles,
  FolderOpen,
  Layers,
  ScanSearch,
  AlertTriangle,
  Loader2,
  Clock,
  Search,
  RefreshCw,
  Crop,
  Maximize,
  Sliders,
  Trash2,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { DefectBox, PastRunSummary, RunStatusResponse } from '../types';

export const Dropzone: React.FC = () => {
  const {
    activeMainTab,
    setActiveMainTab,
    setInspectionType,

    // Function 2 state
    brandFile,
    vendorFile,
    targetSizeMm,
    brandPage,
    vendorPage,
    compareCropMode,
    setBrandFile,
    setVendorFile,
    setTargetSizeMm,
    setBrandPage,
    setVendorPage,
    setCompareCropMode,
    setManualAlignData,

    // Function 3 state
    singleFile,
    singlePage,
    singleTargetSizeMm,
    singleCropMode,
    setSingleFile,
    setSinglePage,
    setSingleTargetSizeMm,
    setSingleCropMode,

    setRunId,
    setIsAnalyzing,
    clearLogs,
    setViewMode,
    setRunStatus,
    setAnnotations,
  } = useInspectionStore();

  const [isDraggingBrand, setIsDraggingBrand] = useState(false);
  const [isDraggingVendor, setIsDraggingVendor] = useState(false);
  const [isDraggingSingle, setIsDraggingSingle] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Past runs state (Function 1)
  const [pastRuns, setPastRuns] = useState<PastRunSummary[]>([]);
  const [pastLoading, setPastLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'compare' | 'single'>('all');

  const brandInputRef = useRef<HTMLInputElement>(null);
  const vendorInputRef = useRef<HTMLInputElement>(null);
  const singleInputRef = useRef<HTMLInputElement>(null);

  // Auto fetch past runs when switching to history tab
  const fetchPastRuns = async () => {
    setPastLoading(true);
    try {
      const res = await fetch('/api/runs');
      if (res.ok) {
        const data: PastRunSummary[] = await res.json();
        setPastRuns(data);
      }
    } catch {
      // Ignore background errors
    } finally {
      setPastLoading(false);
    }
  };

  useEffect(() => {
    if (activeMainTab === 'history') {
      fetchPastRuns();
    }
  }, [activeMainTab]);

  // Load an existing past run into workspace
  const handleLoadPastRun = async (run: PastRunSummary) => {
    setLoadingRunId(run.run_id);
    try {
      const statusRes = await fetch(`/api/runs/${run.run_id}`);
      if (!statusRes.ok) throw new Error('Failed to load run details');
      const statusData: RunStatusResponse = await statusRes.json();

      const annRes = await fetch(`/api/runs/${run.run_id}/annotations`);
      const annData: DefectBox[] = annRes.ok ? await annRes.json() : [];

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

      setViewMode('workspace');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error opening inspection session');
    } finally {
      setLoadingRunId(null);
    }
  };

  // Delete run and move to Recycle Bin
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  const handleDeletePastRun = async (run: PastRunSummary) => {
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
      setPastRuns((prev) => prev.filter((r) => r.run_id !== run.run_id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting run');
    } finally {
      setDeletingRunId(null);
    }
  };

  const handleDeleteAllPastRuns = async () => {
    if (pastRuns.length === 0) return;
    const confirmed = window.confirm(
      `Are you sure you want to delete ALL historical runs (${pastRuns.length} sessions)?\nAll session folders will be moved to the Trash.`
    );
    if (!confirmed) return;

    setIsDeletingAll(true);
    try {
      const res = await fetch('/api/runs', {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to delete all runs');
      }
      setPastRuns([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error deleting all runs');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Function 2: Start 2-file compare
  const handleStartAnalysis = async () => {
    if (!brandFile || !vendorFile) {
      setErrorMsg('Please select both Old Version and New Version PDF files.');
      return;
    }
    if (compareCropMode === 'auto' && !targetSizeMm.trim()) {
      setErrorMsg('Please enter target trim size WxH mm (e.g. 620x250) or switch to Full Page Sheet mode.');
      return;
    }

    if (compareCropMode === 'manual') {
      setErrorMsg(null);
      setIsAnalyzing(true);
      const formData = new FormData();
      formData.append('brand_file', brandFile);
      formData.append('vendor_file', vendorFile);
      formData.append('brand_page', brandPage.toString());
      formData.append('vendor_page', vendorPage.toString());

      try {
        const res = await fetch('/api/manual_align/prepare', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || 'Failed to initialize manual alignment session');
        }

        const data = await res.json();
        setManualAlignData(data);
        setRunId(data.run_id);
        setInspectionType('compare');
        setIsAnalyzing(false);
        setViewMode('manual_align');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        setIsAnalyzing(false);
      }
      return;
    }

    setErrorMsg(null);
    clearLogs();
    setIsAnalyzing(true);
    setInspectionType('compare');
    setViewMode('console');

    const formData = new FormData();
    formData.append('brand_file', brandFile);
    formData.append('vendor_file', vendorFile);
    formData.append('target_size_mm', compareCropMode === 'auto' ? targetSizeMm : '');
    formData.append('crop_mode', compareCropMode);
    formData.append('brand_page', brandPage.toString());
    formData.append('vendor_page', vendorPage.toString());

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to start analysis');
      }

      const data = await res.json();
      setRunId(data.run_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsAnalyzing(false);
      setViewMode('setup');
    }
  };

  // Function 3: Start single-file inspection
  const handleStartSingleInspection = async () => {
    if (!singleFile) {
      setErrorMsg('Please select an artwork file (PDF or image).');
      return;
    }

    setErrorMsg(null);
    clearLogs();
    setIsAnalyzing(true);

    const formData = new FormData();
    formData.append('file', singleFile);
    formData.append('page', singlePage.toString());
    formData.append('target_size_mm', singleCropMode === 'auto' ? singleTargetSizeMm : '');
    formData.append('crop_mode', singleCropMode);

    try {
      const res = await fetch('/api/inspect_single', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to process single file');
      }

      const statusData: RunStatusResponse = await res.json();
      setRunId(statusData.run_id);
      setRunStatus(statusData);
      setInspectionType('single');
      setAnnotations([]);
      setViewMode('workspace');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileDrop = (
    e: React.DragEvent<HTMLDivElement>,
    target: 'brand' | 'vendor' | 'single'
  ) => {
    e.preventDefault();
    if (target === 'brand') setIsDraggingBrand(false);
    else if (target === 'vendor') setIsDraggingVendor(false);
    else setIsDraggingSingle(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (target === 'single') {
      const isPdfOrImg =
        file.type === 'application/pdf' || file.type.startsWith('image/');
      if (isPdfOrImg) {
        setSingleFile(file);
      } else {
        setErrorMsg('Please select a PDF or image file (.png, .jpg).');
      }
      return;
    }

    if (file.type === 'application/pdf') {
      if (target === 'brand') setBrandFile(file);
      else setVendorFile(file);
    } else {
      setErrorMsg('Please drop PDF files only (.pdf).');
    }
  };

  const filteredPastRuns = pastRuns.filter((r) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      r.run_id.toLowerCase().includes(q) ||
      (r.brand_filename || '').toLowerCase().includes(q) ||
      (r.vendor_filename || '').toLowerCase().includes(q);

    if (filterType === 'all') return matchSearch;
    if (filterType === 'single') return matchSearch && r.run_type === 'single';
    if (filterType === 'compare') return matchSearch && r.run_type !== 'single';
    return matchSearch;
  });

  return (
    <div className="max-w-5xl mx-auto py-10 px-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Pre-press Packaging Verification Studio</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Brand Innovation Studio
        </h1>
      </div>

      {/* 3 Main Function Tabs */}
      <div className="flex items-center justify-center mb-8">
        <div className="inline-flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl max-w-2xl w-full">
          {/* Function 1: Compare Mode */}
          <button
            type="button"
            onClick={() => setActiveMainTab('compare')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMainTab === 'compare'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-4 h-4 text-purple-400" />
            <span>1. Compare Mode</span>
          </button>

          {/* Function 2: Single Mode */}
          <button
            type="button"
            onClick={() => setActiveMainTab('single')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMainTab === 'single'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <ScanSearch className="w-4 h-4 text-emerald-400" />
            <span>2. Single Mode</span>
          </button>

          {/* Function 3: Historical Run */}
          <button
            type="button"
            onClick={() => setActiveMainTab('history')}
            className={`flex-1 py-3 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeMainTab === 'history'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-blue-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FolderOpen className="w-4 h-4 text-amber-400" />
            <span>3. Historical Run</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-300 font-bold ml-4 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* FUNCTION 3: HISTORICAL RUNS                               */}
      {/* ======================================================== */}
      {activeMainTab === 'history' && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-amber-400" />
                <span>Historical Inspection Runs</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Select a previous session
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by file name, run ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 w-56"
                />
              </div>

              <button
                onClick={fetchPastRuns}
                title="Refresh list"
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pastLoading ? 'animate-spin text-blue-400' : ''}`} />
              </button>

              <button
                type="button"
                disabled={isDeletingAll || pastRuns.length === 0}
                onClick={handleDeleteAllPastRuns}
                title="Delete all historical runs (Move all to Trash)"
                className="px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 hover:text-red-300 font-semibold text-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              >
                {isDeletingAll ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete All</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setFilterType('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
              }`}
            >
              All ({pastRuns.length})
            </button>
            <button
              onClick={() => setFilterType('compare')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterType === 'compare'
                  ? 'bg-purple-600 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
              }`}
            >
              Compare ({pastRuns.filter((r) => r.run_type !== 'single').length})
            </button>
            <button
              onClick={() => setFilterType('single')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                filterType === 'single'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-800/80 text-slate-400 hover:bg-slate-800'
              }`}
            >
              Single ({pastRuns.filter((r) => r.run_type === 'single').length})
            </button>
          </div>

          {/* Past Runs Cards */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {pastLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-slate-400 gap-3">
                <Loader2 className="w-7 h-7 animate-spin text-blue-500" />
                <span className="text-xs font-medium">Loading history...</span>
              </div>
            ) : filteredPastRuns.length === 0 ? (
              <div className="py-16 text-center text-slate-500">
                <FolderOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm font-semibold">No previous inspection runs found</p>
                <p className="text-xs mt-1">Run Compare Mode or Single Mode to create a new session.</p>
              </div>
            ) : (
              filteredPastRuns.map((r) => {
                const isSelectedLoading = loadingRunId === r.run_id;
                const isDeleting = deletingRunId === r.run_id;

                return (
                  <div
                    key={r.run_id}
                    className="bg-slate-950/80 border border-slate-800 hover:border-slate-700 rounded-xl p-4 transition-all duration-150 flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
                  >
                    <div className="min-w-0 flex-1">
                      {/* Line 1: Run Name, Run Type, Defect Count */}
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-400">{r.run_id}</span>

                        {r.run_type === 'single' ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            Single
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Compare
                          </span>
                        )}

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

                      {/* Line 2: File Details */}
                      <div className="text-xs text-slate-300 mt-1.5">
                        {r.run_type === 'single' ? (
                          <div className="flex items-center gap-1 truncate">
                            <span className="text-slate-500 font-medium">Artwork:</span>
                            <span className="font-medium text-slate-200 truncate">{r.brand_filename || 'Artwork'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 truncate">
                            <span className="text-slate-500 font-medium">Old:</span>
                            <span className="font-medium text-slate-200 truncate">{r.brand_filename || 'brand.pdf'}</span>
                            <span className="text-slate-600 mx-1">vs</span>
                            <span className="text-slate-500 font-medium">New:</span>
                            <span className="font-medium text-slate-200 truncate">{r.vendor_filename || 'vendor.pdf'}</span>
                          </div>
                        )}
                      </div>

                      {/* Line 3: Timestamp */}
                      <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-2">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {r.timestamp_utc ? new Date(r.timestamp_utc).toLocaleString('en-US') : '-'}
                        </span>
                      </div>
                    </div>

                    {/* Actions: Delete button & Open Session */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isDeleting || isSelectedLoading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeletePastRun(r);
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
                        type="button"
                        disabled={isSelectedLoading || isDeleting}
                        onClick={() => handleLoadPastRun(r)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 shadow-md cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        {isSelectedLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Loading...</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>Open Session</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FUNCTION 1: COMPARE MODE (OLD VS NEW)                     */}
      {/* ======================================================== */}
      {activeMainTab === 'compare' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            {/* Old Version PDF Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingBrand(true);
              }}
              onDragLeave={() => setIsDraggingBrand(false)}
              onDrop={(e) => handleFileDrop(e, 'brand')}
              onClick={() => brandInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                brandFile
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : isDraggingBrand
                  ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <input
                ref={brandInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setBrandFile(file);
                  }
                }}
              />

              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                  brandFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {brandFile ? <FileCheck className="w-7 h-7" /> : <FileUp className="w-7 h-7" />}
              </div>

              <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
                Old Version
              </span>
              <h3 className="text-base font-semibold text-slate-200">
                {brandFile ? brandFile.name : 'Drop Old Version PDF here'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {brandFile
                  ? `${(brandFile.size / 1024 / 1024).toFixed(2)} MB • Click to replace file`
                  : 'or click to browse from device'}
              </p>

              <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="text-xs text-slate-400 font-medium">Page:</label>
                <input
                  type="number"
                  min={1}
                  value={brandPage}
                  onChange={(e) => setBrandPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-center text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* New Version PDF Dropzone */}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingVendor(true);
              }}
              onDragLeave={() => setIsDraggingVendor(false)}
              onDrop={(e) => handleFileDrop(e, 'vendor')}
              onClick={() => vendorInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
                vendorFile
                  ? 'border-emerald-500/60 bg-emerald-500/5'
                  : isDraggingVendor
                  ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                  : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              <input
                ref={vendorInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    setVendorFile(file);
                  }
                }}
              />

              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                  vendorFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {vendorFile ? <FileCheck className="w-7 h-7" /> : <FileUp className="w-7 h-7" />}
              </div>

              <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
                New Version
              </span>
              <h3 className="text-base font-semibold text-slate-200">
                {vendorFile ? vendorFile.name : 'Drop New Version PDF here'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {vendorFile
                  ? `${(vendorFile.size / 1024 / 1024).toFixed(2)} MB • Click to replace file`
                  : 'or click to browse from device'}
              </p>

              <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <label className="text-xs text-slate-400 font-medium">Page:</label>
                <input
                  type="number"
                  min={1}
                  value={vendorPage}
                  onChange={(e) => setVendorPage(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-center text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Configuration & Action Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 w-full md:w-auto space-y-3">
              {/* Compare Mode Scope Selection */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">Comparison Scope:</span>
                <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCompareCropMode('auto')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      compareCropMode === 'auto'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>AutoCrop</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareCropMode('full')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      compareCropMode === 'full'
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Maximize className="w-3.5 h-3.5" />
                    <span>Full Page</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompareCropMode('manual')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      compareCropMode === 'manual'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>ManualCrop</span>
                  </button>
                </div>
              </div>

              {/* Target Size (when in auto crop mode) */}
              {compareCropMode === 'auto' ? (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-medium text-slate-400">
                    Target Trim Size (W × H mm):
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 620x250"
                    value={targetSizeMm}
                    onChange={(e) => setTargetSizeMm(e.target.value)}
                    className="px-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-blue-500 w-44"
                  />
                  <span className="text-xs text-slate-500">
                    Required: enter dimensions in mm (e.g. 620x250, 270x130)
                  </span>
                </div>
              ) : compareCropMode === 'full' ? (
                <div className="flex items-center gap-2 text-xs text-purple-300 bg-purple-500/10 border border-purple-500/20 px-3.5 py-2 rounded-xl">
                  <Sparkles className="w-4 h-4 shrink-0 text-purple-400" />
                  <span>
                    Full Page: Automatically aligns and compares the entire sheet canvas (no W×H needed). Ideal for folding carton nets, irregular dielines, and dimension leader lines.
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/20 px-3.5 py-2 rounded-xl">
                  <Sliders className="w-4 h-4 shrink-0 text-amber-400" />
                  <span>
                    ManualCrop: Visually drag, scale, and align two files on an interactive canvas. Ideal for scaled engineering drawings (e.g. A4 proofs), complex folding carton nets, or irregular layouts. Bypasses size gate verification.
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={handleStartAnalysis}
              disabled={!brandFile || !vendorFile || (compareCropMode === 'auto' && !targetSizeMm.trim())}
              className={`w-full md:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shrink-0 ${
                brandFile && vendorFile && (compareCropMode !== 'auto' || targetSizeMm.trim())
                  ? compareCropMode === 'manual'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-500/25 cursor-pointer hover:scale-[1.02]'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 cursor-pointer hover:scale-[1.02]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{compareCropMode === 'manual' ? 'Open Manual Align' : 'Start'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* FUNCTION 2: SINGLE MODE (1 FRAME WORKSPACE)               */}
      {/* ======================================================== */}
      {activeMainTab === 'single' && (
        <div>
          {/* Single File Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingSingle(true);
            }}
            onDragLeave={() => setIsDraggingSingle(false)}
            onDrop={(e) => handleFileDrop(e, 'single')}
            onClick={() => singleInputRef.current?.click()}
            className={`relative border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 mb-8 ${
              singleFile
                ? 'border-emerald-500/60 bg-emerald-500/5'
                : isDraggingSingle
                ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
                : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
            }`}
          >
            <input
              ref={singleInputRef}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setSingleFile(file);
                }
              }}
            />

            <div
              className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
                singleFile ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}
            >
              {singleFile ? <FileCheck className="w-8 h-8" /> : <ScanSearch className="w-8 h-8" />}
            </div>

            <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              Standalone Artwork (Single View)
            </span>
            <h3 className="text-lg font-bold text-slate-100">
              {singleFile ? singleFile.name : 'Drop PDF or image (PNG/JPG) here'}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              {singleFile
                ? `${(singleFile.size / 1024 / 1024).toFixed(2)} MB • Click to replace file`
                : 'Full-res inspection, mm coordinates, defect boxes, and loupe magnifier'}
            </p>

            {/* Page Selector (For PDF files) */}
            <div className="mt-5 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <label className="text-xs text-slate-400 font-medium">Page Number:</label>
              <input
                type="number"
                min={1}
                value={singlePage}
                onChange={(e) => setSinglePage(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-center text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Mode & Target Size Bar */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex-1 w-full md:w-auto space-y-3">
              {/* Crop Mode Selection */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-slate-400">Display Mode:</span>
                <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setSingleCropMode('auto')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      singleCropMode === 'auto'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Crop className="w-3.5 h-3.5" />
                    <span>Auto-crop Artboard</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleCropMode('full')}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                      singleCropMode === 'full'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <Maximize className="w-3.5 h-3.5" />
                    <span>Full Page</span>
                  </button>
                </div>
              </div>

              {/* Target Size (when in auto crop mode) */}
              {singleCropMode === 'auto' && (
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-medium text-slate-400">Trim Size (W × H mm):</label>
                  <input
                    type="text"
                    placeholder="e.g. 620x250"
                    value={singleTargetSizeMm}
                    onChange={(e) => setSingleTargetSizeMm(e.target.value)}
                    className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-blue-500 w-44"
                  />
                  <span className="text-xs text-slate-500">
                    Required: enter dimensions in mm (e.g. 620x250)
                  </span>
                </div>
              )}
            </div>

            {/* Launch Single Workspace Button */}
            <button
              onClick={handleStartSingleInspection}
              disabled={!singleFile || (singleCropMode === 'auto' && !singleTargetSizeMm.trim())}
              className={`w-full md:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
                singleFile && (singleCropMode === 'full' || singleTargetSizeMm.trim())
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25 cursor-pointer hover:scale-[1.02]'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
              }`}
            >
              <ScanSearch className="w-4 h-4" />
              <span>Start</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
