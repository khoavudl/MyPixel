import React, { useEffect, useRef, useState } from 'react';
import {
  Sliders,
  CheckCircle2,
  RotateCcw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  Layers,
  ArrowLeft,
  Loader2,
  Info,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { RunStatusResponse } from '../types';

export const ManualAlignView: React.FC = () => {
  const {
    manualAlignData,
    setViewMode,
    setRunStatus,
    setRunId,
    setInspectionType,
    setAnnotations,
    setManualAlignData,
    resetViewport,
  } = useInspectionStore();

  if (!manualAlignData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <p className="text-base font-semibold text-slate-300 mb-4">
          No manual alignment session data available.
        </p>
        <button
          onClick={() => setViewMode('setup')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
        >
          Back to Home
        </button>
      </div>
    );
  }

  const {
    run_id,
    brand_image,
    vendor_image,
    brand_size_mm,
    vendor_size_mm,
    brand_shape_px,
    initial_crop_bbox_mm,
    brand_filename,
    vendor_filename,
    brand_page,
    vendor_page,
    initial_transform,
  } = manualAlignData;

  // Staging viewport pan & zoom (for observing the composite canvas)
  const [viewportZoom, setViewportZoom] = useState(1.0);
  const [viewportPan, setViewportPan] = useState({ x: 0, y: 0 });
  const [isPanningViewport, setIsPanningViewport] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

  // Floating layer (Vendor) transform state in Brand mm coordinates
  // 1 mm on preview corresponds to (brand_shape_px[0] / brand_size_mm[0]) pixels
  const pxPerMmBrand = brand_shape_px[0] / brand_size_mm[0];

  // Calculate default scale so Vendor matches Brand width if Vendor is much smaller (e.g. A4 scaled net)
  const sizeRatio = brand_size_mm[0] / Math.max(vendor_size_mm[0], 1);
  const isVendorScaledDown = sizeRatio > 2.0;

  const [offsetXmm, setOffsetXmm] = useState(
    initial_transform?.offset_x_mm ?? 0.0
  );
  const [offsetYmm, setOffsetYmm] = useState(
    initial_transform?.offset_y_mm ?? 0.0
  );
  const [scale, setScale] = useState(
    initial_transform?.scale_x ?? (isVendorScaledDown ? sizeRatio : 1.0)
  );
  const [rotationDeg, setRotationDeg] = useState(
    initial_transform?.rotation_deg ?? 0.0
  );

  // Sync refs with latest state for high-frequency wheel / keyboard events
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const offsetXRef = useRef(offsetXmm);
  offsetXRef.current = offsetXmm;
  const offsetYRef = useRef(offsetYmm);
  offsetYRef.current = offsetYmm;

  // Blend modes & Opacity
  const [opacity, setOpacity] = useState(0.5);
  const [blendMode, setBlendMode] = useState<'normal' | 'difference' | 'duotone'>('difference');

  // Crop Box state on Brand (in mm)
  const [cropBoxMm] = useState<[number, number, number, number]>(
    initial_crop_bbox_mm && initial_crop_bbox_mm[2] > 0
      ? initial_crop_bbox_mm
      : [0, 0, brand_size_mm[0], brand_size_mm[1]]
  );

  // Dragging / Transform interactions for Vendor
  const [isDraggingVendor, setIsDraggingVendor] = useState(false);
  const [isTransformingCorner, setIsTransformingCorner] = useState<string | null>(null);
  const dragStartPosRef = useRef<{
    x: number;
    y: number;
    initialOffX: number;
    initialOffY: number;
    initialScale: number;
    corner: string | null;
    initialDist: number;
    dirX: number;
    dirY: number;
    deltaXOpp: number;
    deltaYOpp: number;
  }>({
    x: 0,
    y: 0,
    initialOffX: 0,
    initialOffY: 0,
    initialScale: 1.0,
    corner: null,
    initialDist: 1.0,
    dirX: 1.0,
    dirY: 1.0,
    deltaXOpp: 0,
    deltaYOpp: 0,
  });

  // Scale around Vendor center helper
  const applyScaleAroundCenter = (targetScale: number) => {
    const curScale = scaleRef.current;
    const curOffX = offsetXRef.current;
    const curOffY = offsetYRef.current;

    const newScale = Math.max(0.05, Number(targetScale.toFixed(4)));
    if (newScale === curScale) return;

    const Vw = vendor_size_mm[0];
    const Vh = vendor_size_mm[1];
    const rad = (rotationDeg * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);

    const centerOffsetX = cosT * (Vw / 2) - sinT * (Vh / 2);
    const centerOffsetY = sinT * (Vw / 2) + cosT * (Vh / 2);

    const newOffX = curOffX + (curScale - newScale) * centerOffsetX;
    const newOffY = curOffY + (curScale - newScale) * centerOffsetY;

    scaleRef.current = newScale;
    offsetXRef.current = newOffX;
    offsetYRef.current = newOffY;

    setScale(newScale);
    setOffsetXmm(Number(newOffX.toFixed(4)));
    setOffsetYmm(Number(newOffY.toFixed(4)));
  };

  // Applying state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-fit brand image inside viewport on initial mount
  useEffect(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;

    const fitScaleX = (clientWidth - 80) / brand_shape_px[0];
    const fitScaleY = (clientHeight - 80) / brand_shape_px[1];
    const fit = Math.min(fitScaleX, fitScaleY, 1.0);

    setViewportZoom(fit);
    setViewportPan({
      x: (clientWidth - brand_shape_px[0] * fit) / 2,
      y: (clientHeight - brand_shape_px[1] * fit) / 2,
    });
  }, [brand_shape_px]);

  // Keyboard micro-nudge listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      const stepPx = e.shiftKey ? 10 : e.altKey ? 0.1 : 1.0;
      const stepMm = stepPx / pxPerMmBrand;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setOffsetXmm((prev) => prev - stepMm);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setOffsetXmm((prev) => prev + stepMm);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setOffsetYmm((prev) => prev - stepMm);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setOffsetYmm((prev) => prev + stepMm);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        applyScaleAroundCenter(scaleRef.current * 1.01);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        applyScaleAroundCenter(scaleRef.current * 0.99);
      } else if (e.key === '[' || e.key === '{') {
        e.preventDefault();
        setRotationDeg((prev) => Number((prev - 0.2).toFixed(2)));
      } else if (e.key === ']' || e.key === '}') {
        e.preventDefault();
        setRotationDeg((prev) => Number((prev + 0.2).toFixed(2)));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pxPerMmBrand, scale, offsetXmm, offsetYmm, rotationDeg, vendor_size_mm]);

  // Viewport Drag / Pan handler
  const handleViewportMouseDown = (e: React.MouseEvent) => {
    // Only drag canvas background when not interacting with floating vendor
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      setIsPanningViewport(true);
      panStartRef.current = { x: e.clientX - viewportPan.x, y: e.clientY - viewportPan.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanningViewport) {
      setViewportPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (isDraggingVendor) {
      const dxPx = (e.clientX - dragStartPosRef.current.x) / viewportZoom;
      const dyPx = (e.clientY - dragStartPosRef.current.y) / viewportZoom;
      const dxMm = dxPx / pxPerMmBrand;
      const dyMm = dyPx / pxPerMmBrand;

      setOffsetXmm(dragStartPosRef.current.initialOffX + dxMm);
      setOffsetYmm(dragStartPosRef.current.initialOffY + dyMm);
      return;
    }

    if (isTransformingCorner) {
      const dx = e.clientX - dragStartPosRef.current.x;
      const dy = e.clientY - dragStartPosRef.current.y;
      const { initialDist, dirX, dirY, initialScale, initialOffX, initialOffY, deltaXOpp, deltaYOpp } = dragStartPosRef.current;

      const deltaOutward = dx * dirX + dy * dirY;
      const newDist = Math.max(1, initialDist + deltaOutward);
      const ratio = newDist / initialDist;
      const newScale = Math.max(0.05, Number((initialScale * ratio).toFixed(4)));

      const newOffX = initialOffX + (initialScale - newScale) * deltaXOpp;
      const newOffY = initialOffY + (initialScale - newScale) * deltaYOpp;

      setScale(newScale);
      setOffsetXmm(Number(newOffX.toFixed(4)));
      setOffsetYmm(Number(newOffY.toFixed(4)));
      return;
    }
  };

  const handleMouseUp = () => {
    setIsPanningViewport(false);
    setIsDraggingVendor(false);
    setIsTransformingCorner(null);
  };

  // Vendor layer drag start
  const handleVendorMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsDraggingVendor(true);
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffX: offsetXmm,
      initialOffY: offsetYmm,
      initialScale: scale,
      corner: null,
      initialDist: 1.0,
      dirX: 1.0,
      dirY: 1.0,
      deltaXOpp: 0,
      deltaYOpp: 0,
    };
  };

  // Corner resize drag start
  const handleCornerMouseDown = (e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsTransformingCorner(corner);

    const Vw = vendor_size_mm[0];
    const Vh = vendor_size_mm[1];
    const rad = (rotationDeg * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);

    // Opposite corner unrotated (u, v) and Active corner unrotated (u, v)
    let uOpp = 0, vOpp = 0;
    let uCur = 0, vCur = 0;

    if (corner === 'se') {
      uOpp = 0; vOpp = 0;
      uCur = Vw; vCur = Vh;
    } else if (corner === 'nw') {
      uOpp = Vw; vOpp = Vh;
      uCur = 0; vCur = 0;
    } else if (corner === 'ne') {
      uOpp = 0; vOpp = Vh;
      uCur = Vw; vCur = 0;
    } else if (corner === 'sw') {
      uOpp = Vw; vOpp = 0;
      uCur = 0; vCur = Vh;
    }

    const deltaXOpp = cosT * uOpp - sinT * vOpp;
    const deltaYOpp = sinT * uOpp + cosT * vOpp;

    const deltaXCur = cosT * uCur - sinT * vCur;
    const deltaYCur = sinT * uCur + cosT * vCur;

    // Vector from opposite corner to active corner in Brand mm
    const vecMmX = scale * (deltaXCur - deltaXOpp);
    const vecMmY = scale * (deltaYCur - deltaYOpp);

    // In screen pixels
    const vecPxX = vecMmX * pxPerMmBrand * viewportZoom;
    const vecPxY = vecMmY * pxPerMmBrand * viewportZoom;
    const initialDist = Math.max(1, Math.hypot(vecPxX, vecPxY));

    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffX: offsetXmm,
      initialOffY: offsetYmm,
      initialScale: scale,
      corner,
      initialDist,
      dirX: vecPxX / initialDist,
      dirY: vecPxY / initialDist,
      deltaXOpp,
      deltaYOpp,
    };
  };

  // Wheel zoom on canvas viewport & Shift + Wheel for Vendor-only scale
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    if (e.shiftKey) {
      // With Shift held, browsers (especially macOS Chrome/Safari) remap vertical scroll to deltaX (deltaY becomes 0).
      // We pick whichever delta has larger magnitude to reliably capture the wheel direction.
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      // Scrolling UP (negative delta) enlarges; scrolling DOWN (positive delta) shrinks
      const scaleStep = delta < 0 ? 1.03 : 0.97;
      applyScaleAroundCenter(scaleRef.current * scaleStep);
      return;
    }

    // Normal Viewport Zoom (both images)
    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(10.0, Math.max(0.05, viewportZoom * zoomFactor));

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    // Zoom centered to mouse cursor
    setViewportPan({
      x: cursorX - (cursorX - viewportPan.x) * (newZoom / viewportZoom),
      y: cursorY - (cursorY - viewportPan.y) * (newZoom / viewportZoom),
    });
    setViewportZoom(newZoom);
  };

  // Confirm & Apply Alignment
  const handleConfirmAndApply = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      run_id,
      transform: {
        offset_x_mm: Number(offsetXmm.toFixed(4)),
        offset_y_mm: Number(offsetYmm.toFixed(4)),
        scale_x: Number(scale.toFixed(6)),
        scale_y: Number(scale.toFixed(6)),
        rotation_deg: Number(rotationDeg.toFixed(3)),
      },
      crop_bbox_mm: [
        Number(cropBoxMm[0].toFixed(2)),
        Number(cropBoxMm[1].toFixed(2)),
        Number(cropBoxMm[2].toFixed(2)),
        Number(cropBoxMm[3].toFixed(2)),
      ],
      brand_page,
      vendor_page,
    };

    try {
      const res = await fetch('/api/manual_align/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || 'Failed to apply manual alignment');
      }

      const statusResponse: RunStatusResponse = await res.json();
      setRunId(run_id);
      setRunStatus(statusResponse);
      setInspectionType('compare');
      setAnnotations([]);
      setManualAlignData({
        ...manualAlignData,
        initial_transform: {
          offset_x_mm: Number(offsetXmm.toFixed(4)),
          offset_y_mm: Number(offsetYmm.toFixed(4)),
          scale_x: Number(scale.toFixed(6)),
          scale_y: Number(scale.toFixed(6)),
          rotation_deg: Number(rotationDeg.toFixed(3)),
        },
      });
      resetViewport();
      setViewMode('workspace');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  // Vendor pixel offset and size on Brand's pixel canvas
  const vendorRenderW = (vendor_size_mm[0] * pxPerMmBrand) * scale;
  const vendorRenderH = (vendor_size_mm[1] * pxPerMmBrand) * scale;
  const vendorRenderX = offsetXmm * pxPerMmBrand;
  const vendorRenderY = offsetYmm * pxPerMmBrand;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-5 flex items-center justify-between shrink-0 shadow-md z-30">
        {/* Left: Title & Back */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setViewMode('setup')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Back to Setup"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-600/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white tracking-wide uppercase">
                  Manual Alignment Workspace
                </span>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                  Mode 3
                </span>
              </div>
              <div className="text-[11px] text-slate-400 truncate max-w-xs">
                {brand_filename} ({brand_size_mm[0]}×{brand_size_mm[1]} mm) vs {vendor_filename}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Alignment Controls */}
        <div className="flex items-center gap-3">
          {/* Opacity Slider */}
          <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px]">Opacity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-20 accent-blue-500 cursor-pointer h-1.5"
            />
            <span className="w-8 font-mono text-[11px] text-slate-300 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* Blend Mode Selector */}
          <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <button
              onClick={() => setBlendMode('difference')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                blendMode === 'difference'
                  ? 'bg-amber-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Difference blend: matching areas turn solid black, discrepancies highlight"
            >
              Difference
            </button>
            <button
              onClick={() => setBlendMode('normal')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                blendMode === 'normal'
                  ? 'bg-blue-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Normal opacity overlay"
            >
              Opacity
            </button>
            <button
              onClick={() => setBlendMode('duotone')}
              className={`px-2.5 py-1 rounded-lg font-medium transition-colors cursor-pointer ${
                blendMode === 'duotone'
                  ? 'bg-purple-600 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Cyan / Red duotone anaglyph"
            >
              Cyan/Red
            </button>
          </div>

          {/* Scale Control */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px]">Scale:</span>
            <button
              onClick={() => applyScaleAroundCenter(scale - 0.05)}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-slate-300 cursor-pointer"
              title="Scale down"
            >
              -
            </button>
            <span className="font-mono text-xs text-white min-w-[3.5rem] text-center">
              {scale.toFixed(2)}×
            </span>
            <button
              onClick={() => applyScaleAroundCenter(scale + 0.05)}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-slate-300 cursor-pointer"
              title="Scale up"
            >
              +
            </button>
            {isVendorScaledDown && (
              <button
                onClick={() => applyScaleAroundCenter(sizeRatio)}
                className="ml-1 px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded text-[10px] font-medium border border-amber-500/30 cursor-pointer"
                title={`Fit A4 to 1:1 scale (${sizeRatio.toFixed(2)}×)`}
              >
                Fit A4
              </button>
            )}
          </div>

          {/* Rotation Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setRotationDeg((r) => Number(((r - 90 + 360) % 360).toFixed(1)))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Rotate left 90°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-white w-11 text-center">
              {rotationDeg.toFixed(1)}°
            </span>
            <button
              onClick={() => setRotationDeg((r) => Number(((r + 90) % 360).toFixed(1)))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Rotate right 90°"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Right: Reset & Confirm Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setOffsetXmm(0);
              setOffsetYmm(0);
              const rScale = isVendorScaledDown ? sizeRatio : 1.0;
              setScale(rScale);
              setRotationDeg(0);
              scaleRef.current = rScale;
              offsetXRef.current = 0;
              offsetYRef.current = 0;
            }}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Reset
          </button>

          <button
            onClick={handleConfirmAndApply}
            disabled={isSubmitting}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing & Warping...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Enter Workspace</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        onMouseDown={handleViewportMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="flex-1 relative bg-slate-950 overflow-hidden cursor-grab active:cursor-grabbing select-none"
      >
        {/* World Transformed Container */}
        <div
          style={{
            transform: `translate3d(${viewportPan.x}px, ${viewportPan.y}px, 0) scale(${viewportZoom})`,
            transformOrigin: '0 0',
            width: `${brand_shape_px[0]}px`,
            height: `${brand_shape_px[1]}px`,
            position: 'absolute',
          }}
          className="shadow-2xl ring-1 ring-slate-800"
        >
          {/* Base Layer: Brand Image */}
          <img
            src={brand_image}
            alt="Brand Layer"
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none bg-white"
            draggable={false}
          />

          {/* Floating Transform Layer: Vendor Image */}
          <div
            onMouseDown={handleVendorMouseDown}
            style={{
              position: 'absolute',
              left: `${vendorRenderX}px`,
              top: `${vendorRenderY}px`,
              width: `${vendorRenderW}px`,
              height: `${vendorRenderH}px`,
              transform: `rotate(${rotationDeg}deg)`,
              transformOrigin: 'top left',
              opacity,
              mixBlendMode: blendMode === 'difference' ? 'difference' : 'normal',
              cursor: isDraggingVendor ? 'grabbing' : 'grab',
              filter: blendMode === 'duotone' ? 'sepia(1) saturate(5) hue-rotate(180deg)' : undefined,
            }}
            className="border-2 border-blue-400/90 hover:border-blue-300 group shadow-lg pointer-events-auto"
          >
            <img
              src={vendor_image}
              alt="Vendor Layer"
              className="w-full h-full object-fill pointer-events-none select-none"
              draggable={false}
            />

            {/* Corner Resize Handles - Prominent, Easy-to-grab (w-6 h-6, 24px) */}
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'se')}
              className="absolute -right-3 -bottom-3 w-6 h-6 rounded-full bg-blue-600 border-[2.5px] border-white shadow-xl cursor-se-resize hover:scale-125 hover:bg-blue-500 transition-transform z-30 flex items-center justify-center group/handle"
              title="Resize Bottom-Right"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
            </div>
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'ne')}
              className="absolute -right-3 -top-3 w-6 h-6 rounded-full bg-blue-600 border-[2.5px] border-white shadow-xl cursor-ne-resize hover:scale-125 hover:bg-blue-500 transition-transform z-30 flex items-center justify-center group/handle"
              title="Resize Top-Right"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
            </div>
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'sw')}
              className="absolute -left-3 -bottom-3 w-6 h-6 rounded-full bg-blue-600 border-[2.5px] border-white shadow-xl cursor-sw-resize hover:scale-125 hover:bg-blue-500 transition-transform z-30 flex items-center justify-center group/handle"
              title="Resize Bottom-Left"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
            </div>
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'nw')}
              className="absolute -left-3 -top-3 w-6 h-6 rounded-full bg-blue-600 border-[2.5px] border-white shadow-xl cursor-nw-resize hover:scale-125 hover:bg-blue-500 transition-transform z-30 flex items-center justify-center group/handle"
              title="Resize Top-Left"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white pointer-events-none" />
            </div>

            {/* Center Drag Badge */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="px-2.5 py-1 bg-blue-600/90 text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-md">
                <Move className="w-3 h-3" />
                <span>Drag Vendor Layer</span>
              </div>
            </div>
          </div>

          {/* Target Artboard Crop Outline (Green Dashed) */}
          <div
            style={{
              position: 'absolute',
              left: `${cropBoxMm[0] * pxPerMmBrand}px`,
              top: `${cropBoxMm[1] * pxPerMmBrand}px`,
              width: `${cropBoxMm[2] * pxPerMmBrand}px`,
              height: `${cropBoxMm[3] * pxPerMmBrand}px`,
            }}
            className="border-2 border-dashed border-emerald-400 pointer-events-none select-none"
          >
            <div className="absolute top-2 left-2 px-2 py-0.5 bg-emerald-600/80 text-white rounded text-[10px] font-bold tracking-wide uppercase">
              Trim Artboard Region ({cropBoxMm[2].toFixed(1)} × {cropBoxMm[3].toFixed(1)} mm)
            </div>
          </div>
        </div>

        {/* Floating Quick Help Guide */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3.5 rounded-2xl shadow-xl max-w-sm text-xs text-slate-300 pointer-events-none">
          <div className="font-semibold text-white mb-2 flex items-center gap-1.5 text-xs">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>Quick Alignment Tips:</span>
          </div>
          <ul className="space-y-1.5 text-[11px] text-slate-400 leading-relaxed">
            <li>• <b>Drag Vendor</b>: Click & drag floating layer to position over Brand.</li>
            <li>• <b>Resize</b>: Drag any of the <b>4 corner handles</b> in/out to scale.</li>
            <li>• <b>Shift + Wheel</b>: Scroll wheel with Shift to zoom Vendor only.</li>
            <li>• <b>Keyboard</b>: <b>Arrow keys</b> nudge 1px (<b>Shift</b>: 10px, <b>Alt</b>: 0.1px).</li>
            <li>• <b>Scale / Rotate keys</b>: <b>+ / -</b> scale 1%; <b>[ / ]</b> rotate 0.2°.</li>
            <li>• <b>Difference mode</b>: Shift until aligned graphics turn <b>solid black</b>.</li>
          </ul>
        </div>

        {/* Floating Viewport Zoom Controls */}
        <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-xl flex items-center gap-1 z-20">
          <button
            onClick={() => setViewportZoom((z) => Math.max(0.1, z * 0.85))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Zoom Out Viewport"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-slate-300 px-2 min-w-[3rem] text-center">
            {Math.round(viewportZoom * 100)}%
          </span>
          <button
            onClick={() => setViewportZoom((z) => Math.min(8.0, z * 1.15))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Zoom In Viewport"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <button
            onClick={() => {
              if (!containerRef.current) return;
              const { clientWidth, clientHeight } = containerRef.current;
              const fitScaleX = (clientWidth - 80) / brand_shape_px[0];
              const fitScaleY = (clientHeight - 80) / brand_shape_px[1];
              const fit = Math.min(fitScaleX, fitScaleY, 1.0);
              setViewportZoom(fit);
              setViewportPan({
                x: (clientWidth - brand_shape_px[0] * fit) / 2,
                y: (clientHeight - brand_shape_px[1] * fit) / 2,
              });
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert Modal if Submission Fails */}
        {errorMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/40 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs text-red-200 z-50 animate-bounce">
            <span className="font-semibold text-red-300">Error:</span>
            <span>{errorMsg}</span>
            <button
              onClick={() => setErrorMsg(null)}
              className="ml-2 text-slate-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
