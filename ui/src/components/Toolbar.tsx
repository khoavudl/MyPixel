import React, { useState } from 'react';
import {
  Hand,
  Square,
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RotateCcw,
  RotateCw,
  Eye,
  ListFilter,
  Home,
  SlidersHorizontal,
  Loader2,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';

interface ToolbarProps {
  onFitToScreen: () => void;
  onActualSize: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  onFitToScreen,
  onActualSize,
}) => {
  const {
    activeTool,
    setActiveTool,
    viewport,
    setViewport,
    rotateClockwise,
    rotateCounterClockwise,
    isFlickering,
    setIsFlickering,
    toggleFlickerTarget,
    flickerTarget,
    annotations,
    isSidebarOpen,
    setIsSidebarOpen,
    runId,
    resetAll,
    loupeScaleFactor,
    inspectionType,
    runStatus,
    setViewMode,
    manualAlignData,
    setManualAlignData,
  } = useInspectionStore();

  const [isLoadingManual, setIsLoadingManual] = useState(false);

  const isSingle =
    inspectionType === 'single' ||
    runStatus?.report?.mode === 'single' ||
    runStatus?.report?.run_type === 'single';

  const isManualMode =
    runStatus?.report?.mode === 'manual_align' ||
    Boolean(runId?.startsWith('manual_')) ||
    Boolean(runStatus?.report?.manual_transform);

  const handleAdjustAlignment = async () => {
    if (manualAlignData && manualAlignData.run_id === runId) {
      setViewMode('manual_align');
      return;
    }
    if (!runId) return;
    setIsLoadingManual(true);
    try {
      const res = await fetch(`/api/manual_align/prepare/${runId}`);
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to prepare manual alignment workspace');
      }
      const data = await res.json();
      setManualAlignData(data);
      setViewMode('manual_align');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cannot enter manual alignment');
    } finally {
      setIsLoadingManual(false);
    }
  };

  const zoomPercent = Math.round(viewport.zoom * 100);

  const handleZoomIn = () => {
    setViewport({ zoom: Math.min(32.0, viewport.zoom * 1.25) });
  };

  const handleZoomOut = () => {
    setViewport({ zoom: Math.max(0.05, viewport.zoom * 0.8) });
  };

  return (
    <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-30">
      {/* Left: Branding & Home Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={resetAll}
          title="Home"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
        >
          <Home className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Home</span>
        </button>

        {/* Button to enter / return to Manual Alignment */}
        {!isSingle && (
          <button
            onClick={handleAdjustAlignment}
            disabled={isLoadingManual}
            title={
              isManualMode
                ? 'Back to Manual Alignment to fine-tune position, scale, or rotation'
                : 'Switch to Manual Alignment staging canvas to fine-tune alignment'
            }
            className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 hover:text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            {isLoadingManual ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SlidersHorizontal className="w-3.5 h-3.5" />
            )}
            <span>{isManualMode ? 'Adjust Alignment' : 'Manual Align'}</span>
          </button>
        )}
      </div>

      {/* Center: Tools & Viewport Controls */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
        {/* Tool: Hand / Pan */}
        <button
          onClick={() => setActiveTool('pan')}
          title="Pan tool (H / Click & drag)"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTool === 'pan'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Pan (H)</span>
        </button>

        {/* Tool: Draw Box */}
        <button
          onClick={() => setActiveTool(activeTool === 'box' ? 'pan' : 'box')}
          title={isSingle ? "Draw defect box (B)" : "Draw defect box across viewports (B)"}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTool === 'box'
              ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Square className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Draw Box (B)</span>
        </button>

        {/* Tool: Loupe Magnifier */}
        <button
          onClick={() => setActiveTool(activeTool === 'loupe' ? 'pan' : 'loupe')}
          title={`Magnifier loupe (L) • Zoom ${loupeScaleFactor.toFixed(1)}x (Shift + Scroll or [ / ])`}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTool === 'loupe'
              ? 'bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden md:inline">
            {activeTool === 'loupe' ? `Loupe (${loupeScaleFactor.toFixed(1)}x)` : 'Loupe (L)'}
          </span>
        </button>

        {/* Tool: Flicker / Blink Compare (Only when comparing 2 files) */}
        {!isSingle && (
          <button
            onClick={() => {
              if (isFlickering) {
                setIsFlickering(false);
              } else {
                setIsFlickering(true);
                toggleFlickerTarget();
              }
            }}
            title="Blink comparison (Hold Space)"
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
              isFlickering
                ? 'bg-amber-500 text-slate-950 font-bold animate-pulse'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {isFlickering ? `Flicker: ${flickerTarget.toUpperCase()}` : 'Flicker (Space)'}
            </span>
          </button>
        )}

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          title="Zoom out (-)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>

        {/* Zoom Percent indicator */}
        <span className="text-xs font-mono font-bold text-slate-300 min-w-[52px] text-center">
          {zoomPercent}%
        </span>

        {/* Zoom In */}
        <button
          onClick={handleZoomIn}
          title="Zoom in (+)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Fit to Screen */}
        <button
          onClick={onFitToScreen}
          title="Fit to screen (0)"
          className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Fit (0)</span>
        </button>

        {/* 100% Actual Size */}
        <button
          onClick={onActualSize}
          title="Actual size 100% (1)"
          className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">100% (1)</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Rotate CCW */}
        <button
          onClick={rotateCounterClockwise}
          title="Rotate counter-clockwise 90° (Shift + R)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Rotation indicator badge */}
        <span
          title="Current rotation angle"
          className={`text-xs font-mono font-bold min-w-[38px] text-center px-1 py-0.5 rounded ${
            viewport.rotation !== 0
              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
              : 'text-slate-400'
          }`}
        >
          {viewport.rotation || 0}°
        </span>

        {/* Rotate CW */}
        <button
          onClick={rotateClockwise}
          title="Rotate clockwise 90° (R)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* Right: Defect Punch List Toggle */}
      <div className="flex items-center gap-3">
        {/* Defect List Sidebar Toggle */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          title="Defect List"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors border cursor-pointer ${
            isSidebarOpen
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>Defects</span>
          {annotations.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-slate-950 font-bold">
              {annotations.length}
            </span>
          )}
        </button>
      </div>
    </div>
  );
};
