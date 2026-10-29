import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Move,
  Layers,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Crosshair,
  Trash2,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { RunStatusResponse } from '../types';

interface AnchorRectMm {
  x1: number; // Left (mm)
  y1: number; // Top (mm)
  x2: number; // Right (mm)
  y2: number; // Bottom (mm)
}

type RectDragMode =
  | 'draw'
  | 'move'
  | 'c1' // Point 1: Top-Left
  | 'c2' // Point 2: Top-Right
  | 'c3' // Point 3: Bottom-Right
  | 'c4' // Point 4: Bottom-Left
  | 'edge_n'
  | 'edge_e'
  | 'edge_s'
  | 'edge_w'
  | 'pan';

export const ManualAlignView: React.FC = () => {
  const {
    manualAlignData,
    manualAlignStep,
    setManualAlignStep,
    setViewMode,
    runStatus,
    setRunStatus,
    setRunId,
    setInspectionType,
    annotations,
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
    vendor_shape_px,
    initial_crop_bbox_mm,
    brand_page,
    vendor_page,
    initial_transform,
  } = manualAlignData;

  const pxPerMmBrand = brand_shape_px[0] / Math.max(brand_size_mm[0], 1e-4);
  const pxPerMmVendor = vendor_shape_px[0] / Math.max(vendor_size_mm[0], 1e-4);

  // Calculate default scale so Vendor matches Brand width if Vendor is much smaller (e.g. A4 scaled net)
  const sizeRatio = brand_size_mm[0] / Math.max(vendor_size_mm[0], 1);
  const isVendorScaledDown = sizeRatio > 2.0;

  // =========================================================================
  // STEP 1 STATE: 4-POINT RECTANGLE PICKER (BEFORE & AFTER SIDE-BY-SIDE)
  // =========================================================================
  const [beforeRectMm, setBeforeRectMm] = useState<AnchorRectMm | null>(null);
  const [afterRectMm, setAfterRectMm] = useState<AnchorRectMm | null>(null);

  const [beforeZoom, setBeforeZoom] = useState(1.0);
  const [beforePan, setBeforePan] = useState({ x: 0, y: 0 });
  const [afterZoom, setAfterZoom] = useState(1.0);
  const [afterPan, setAfterPan] = useState({ x: 0, y: 0 });

  const beforePaneRef = useRef<HTMLDivElement>(null);
  const afterPaneRef = useRef<HTMLDivElement>(null);

  const step1DragRef = useRef<{
    pane: 'before' | 'after' | null;
    mode: RectDragMode | null;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    startMmX: number;
    startMmY: number;
    initialRect: AnchorRectMm | null;
  }>({
    pane: null,
    mode: null,
    startClientX: 0,
    startClientY: 0,
    startPanX: 0,
    startPanY: 0,
    startMmX: 0,
    startMmY: 0,
    initialRect: null,
  });

  const fitBeforePane = useCallback(() => {
    if (!beforePaneRef.current) return;
    const { clientWidth, clientHeight } = beforePaneRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    const fitX = (clientWidth - 48) / brand_shape_px[0];
    const fitY = (clientHeight - 48) / brand_shape_px[1];
    const fit = Math.min(fitX, fitY, 1.0);
    setBeforeZoom(fit);
    setBeforePan({
      x: (clientWidth - brand_shape_px[0] * fit) / 2,
      y: (clientHeight - brand_shape_px[1] * fit) / 2,
    });
  }, [brand_shape_px]);

  const fitAfterPane = useCallback(() => {
    if (!afterPaneRef.current) return;
    const { clientWidth, clientHeight } = afterPaneRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) return;
    const fitX = (clientWidth - 48) / vendor_shape_px[0];
    const fitY = (clientHeight - 48) / vendor_shape_px[1];
    const fit = Math.min(fitX, fitY, 1.0);
    setAfterZoom(fit);
    setAfterPan({
      x: (clientWidth - vendor_shape_px[0] * fit) / 2,
      y: (clientHeight - vendor_shape_px[1] * fit) / 2,
    });
  }, [vendor_shape_px]);

  useEffect(() => {
    if (manualAlignStep === 'pick_points') {
      const id = requestAnimationFrame(() => {
        fitBeforePane();
        fitAfterPane();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [manualAlignStep, fitBeforePane, fitAfterPane]);

  // =========================================================================
  // STEP 2 STATE: FINE-TUNE STAGING ROOM (SHIFT+ZOOM, DRAG, NUDGE)
  // =========================================================================
  const [viewportZoom, setViewportZoom] = useState(1.0);
  const [viewportPan, setViewportPan] = useState({ x: 0, y: 0 });
  const [isPanningViewport, setIsPanningViewport] = useState(false);
  const panStartRef = useRef({ x: 0, y: 0 });

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

  // Check if there is an active inspection session we can return to
  const hasActiveWorkspace = Boolean(
    runStatus?.images?.brand_cropped || runStatus?.images?.single_image
  );

  const handleBack = () => {
    if (hasActiveWorkspace) {
      setViewMode('workspace');
    } else {
      setViewMode('setup');
    }
  };

  // Crop Box state on Brand (in mm) - Never auto-cropped by 4-point anchor
  const [cropBoxMm] = useState<[number, number, number, number]>(
    initial_transform?.crop_bbox_mm &&
      initial_transform.crop_bbox_mm.length === 4 &&
      initial_transform.crop_bbox_mm[2] > 0
      ? [
          initial_transform.crop_bbox_mm[0],
          initial_transform.crop_bbox_mm[1],
          initial_transform.crop_bbox_mm[2],
          initial_transform.crop_bbox_mm[3],
        ]
      : initial_crop_bbox_mm && initial_crop_bbox_mm[2] > 0
      ? initial_crop_bbox_mm
      : [0, 0, brand_size_mm[0], brand_size_mm[1]]
  );

  // Dragging / Transform interactions for Vendor in Step 2
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

  // Auto-fit brand image inside viewport when entering Step 2 (fine_tune)
  useEffect(() => {
    if (manualAlignStep !== 'fine_tune') return;
    const id = requestAnimationFrame(() => {
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
    });
    return () => cancelAnimationFrame(id);
  }, [brand_shape_px, manualAlignStep]);

  // Keyboard micro-nudge listener (only active in Step 2: fine_tune)
  useEffect(() => {
    if (manualAlignStep !== 'fine_tune') return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [manualAlignStep, pxPerMmBrand, scale, offsetXmm, offsetYmm, rotationDeg, vendor_size_mm]);

  // =========================================================================
  // STEP 1 HANDLERS: 4-POINT RECTANGLE INTERACTION & UNIFORM SCALE SOLVER
  // =========================================================================
  const clientToPaneMm = (
    pane: 'before' | 'after',
    clientX: number,
    clientY: number
  ): { xMm: number; yMm: number } => {
    const el = pane === 'before' ? beforePaneRef.current : afterPaneRef.current;
    const pan = pane === 'before' ? beforePan : afterPan;
    const zoom = pane === 'before' ? beforeZoom : afterZoom;
    const pxPerMm = pane === 'before' ? pxPerMmBrand : pxPerMmVendor;

    if (!el) return { xMm: 0, yMm: 0 };
    const rect = el.getBoundingClientRect();
    const imgPxX = (clientX - rect.left - pan.x) / zoom;
    const imgPxY = (clientY - rect.top - pan.y) / zoom;
    return {
      xMm: imgPxX / pxPerMm,
      yMm: imgPxY / pxPerMm,
    };
  };

  const startStep1Interaction = (
    e: React.MouseEvent,
    pane: 'before' | 'after',
    mode: RectDragMode
  ) => {
    e.stopPropagation();
    const currentRect = pane === 'before' ? beforeRectMm : afterRectMm;
    const currentPan = pane === 'before' ? beforePan : afterPan;
    const { xMm, yMm } = clientToPaneMm(pane, e.clientX, e.clientY);

    step1DragRef.current = {
      pane,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: currentPan.x,
      startPanY: currentPan.y,
      startMmX: xMm,
      startMmY: yMm,
      initialRect: currentRect ? { ...currentRect } : null,
    };

    if (mode === 'draw') {
      const sizeMm = pane === 'before' ? brand_size_mm : vendor_size_mm;
      const clampedX = Math.max(0, Math.min(sizeMm[0], xMm));
      const clampedY = Math.max(0, Math.min(sizeMm[1], yMm));
      const initBox: AnchorRectMm = {
        x1: clampedX,
        y1: clampedY,
        x2: clampedX,
        y2: clampedY,
      };
      if (pane === 'before') setBeforeRectMm(initBox);
      else setAfterRectMm(initBox);
    }
  };

  const handleStep1PaneMouseDown = (
    e: React.MouseEvent,
    pane: 'before' | 'after'
  ) => {
    const currentRect = pane === 'before' ? beforeRectMm : afterRectMm;
    // Middle click or when a rectangle already exists -> Pan viewport
    if (e.button === 1 || (e.button === 0 && currentRect !== null)) {
      startStep1Interaction(e, pane, 'pan');
      return;
    }
    if (e.button === 0 && currentRect === null) {
      startStep1Interaction(e, pane, 'draw');
    }
  };

  const handleStep1MouseMove = (e: React.MouseEvent) => {
    const { pane, mode, startClientX, startClientY, startPanX, startPanY, startMmX, startMmY, initialRect } =
      step1DragRef.current;
    if (!pane || !mode) return;

    if (mode === 'pan') {
      const dx = e.clientX - startClientX;
      const dy = e.clientY - startClientY;
      if (pane === 'before') {
        setBeforePan({ x: startPanX + dx, y: startPanY + dy });
      } else {
        setAfterPan({ x: startPanX + dx, y: startPanY + dy });
      }
      return;
    }

    const sizeMm = pane === 'before' ? brand_size_mm : vendor_size_mm;
    const setRect = pane === 'before' ? setBeforeRectMm : setAfterRectMm;
    const { xMm, yMm } = clientToPaneMm(pane, e.clientX, e.clientY);
    const curX = Math.max(0, Math.min(sizeMm[0], xMm));
    const curY = Math.max(0, Math.min(sizeMm[1], yMm));
    const minSpanMm = 1.0;

    if (mode === 'draw') {
      const startX = Math.max(0, Math.min(sizeMm[0], startMmX));
      const startY = Math.max(0, Math.min(sizeMm[1], startMmY));
      setRect({
        x1: Math.min(startX, curX),
        y1: Math.min(startY, curY),
        x2: Math.max(startX, curX),
        y2: Math.max(startY, curY),
      });
      return;
    }

    if (!initialRect) return;

    if (mode === 'move') {
      const dxMm = xMm - startMmX;
      const dyMm = yMm - startMmY;
      const w = initialRect.x2 - initialRect.x1;
      const h = initialRect.y2 - initialRect.y1;
      const nx1 = Math.max(0, Math.min(sizeMm[0] - w, initialRect.x1 + dxMm));
      const ny1 = Math.max(0, Math.min(sizeMm[1] - h, initialRect.y1 + dyMm));
      setRect({
        x1: nx1,
        y1: ny1,
        x2: nx1 + w,
        y2: ny1 + h,
      });
      return;
    }

    // Orthogonal rectangle corner & edge adjustments (keeps lines strictly horizontal & vertical)
    let { x1, y1, x2, y2 } = initialRect;
    if (mode === 'c1') {
      // Point 1: Top-Left (opposite corner 3 (x2, y2) stays fixed)
      x1 = Math.min(curX, x2 - minSpanMm);
      y1 = Math.min(curY, y2 - minSpanMm);
    } else if (mode === 'c2') {
      // Point 2: Top-Right (opposite corner 4 (x1, y2) stays fixed)
      x2 = Math.max(curX, x1 + minSpanMm);
      y1 = Math.min(curY, y2 - minSpanMm);
    } else if (mode === 'c3') {
      // Point 3: Bottom-Right (opposite corner 1 (x1, y1) stays fixed)
      x2 = Math.max(curX, x1 + minSpanMm);
      y2 = Math.max(curY, y1 + minSpanMm);
    } else if (mode === 'c4') {
      // Point 4: Bottom-Left (opposite corner 2 (x2, y1) stays fixed)
      x1 = Math.min(curX, x2 - minSpanMm);
      y2 = Math.max(curY, y1 + minSpanMm);
    } else if (mode === 'edge_n') {
      y1 = Math.min(curY, y2 - minSpanMm);
    } else if (mode === 'edge_s') {
      y2 = Math.max(curY, y1 + minSpanMm);
    } else if (mode === 'edge_w') {
      x1 = Math.min(curX, x2 - minSpanMm);
    } else if (mode === 'edge_e') {
      x2 = Math.max(curX, x1 + minSpanMm);
    }

    setRect({ x1, y1, x2, y2 });
  };

  const handleStep1MouseUp = () => {
    const { pane, mode } = step1DragRef.current;
    if (pane && mode === 'draw') {
      const rect = pane === 'before' ? beforeRectMm : afterRectMm;
      if (rect && (rect.x2 - rect.x1 < 1.0 || rect.y2 - rect.y1 < 1.0)) {
        if (pane === 'before') setBeforeRectMm(null);
        else setAfterRectMm(null);
      }
    }
    step1DragRef.current.pane = null;
    step1DragRef.current.mode = null;
  };

  const handleStep1Wheel = (
    e: React.WheelEvent,
    pane: 'before' | 'after'
  ) => {
    e.preventDefault();
    const el = pane === 'before' ? beforePaneRef.current : afterPaneRef.current;
    if (!el) return;

    const curZoom = pane === 'before' ? beforeZoom : afterZoom;
    const curPan = pane === 'before' ? beforePan : afterPan;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    const newZoom = Math.min(12.0, Math.max(0.05, curZoom * factor));

    const rect = el.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const newPan = {
      x: cursorX - (cursorX - curPan.x) * (newZoom / curZoom),
      y: cursorY - (cursorY - curPan.y) * (newZoom / curZoom),
    };

    if (pane === 'before') {
      setBeforeZoom(newZoom);
      setBeforePan(newPan);
    } else {
      setAfterZoom(newZoom);
      setAfterPan(newPan);
    }
  };

  // Compute uniform scale and offset from the two 4-point rectangles
  const hasValidBothRects = Boolean(
    beforeRectMm &&
      afterRectMm &&
      beforeRectMm.x2 - beforeRectMm.x1 >= 1.0 &&
      beforeRectMm.y2 - beforeRectMm.y1 >= 1.0 &&
      afterRectMm.x2 - afterRectMm.x1 >= 1.0 &&
      afterRectMm.y2 - afterRectMm.y1 >= 1.0
  );

  const previewComputedScale = (() => {
    if (!hasValidBothRects || !beforeRectMm || !afterRectMm) return null;
    const wB = beforeRectMm.x2 - beforeRectMm.x1;
    const hB = beforeRectMm.y2 - beforeRectMm.y1;
    const wA = afterRectMm.x2 - afterRectMm.x1;
    const hA = afterRectMm.y2 - afterRectMm.y1;
    const sx = wB / Math.max(wA, 0.01);
    const sy = hB / Math.max(hA, 0.01);
    return Number(((sx + sy) / 2).toFixed(4));
  })();

  const handleApply4PointsAndProceed = () => {
    if (!beforeRectMm || !afterRectMm) return;

    const wB = beforeRectMm.x2 - beforeRectMm.x1;
    const hB = beforeRectMm.y2 - beforeRectMm.y1;
    const cBx = (beforeRectMm.x1 + beforeRectMm.x2) / 2;
    const cBy = (beforeRectMm.y1 + beforeRectMm.y2) / 2;

    const wA = afterRectMm.x2 - afterRectMm.x1;
    const hA = afterRectMm.y2 - afterRectMm.y1;
    const cAx = (afterRectMm.x1 + afterRectMm.x2) / 2;
    const cAy = (afterRectMm.y1 + afterRectMm.y2) / 2;

    // Uniform scale (average of X and Y ratios so aspect ratio of Vendor is preserved)
    const scaleX = wB / Math.max(wA, 0.01);
    const scaleY = hB / Math.max(hA, 0.01);
    const computedScale = Math.max(0.05, Number(((scaleX + scaleY) / 2).toFixed(4)));

    // Map center of After's 4-point box directly onto center of Before's 4-point box
    const rad = (rotationDeg * Math.PI) / 180;
    const cosT = Math.cos(rad);
    const sinT = Math.sin(rad);

    const computedOffsetX = Number(
      (cBx - computedScale * (cAx * cosT - cAy * sinT)).toFixed(4)
    );
    const computedOffsetY = Number(
      (cBy - computedScale * (cAx * sinT + cAy * cosT)).toFixed(4)
    );

    scaleRef.current = computedScale;
    offsetXRef.current = computedOffsetX;
    offsetYRef.current = computedOffsetY;

    setScale(computedScale);
    setOffsetXmm(computedOffsetX);
    setOffsetYmm(computedOffsetY);
    setManualAlignStep('fine_tune');
  };

  // =========================================================================
  // STEP 2 HANDLERS: FINE-TUNE CANVAS INTERACTION
  // =========================================================================
  const handleViewportMouseDown = (e: React.MouseEvent) => {
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

    const vecMmX = scale * (deltaXCur - deltaXOpp);
    const vecMmY = scale * (deltaYCur - deltaYOpp);

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
      const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;

      const scaleStep = delta < 0 ? 1.03 : 0.97;
      applyScaleAroundCenter(scaleRef.current * scaleStep);
      return;
    }

    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const newZoom = Math.min(10.0, Math.max(0.05, viewportZoom * zoomFactor));

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

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
      if (!annotations || annotations.length === 0) {
        setAnnotations([]);
      }
      setManualAlignData({
        ...manualAlignData,
        initial_transform: {
          offset_x_mm: Number(offsetXmm.toFixed(4)),
          offset_y_mm: Number(offsetYmm.toFixed(4)),
          scale_x: Number(scale.toFixed(6)),
          scale_y: Number(scale.toFixed(6)),
          rotation_deg: Number(rotationDeg.toFixed(3)),
          crop_bbox_mm: [
            Number(cropBoxMm[0].toFixed(2)),
            Number(cropBoxMm[1].toFixed(2)),
            Number(cropBoxMm[2].toFixed(2)),
            Number(cropBoxMm[3].toFixed(2)),
          ],
        },
      });
      // Ensure any subsequent 'Re-align' from 4-frame workspace lands on Step 2 (fine_tune)
      setManualAlignStep('fine_tune');
      resetViewport();
      setViewMode('workspace');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsSubmitting(false);
    }
  };

  // Helper to render the 4-point orthogonal rectangle overlay on Before or After pane
  const renderAnchorRectangle = (
    pane: 'before' | 'after',
    rectMm: AnchorRectMm | null,
    pxPerMm: number,
    paneZoom: number
  ) => {
    if (!rectMm) return null;

    const leftPx = rectMm.x1 * pxPerMm;
    const topPx = rectMm.y1 * pxPerMm;
    const widthPx = Math.max(1, (rectMm.x2 - rectMm.x1) * pxPerMm);
    const heightPx = Math.max(1, (rectMm.y2 - rectMm.y1) * pxPerMm);

    const invScale = 1 / Math.max(paneZoom, 0.05);
    const isBefore = pane === 'before';
    const borderColor = isBefore ? 'border-blue-500' : 'border-emerald-500';
    const bgTint = isBefore ? 'bg-blue-500/10' : 'bg-emerald-500/10';
    const badgeBg = isBefore
      ? 'bg-blue-600 border-white text-white shadow-blue-950/60'
      : 'bg-emerald-600 border-white text-white shadow-emerald-950/60';

    const corners: Array<{
      id: 'c1' | 'c2' | 'c3' | 'c4';
      num: number;
      label: string;
      posStyle: React.CSSProperties;
      badgeOffsetStyle: React.CSSProperties;
      cursor: string;
    }> = [
      {
        id: 'c1',
        num: 1,
        label: 'Point 1: Top-Left',
        posStyle: { left: 0, top: 0 },
        badgeOffsetStyle: { transform: 'translate(-18px, -18px)' },
        cursor: 'cursor-nwse-resize',
      },
      {
        id: 'c2',
        num: 2,
        label: 'Point 2: Top-Right',
        posStyle: { left: '100%', top: 0 },
        badgeOffsetStyle: { transform: 'translate(18px, -18px)' },
        cursor: 'cursor-nesw-resize',
      },
      {
        id: 'c3',
        num: 3,
        label: 'Point 3: Bottom-Right',
        posStyle: { left: '100%', top: '100%' },
        badgeOffsetStyle: { transform: 'translate(18px, 18px)' },
        cursor: 'cursor-nwse-resize',
      },
      {
        id: 'c4',
        num: 4,
        label: 'Point 4: Bottom-Left',
        posStyle: { left: 0, top: '100%' },
        badgeOffsetStyle: { transform: 'translate(-18px, 18px)' },
        cursor: 'cursor-nesw-resize',
      },
    ];

    return (
      <div
        style={{
          position: 'absolute',
          left: `${leftPx}px`,
          top: `${topPx}px`,
          width: `${widthPx}px`,
          height: `${heightPx}px`,
          borderWidth: `${2 * invScale}px`,
        }}
        className={`${borderColor} ${bgTint} pointer-events-none select-none`}
      >
        {/* 4 Straight Orthogonal Edge Drag Bars */}
        <div
          onMouseDown={(e) => startStep1Interaction(e, pane, 'edge_n')}
          style={{ height: `${10 * invScale}px`, top: `${-5 * invScale}px` }}
          className="absolute left-0 right-0 cursor-ns-resize pointer-events-auto"
          title="Drag Top Edge (1-2)"
        />
        <div
          onMouseDown={(e) => startStep1Interaction(e, pane, 'edge_s')}
          style={{ height: `${10 * invScale}px`, bottom: `${-5 * invScale}px` }}
          className="absolute left-0 right-0 cursor-ns-resize pointer-events-auto"
          title="Drag Bottom Edge (4-3)"
        />
        <div
          onMouseDown={(e) => startStep1Interaction(e, pane, 'edge_w')}
          style={{ width: `${10 * invScale}px`, left: `${-5 * invScale}px` }}
          className="absolute top-0 bottom-0 cursor-ew-resize pointer-events-auto"
          title="Drag Left Edge (1-4)"
        />
        <div
          onMouseDown={(e) => startStep1Interaction(e, pane, 'edge_e')}
          style={{ width: `${10 * invScale}px`, right: `${-5 * invScale}px` }}
          className="absolute top-0 bottom-0 cursor-ew-resize pointer-events-auto"
          title="Drag Right Edge (2-3)"
        />

        {/* Center Move Pill */}
        <div
          style={{
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) scale(${invScale})`,
          }}
          className="absolute pointer-events-auto"
        >
          <div
            onMouseDown={(e) => startStep1Interaction(e, pane, 'move')}
            className="px-2 py-0.5 rounded-md bg-slate-900/85 hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-semibold flex items-center gap-1 cursor-move shadow-lg whitespace-nowrap"
            title="Drag to move entire 4-point rectangle"
          >
            <Move className="w-3 h-3 text-blue-400" />
            <span>
              {(rectMm.x2 - rectMm.x1).toFixed(1)} × {(rectMm.y2 - rectMm.y1).toFixed(1)} mm
            </span>
          </div>
        </div>

        {/* 4 Numbered Corner Anchors: 1 (TL), 2 (TR), 3 (BR), 4 (BL) */}
        {corners.map((c) => (
          <div
            key={c.id}
            onMouseDown={(e) => startStep1Interaction(e, pane, c.id)}
            style={{
              ...c.posStyle,
              transform: `translate(-50%, -50%) scale(${invScale})`,
            }}
            className={`absolute w-9 h-9 flex items-center justify-center pointer-events-auto z-30 group ${c.cursor}`}
            title={`${c.label} — Drag to fine-tune corner (keeps strict rectangle)`}
          >
            {/* Exact Corner Crosshair Target (unobstructed view of vertex pixel) */}
            <div className="w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(15,23,42,0.9)] bg-transparent group-hover:scale-125 transition-transform flex items-center justify-center">
              <div className="w-1 h-1 rounded-full bg-amber-400" />
            </div>

            {/* Numbered Badge (1, 2, 3, 4) offset slightly outward so vertex stays visible */}
            <div
              style={c.badgeOffsetStyle}
              className={`absolute w-6 h-6 rounded-full border-2 font-black text-xs flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${badgeBg}`}
            >
              {c.num}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // =========================================================================
  // RENDER STEP 1: 4-POINT ANCHOR SELECTION (SIDE-BY-SIDE BEFORE & AFTER)
  // =========================================================================
  if (manualAlignStep === 'pick_points') {
    return (
      <div
        onMouseMove={handleStep1MouseMove}
        onMouseUp={handleStep1MouseUp}
        className="h-[calc(100vh-3.5rem)] flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden"
      >
        {/* Step 1 Top Header Bar */}
        <div className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 shadow-md z-30">
          {/* Left: Back Button & Step Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleBack}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
              title={hasActiveWorkspace ? 'Back to 4-Way Workspace' : 'Back to Setup'}
            >
              <ArrowLeft className="w-4 h-4 shrink-0" />
              <span>{hasActiveWorkspace ? 'Back to Workspace' : 'Setup'}</span>
            </button>

            <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

            <div className="hidden sm:flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-blue-500/15 border border-blue-500/40 text-blue-300 text-[11px] font-bold">
                Step 1 / 2
              </span>
              <span className="text-xs font-semibold text-slate-200">
                Select 4-Point Anchor Rectangle (1: Top-Left, 2: Top-Right, 3: Bottom-Right, 4: Bottom-Left)
              </span>
            </div>
          </div>

          {/* Center: Live Scale Preview Badge */}
          <div className="flex items-center gap-2">
            {previewComputedScale !== null ? (
              <div className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Auto Scale Ready: <strong className="font-mono text-white">{previewComputedScale.toFixed(3)}×</strong>
                </span>
              </div>
            ) : (
              <div className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 text-xs hidden md:flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5 text-blue-400" />
                <span>
                  Drag a rectangle on <strong>Before</strong> and on <strong>After</strong>, then adjust corners 1–2–3–4
                </span>
              </div>
            )}
          </div>

          {/* Right: Skip or Apply 4 Points */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setManualAlignStep('fine_tune')}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              title="Skip 4-point selection and go directly to Shift+Zoom fine-tuning"
            >
              Skip to Fine-Tune
            </button>

            <button
              onClick={handleApply4PointsAndProceed}
              disabled={!hasValidBothRects}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/25 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
              title={
                hasValidBothRects
                  ? 'Calculate scale & overlay from 4 points and enter Fine-Tune stage'
                  : 'Please draw 4-point rectangles on both Before and After images first'
              }
            >
              <span>Apply 4 Points & Fine-Tune</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Side-by-Side Split Canvas (Method A) */}
        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-800 overflow-hidden">
          {/* LEFT PANE: BEFORE (BRAND) */}
          <div
            ref={beforePaneRef}
            onMouseDown={(e) => handleStep1PaneMouseDown(e, 'before')}
            onWheel={(e) => handleStep1Wheel(e, 'before')}
            className={`relative bg-slate-950 overflow-hidden select-none ${
              beforeRectMm ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            }`}
          >
            {/* Top-Left Pane Header Pill */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
              <span className="text-xs font-bold text-white tracking-wide">
                BEFORE (Old / Brand)
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {beforeRectMm
                  ? '• Drag corners 1-2-3-4 to refine'
                  : '• Click & drag to draw 1-2-3-4 box'}
              </span>
              {beforeRectMm && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setBeforeRectMm(null);
                  }}
                  className="ml-1 px-2 py-0.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Clear and redraw Before 4-point rectangle"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Redraw</span>
                </button>
              )}
            </div>

            {/* Transformed World Container for Before */}
            <div
              style={{
                transform: `translate3d(${beforePan.x}px, ${beforePan.y}px, 0) scale(${beforeZoom})`,
                transformOrigin: '0 0',
                width: `${brand_shape_px[0]}px`,
                height: `${brand_shape_px[1]}px`,
                position: 'absolute',
              }}
              className="shadow-2xl ring-1 ring-slate-800 bg-white"
            >
              <img
                src={brand_image}
                alt="Before (Brand)"
                width={brand_shape_px[0]}
                height={brand_shape_px[1]}
                className="w-full h-full object-fill pointer-events-none select-none"
                draggable={false}
              />
              {renderAnchorRectangle('before', beforeRectMm, pxPerMmBrand, beforeZoom)}
            </div>

            {/* Bottom-Right Zoom Controls for Before */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-xl flex items-center gap-1 z-20"
            >
              <button
                onClick={() => setBeforeZoom((z) => Math.max(0.05, z * 0.85))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom Out Before"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-slate-300 px-1.5 min-w-[2.75rem] text-center">
                {Math.round(beforeZoom * 100)}%
              </span>
              <button
                onClick={() => setBeforeZoom((z) => Math.min(12.0, z * 1.18))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom In Before"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3.5 w-[1px] bg-slate-800 mx-0.5" />
              <button
                onClick={fitBeforePane}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Fit Before to Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* RIGHT PANE: AFTER (VENDOR) */}
          <div
            ref={afterPaneRef}
            onMouseDown={(e) => handleStep1PaneMouseDown(e, 'after')}
            onWheel={(e) => handleStep1Wheel(e, 'after')}
            className={`relative bg-slate-950 overflow-hidden select-none ${
              afterRectMm ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'
            }`}
          >
            {/* Top-Left Pane Header Pill */}
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur-md border border-slate-800 px-3 py-1.5 rounded-xl shadow-lg">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-white tracking-wide">
                AFTER (New / Vendor)
              </span>
              <span className="text-[11px] text-slate-400 hidden sm:inline">
                {afterRectMm
                  ? '• Drag corners 1-2-3-4 to refine'
                  : '• Click & drag to draw 1-2-3-4 box'}
              </span>
              {afterRectMm && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setAfterRectMm(null);
                  }}
                  className="ml-1 px-2 py-0.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
                  title="Clear and redraw After 4-point rectangle"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Redraw</span>
                </button>
              )}
            </div>

            {/* Transformed World Container for After */}
            <div
              style={{
                transform: `translate3d(${afterPan.x}px, ${afterPan.y}px, 0) scale(${afterZoom})`,
                transformOrigin: '0 0',
                width: `${vendor_shape_px[0]}px`,
                height: `${vendor_shape_px[1]}px`,
                position: 'absolute',
              }}
              className="shadow-2xl ring-1 ring-slate-800 bg-white"
            >
              <img
                src={vendor_image}
                alt="After (Vendor)"
                width={vendor_shape_px[0]}
                height={vendor_shape_px[1]}
                className="w-full h-full object-fill pointer-events-none select-none"
                draggable={false}
              />
              {renderAnchorRectangle('after', afterRectMm, pxPerMmVendor, afterZoom)}
            </div>

            {/* Bottom-Right Zoom Controls for After */}
            <div
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute bottom-3 right-3 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-xl flex items-center gap-1 z-20"
            >
              <button
                onClick={() => setAfterZoom((z) => Math.max(0.05, z * 0.85))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom Out After"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="font-mono text-[11px] text-slate-300 px-1.5 min-w-[2.75rem] text-center">
                {Math.round(afterZoom * 100)}%
              </span>
              <button
                onClick={() => setAfterZoom((z) => Math.min(12.0, z * 1.18))}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Zoom In After"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3.5 w-[1px] bg-slate-800 mx-0.5" />
              <button
                onClick={fitAfterPane}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                title="Fit After to Screen"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // RENDER STEP 2: FINE-TUNE STAGING ROOM (SHIFT+ZOOM, DRAG, CONFIRM)
  // =========================================================================
  const vendorRenderW = (vendor_size_mm[0] * pxPerMmBrand) * scale;
  const vendorRenderH = (vendor_size_mm[1] * pxPerMmBrand) * scale;
  const vendorRenderX = offsetXmm * pxPerMmBrand;
  const vendorRenderY = offsetYmm * pxPerMmBrand;

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden">
      {/* Top Controls Toolbar */}
      <div className="h-14 bg-slate-900 border-b border-slate-800 px-3 sm:px-4 flex items-center justify-between gap-2 shrink-0 shadow-md z-30">
        {/* Left: Back Button & Optional 4-Point Setup Button */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleBack}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title={hasActiveWorkspace ? 'Back to 4-Way Workspace' : 'Back to Setup'}
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>
              {hasActiveWorkspace ? 'Back to Workspace' : 'Setup'}
            </span>
          </button>

          <button
            onClick={() => setManualAlignStep('pick_points')}
            className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-blue-300 hover:text-blue-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold shrink-0"
            title="Open 4-Point Anchor Picker (1-2-3-4) on Before & After"
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">4-Point Align</span>
          </button>
        </div>

        {/* Center: Alignment Controls */}
        <div className="flex-1 min-w-0 flex items-center justify-center gap-1.5 xl:gap-2.5 overflow-x-auto no-scrollbar py-1">
          {/* Opacity Slider */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2.5 py-1 rounded-xl border border-slate-800 text-xs shrink-0">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-400 text-[11px] hidden sm:inline">Opacity:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={opacity}
              onChange={(e) => setOpacity(parseFloat(e.target.value))}
              className="w-16 sm:w-20 accent-blue-500 cursor-pointer h-1.5"
            />
            <span className="w-7 font-mono text-[11px] text-slate-300 text-right">
              {Math.round(opacity * 100)}%
            </span>
          </div>

          {/* Blend Mode Selector */}
          <div className="inline-flex p-0.5 bg-slate-950 border border-slate-800 rounded-xl text-xs shrink-0">
            <button
              onClick={() => setBlendMode('difference')}
              className={`px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs ${
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
              className={`px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs ${
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
              className={`px-2 py-1 rounded-lg font-medium transition-colors cursor-pointer text-xs ${
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
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs shrink-0">
            <span className="text-slate-400 text-[11px] hidden sm:inline">Scale:</span>
            <button
              onClick={() => applyScaleAroundCenter(scale - 0.05)}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-slate-300 cursor-pointer"
              title="Scale down"
            >
              -
            </button>
            <span className="font-mono text-xs text-white min-w-[3rem] text-center">
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
          <div className="flex items-center gap-1 bg-slate-950 px-1.5 py-1 rounded-xl border border-slate-800 text-xs shrink-0">
            <button
              onClick={() => setRotationDeg((r) => Number(((r - 90 + 360) % 360).toFixed(1)))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Rotate left 90°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-white w-10 text-center">
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
        <div className="flex items-center gap-2 shrink-0 ml-auto">
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
            className="px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shrink-0"
          >
            Reset
          </button>

          <button
            onClick={handleConfirmAndApply}
            disabled={isSubmitting}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-1.5 cursor-pointer transition-transform hover:scale-105 shrink-0 whitespace-nowrap"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" />
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
            width={brand_shape_px[0]}
            height={brand_shape_px[1]}
            className="absolute inset-0 w-full h-full object-fill pointer-events-none select-none bg-white"
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
