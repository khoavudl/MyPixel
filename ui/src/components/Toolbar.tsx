import React from 'react';
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
          title="Vẽ Bounding Box bắt lỗi đồng bộ 4 khung (B)"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTool === 'box'
              ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Square className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Vẽ Box (B)</span>
        </button>

        {/* Tool: Loupe Magnifier */}
        <button
          onClick={() => setActiveTool(activeTool === 'loupe' ? 'pan' : 'loupe')}
          title={`Kính lúp soi nét tương đối (L) • Độ phóng ${loupeScaleFactor.toFixed(1)}x (Shift + Lăn chuột hoặc phím [ / ])`}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeTool === 'loupe'
              ? 'bg-cyan-600 text-white shadow-sm ring-1 ring-cyan-400'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden md:inline">
            {activeTool === 'loupe' ? `Kính Lúp (${loupeScaleFactor.toFixed(1)}x)` : 'Kính Lúp (L)'}
          </span>
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

        <div className="h-4 w-[1px] bg-slate-800 mx-1" />

        {/* Rotate CCW */}
        <button
          onClick={rotateCounterClockwise}
          title="Xoay ngược chiều kim đồng hồ 90° (Shift + R)"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        {/* Rotation indicator badge */}
        <span
          title="Góc xoay hiện tại"
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
          title="Xoay theo chiều kim đồng hồ 90° (Phím R)"
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
          title="Bật/Tắt danh sách lỗi (Punch List)"
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-colors border cursor-pointer ${
            isSidebarOpen
              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
              : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          <span>Danh Sách Lỗi</span>
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
