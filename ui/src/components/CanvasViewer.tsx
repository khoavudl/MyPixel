import React, { useRef, useState } from 'react';
import { Loader2, Eye } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { useSyncedViewport } from '../hooks/useSyncedViewport';
import { SvgAnnotationLayer } from './SvgAnnotationLayer';
import { LoupeMagnifier } from './LoupeMagnifier';
import { getDisplayedDimensions } from '../utils/coordinateTransform';

interface CanvasViewerProps {
  title?: string;
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
  isMain = false,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    viewport,
    activeTool,
    isFlickering,
    flickerTarget,
    naturalImageSize,
    setNaturalImageSize,
  } = useInspectionStore();
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

  // Determine effective virtual dimensions (master size from Brand or self natural size)
  const effectiveWidth = isMain
    ? naturalSize?.w || 0
    : naturalImageSize?.w || naturalSize?.w || 0;
  const effectiveHeight = isMain
    ? naturalSize?.h || 0
    : naturalImageSize?.h || naturalSize?.h || 0;

  // Displayed dimensions based on current orthogonal rotation
  const { displayedW, displayedH } = getDisplayedDimensions(
    effectiveWidth,
    effectiveHeight,
    viewport.rotation || 0
  );

  // Translation to keep the rotated bounding box anchored at (0, 0) in the displayed wrapper
  let innerTransform = 'none';
  const rot = viewport.rotation || 0;
  if (rot === 90) {
    innerTransform = `translate(${effectiveHeight}px, 0px) rotate(90deg)`;
  } else if (rot === 180) {
    innerTransform = `translate(${effectiveWidth}px, ${effectiveHeight}px) rotate(180deg)`;
  } else if (rot === 270) {
    innerTransform = `translate(0px, ${effectiveWidth}px) rotate(270deg)`;
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={onMouseDown}
      className={`relative w-full h-full bg-slate-950 overflow-hidden border border-slate-800 rounded-xl select-none ${
        activeTool === 'pan'
          ? isDragging
            ? 'cursor-grabbing'
            : 'cursor-grab'
          : activeTool === 'loupe'
          ? 'cursor-none'
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
        {title && (
          <span className="text-xs font-semibold text-slate-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            {title}
          </span>
        )}

        {rot !== 0 && (
          <span className="px-2 py-0.5 rounded bg-blue-500/20 border border-blue-400/40 text-blue-300 text-[10px] font-bold uppercase flex items-center gap-1 shadow">
            {rot}°
          </span>
        )}

        {isFlickering && altImageUrl && (
          <span className="px-2 py-0.5 rounded bg-amber-500/90 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow animate-pulse">
            <Eye className="w-3 h-3" /> FLICKER: {flickerTarget}
          </span>
        )}
      </div>

      {/* Floating Resolution Pill */}
      {naturalSize && (
        <div className="absolute top-3 right-3 z-20 px-2 py-0.5 rounded bg-slate-900/80 border border-slate-800 text-[10px] font-mono text-slate-400 pointer-events-none flex items-center gap-1.5">
          <span>{naturalSize.w} × {naturalSize.h} px</span>
          {!isMain && (
            <span className="text-[9px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-semibold uppercase">
              Indicator
            </span>
          )}
        </div>
      )}

      {/* Loading Spinner */}
      {!imageLoaded && activeImageSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10 pointer-events-none">
          <div className="flex flex-col items-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs font-medium">Loading image...</span>
          </div>
        </div>
      )}

      {/* Transformable Canvas Layer (GPU Hardware Accelerated) */}
      <div
        className="absolute top-0 left-0"
        style={{
          transform: `translate3d(${viewport.panX}px, ${viewport.panY}px, 0px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          willChange: isDragging ? 'transform' : undefined,
        }}
      >
        {activeImageSrc ? (
          /* Outer Displayed Bounding Box */
          <div
            className="relative"
            style={{
              width: displayedW > 0 ? displayedW : undefined,
              height: displayedH > 0 ? displayedH : undefined,
            }}
          >
            {/* Inner Content Container (rotated & shifted into displayed bounds) */}
            <div
              className="relative"
              style={{
                width: effectiveWidth > 0 ? effectiveWidth : undefined,
                height: effectiveHeight > 0 ? effectiveHeight : undefined,
                transform: innerTransform,
                transformOrigin: '0 0',
              }}
            >
              <img
                src={activeImageSrc}
                alt={title}
                draggable={false}
                style={{
                  width: effectiveWidth > 0 ? effectiveWidth : undefined,
                  height: effectiveHeight > 0 ? effectiveHeight : undefined,
                  display: 'block',
                }}
                onLoad={(e) => {
                  setImageLoaded(true);
                  const img = e.currentTarget;
                  const size = { w: img.naturalWidth, h: img.naturalHeight };
                  setNaturalSize(size);
                  if (isMain) {
                    setNaturalImageSize(size);
                  }
                }}
                className="pointer-events-none max-w-none shadow-2xl"
              />

              {/* Cross-canvas synchronized SVG Bounding Box overlay */}
              {effectiveWidth > 0 && effectiveHeight > 0 && (
                <SvgAnnotationLayer
                  imageWidth={effectiveWidth}
                  imageHeight={effectiveHeight}
                  displayedWidth={displayedW}
                  displayedHeight={displayedH}
                  containerRef={containerRef}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="w-[800px] h-[600px] flex items-center justify-center text-slate-600 text-sm">
            No image available
          </div>
        )}
      </div>

      {/* Loupe Magnifier Tool */}
      {effectiveWidth > 0 && effectiveHeight > 0 && (
        <LoupeMagnifier
          containerRef={containerRef}
          imageUrl={activeImageSrc}
          imageWidth={effectiveWidth}
          imageHeight={effectiveHeight}
          displayedWidth={displayedW}
          displayedHeight={displayedH}
        />
      )}
    </div>
  );
};
