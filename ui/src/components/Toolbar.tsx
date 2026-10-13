import React from 'react';
import {
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  RotateCcw,
  Eye,
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
    isSynced,
    setIsSynced,
    isFlickering,
    setIsFlickering,
    toggleFlickerTarget,
    flickerTarget,
    runId,
    resetAll,
  } = useInspectionStore();

  const zoomPercent = Math.round(viewport.zoom * 100);

  const handleZoomIn = () => {
    setViewport({ zoom: Math.min(32.0, viewport.zoom * 1.25) });
  };

  const handleZoomOut = () => {
    setViewport({ zoom: Math.max(0.05, viewport.zoom * 0.8) });
  };

  return (
    <div className="h-14 bg-slate-900 border-b border-slate-800 px-4 flex items-center justify-between select-none z-30">
      {/* Left: Branding & Back Button */}
      <div className="flex items-center gap-3">
        <button
          onClick={resetAll}
          title="Quay lại chọn cặp file mới"
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Kiểm Tra Mới</span>
        </button>

        <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

        <div className="hidden sm:flex items-center gap-1.5 text-xs">
          <span className="text-slate-500">Mã:</span>
          <span className="font-mono text-blue-400 font-semibold">{runId || '-'}</span>
        </div>
      </div>

      {/* Center: Tools & Viewport Controls */}
      <div className="flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
        {/* Tool: Hand / Pan */}
        <button
          onClick={() => setActiveTool('pan')}
          title="Công cụ Di chuyển (H / Giữ chuột)"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
            activeTool === 'pan'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Hand className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Pan (H)</span>
        </button>

        {/* Tool: Flicker / Blink Compare */}
        <button
          onClick={() => {
            if (isFlickering) {
              setIsFlickering(false);
            } else {
              setIsFlickering(true);
              toggleFlickerTarget();
            }
          }}
          title="Chớp tắt đối chiếu Brand & Vendor (Bấm giữ phím Space)"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
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

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Zoom Out */}
        <button
          onClick={handleZoomOut}
          title="Thu nhỏ (-)"
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
          title="Phóng to (+)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Fit to Screen */}
        <button
          onClick={onFitToScreen}
          title="Vừa vặn màn hình (0)"
          className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Fit (0)</span>
        </button>

        {/* 100% Actual Size */}
        <button
          onClick={onActualSize}
          title="Kích thước thực 100% (1)"
          className="px-2 py-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
        >
          <Minimize2 className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">100% (1)</span>
        </button>
      </div>

      {/* Right: Sync Status & Shortcuts hint */}
      <div className="flex items-center gap-3">
        {/* Sync Viewports Toggle */}
        <button
          onClick={() => setIsSynced(!isSynced)}
          title="Bật/Tắt đồng bộ chuột giữa cả 4 khung hình (S)"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border ${
            isSynced
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-800/60 border-slate-700 text-slate-400'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSynced ? 'animate-none' : ''}`} />
          <span>4-Way Sync: {isSynced ? 'BẬT' : 'TẮT'}</span>
        </button>

        <div className="hidden xl:flex items-center gap-2 text-[11px] text-slate-500 font-medium">
          <span>Space: Chớp tắt</span>
          <span>•</span>
          <span>Lăn chuột: Zoom</span>
        </div>
      </div>
    </div>
  );
};
