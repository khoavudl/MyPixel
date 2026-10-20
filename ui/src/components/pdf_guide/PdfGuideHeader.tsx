import React from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Sliders,
  PanelRightClose,
  PanelRightOpen,
  FilePlus,
  FileDown,
  Loader2,
  RotateCw,
  Undo2,
  Redo2,
} from 'lucide-react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';

export const PdfGuideHeader: React.FC = () => {
  const {
    closeStudio,
    docInfo,
    currentPage,
    setCurrentPage,
    zoom,
    setZoom,
    resetViewport,
    badgeSize,
    setBadgeSize,
    currentDpi,
    setCurrentDpi,
    isSidebarOpen,
    toggleSidebar,
    resetAll,
    history,
    future,
    undo,
    redo,
    canRevertCrop,
    undoCropPage,
    rotatePage,
    exportPdf,
    isExportingPdf,
  } = usePdfGuideStore();

  const totalPages = docInfo?.total_pages || 1;
  const curPageInfo = docInfo?.pages.find((p) => p.page_number === currentPage);

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-900/90 backdrop-blur px-4 flex items-center justify-between gap-4 select-none z-30 shrink-0">
      {/* Left: Back & Document info */}
      <div className="flex items-center gap-3">
        <button
          onClick={closeStudio}
          title="Return to main inspection without losing state"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition text-xs font-semibold"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        <div className="h-5 w-px bg-slate-800" />

        <div className="flex flex-col">
          <div className="text-xs font-bold text-white tracking-tight flex items-center gap-2">
            <span className="truncate max-w-[200px]" title={docInfo?.filename}>
              {docInfo?.filename || 'Document'}
            </span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">
              Editor Toolbox
            </span>
          </div>
          {curPageInfo && (
            <div className="text-[11px] text-slate-400 font-mono">
              {curPageInfo.width_mm} × {curPageInfo.height_mm} mm
            </div>
          )}
        </div>
      </div>

      {/* Center: Page Switcher & Zoom Controls */}
      <div className="flex items-center gap-4">
        {/* Page navigation */}
        <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setCurrentPage(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Previous Page"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-slate-200 px-1.5 font-medium">
            Page <span className="font-bold text-white">{currentPage}</span> / {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:hover:bg-transparent"
            title="Next Page"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setZoom((z) => z * 0.85)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetViewport}
            className="text-slate-200 hover:text-white px-1.5 font-mono text-[11px] font-semibold"
            title="Reset to 100%"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => z * 1.15)}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetViewport}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white ml-0.5"
            title="Fit to Screen"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Rotate 90 deg clockwise */}
        <button
          onClick={() => rotatePage(90)}
          className="flex items-center gap-1.5 bg-slate-950/80 px-2.5 py-1 rounded-lg border border-slate-800 text-xs text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          title="Rotate Page 90° Clockwise"
        >
          <RotateCw className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] font-semibold">Rotate 90°</span>
        </button>

        {/* Undo / Redo / Revert Crop Controls */}
        <div className="flex items-center gap-1 bg-slate-950/80 px-2 py-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={undo}
            disabled={history.length === 0 && !canRevertCrop}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={redo}
            disabled={future.length === 0}
            className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent transition cursor-pointer"
            title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          {canRevertCrop && (
            <button
              onClick={undoCropPage}
              className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-[10px] font-bold transition ml-1 cursor-pointer"
              title="Revert page crop back to original size"
            >
              <Undo2 className="w-3 h-3" />
              <span>Revert Crop</span>
            </button>
          )}
        </div>

        {/* DPI Sharpness Selector */}
        <div className="flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setCurrentDpi(300)}
            title="High Definition (300 DPI)"
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition ${
              currentDpi === 300
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            300 DPI
          </button>
          <button
            onClick={() => setCurrentDpi(400)}
            title="Ultra Sharp Vector (400 DPI - For deep zooming)"
            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono transition ${
              currentDpi === 400
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            400 DPI
          </button>
        </div>

        {/* Global Badge Size Slider */}
        <div className="flex items-center gap-2 bg-slate-950/80 px-3 py-1 rounded-lg border border-slate-800">
          <Sliders className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
            Size: <span className="font-bold text-blue-400 font-mono">{badgeSize}px</span>
          </span>
          <input
            type="range"
            min="16"
            max="64"
            step="2"
            value={badgeSize}
            onChange={(e) => setBadgeSize(Number(e.target.value))}
            className="w-24 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            title={`Adjust size of all badge numbers (${badgeSize}px)`}
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Quick Export to PDF on Top Bar */}
        <button
          onClick={exportPdf}
          disabled={isExportingPdf || !docInfo}
          title="Export current annotated page to PDF"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-50"
        >
          {isExportingPdf ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <FileDown className="w-3.5 h-3.5 text-blue-100" />
          )}
          <span>{isExportingPdf ? 'Exporting...' : 'Export to PDF'}</span>
        </button>

        <button
          onClick={resetAll}
          title="Open another PDF document"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-xs font-medium cursor-pointer"
        >
          <FilePlus className="w-3.5 h-3.5" />
          New File
        </button>

        <button
          onClick={toggleSidebar}
          title={isSidebarOpen ? 'Hide Step List' : 'Show Step List'}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition"
        >
          {isSidebarOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4 text-blue-400" />
          )}
        </button>
      </div>
    </header>
  );
};
