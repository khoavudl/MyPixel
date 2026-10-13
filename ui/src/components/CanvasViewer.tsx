import React, { useRef, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { useSyncedViewport } from '../hooks/useSyncedViewport';

interface CanvasViewerProps {
  title: string;
  badgeText: string;
  badgeColorClass: string;
  imageUrl?: string | null;
  altImageUrl?: string | null; // For flicker compare
  frameId?: string;
  isMain?: boolean;
}

export const CanvasViewer: React.FC<CanvasViewerProps> = ({
  title,
  badgeText,
  badgeColorClass,
  imageUrl,
  altImageUrl,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewport, activeTool, isFlickering, flickerTarget } = useInspectionStore();
  const { onMouseDown, isDragging } = useSyncedViewport(containerRef);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);

  // If flickering is active and this frame supports it, alternate between imageUrl and altImageUrl
  const activeImageSrc =
    isFlickering && altImageUrl
      ? flickerTarget === 'brand'
        ? imageUrl
        : altImageUrl
      : imageUrl;

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className={`relative w-full h-full bg-slate-950 overflow-hidden border border-slate-800 rounded-xl select-none ${
        activeTool === 'pan'
          ? isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : 'cursor-crosshair'
      }`}
    >
      {/* Floating Card Header */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-2 pointer-events-none">
        <span
          className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider shadow-md backdrop-blur-md ${badgeColorClass}`}
        >
          {badgeText}
        </span>
        <span className="text-xs font-semibold text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          {title}
        </span>

        {isFlickering && altImageUrl && (
          <span className="px-2 py-0.5 rounded bg-amber-500/90 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow animate-pulse">
            <Eye className="w-3 h-3" /> FLICKER: {flickerTarget}
          </span>
        )}
      </div>

      {/* Floating Resolution Pill */}
      {naturalSize && (
        <div className="absolute top-3 right-3 z-20 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-slate-400 pointer-events-none">
          {naturalSize.w} × {naturalSize.h} px
        </div>
      )}

      {/* Loading Spinner */}
      {!imageLoaded && activeImageSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Đang tải ảnh...</span>
          </div>
        </div>
      )}

      {/* Transformable Canvas Layer (GPU Hardware Accelerated) */}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {activeImageSrc ? (
          <img
            src={activeImageSrc}
            alt={title}
            draggable={false}
            onLoad={(e) => {
              setImageLoaded(true);
              const img = e.currentTarget;
              setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
            }}
            className="block pointer-events-none max-w-none shadow-2xl"
          />
        ) : (
          <div className="w-[800px] h-[600px] flex items-center justify-center text-slate-600 text-sm">
            Chưa có ảnh kết quả
          </div>
        )}
      </div>
    </div>
  );
};
