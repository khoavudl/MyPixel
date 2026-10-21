import React, { useRef, useState, useCallback, useEffect } from 'react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';
import { Loader2, Copy, Check, Trash2, Scissors, AlertTriangle, X, Square } from 'lucide-react';
import { StepBadgeColor } from '../../types/pdfGuide';

const COLOR_MAP: Record<StepBadgeColor, { bg: string; border: string; text: string; shadow: string }> = {
  blue: { bg: 'bg-blue-600', border: 'border-blue-400', text: 'text-white', shadow: 'shadow-blue-600/40' },
  red: { bg: 'bg-rose-600', border: 'border-rose-400', text: 'text-white', shadow: 'shadow-rose-600/40' },
  green: { bg: 'bg-emerald-600', border: 'border-emerald-400', text: 'text-white', shadow: 'shadow-emerald-600/40' },
  amber: { bg: 'bg-amber-500', border: 'border-amber-300', text: 'text-slate-950 font-black', shadow: 'shadow-amber-500/40' },
  purple: { bg: 'bg-purple-600', border: 'border-purple-400', text: 'text-white', shadow: 'shadow-purple-600/40' },
};

const SHAPE_COLORS: Record<StepBadgeColor, { stroke: string; fill: string }> = {
  blue: { stroke: '#3b82f6', fill: 'rgba(59, 130, 246, 0.22)' },
  red: { stroke: '#f43f5e', fill: 'rgba(244, 63, 94, 0.22)' },
  green: { stroke: '#10b981', fill: 'rgba(168, 85, 247, 0.22)' },
  amber: { stroke: '#f59e0b', fill: 'rgba(245, 158, 11, 0.22)' },
  purple: { stroke: '#a855f7', fill: 'rgba(168, 85, 247, 0.22)' },
};

const COLOR_OPTIONS: { id: StepBadgeColor; bg: string }[] = [
  { id: 'blue', bg: 'bg-blue-600' },
  { id: 'red', bg: 'bg-rose-600' },
  { id: 'green', bg: 'bg-emerald-600' },
  { id: 'amber', bg: 'bg-amber-500' },
  { id: 'purple', bg: 'bg-purple-600' },
];

type DragMode = 'move' | 'nw' | 'ne' | 'se' | 'sw' | 'tail' | 'head' | 'step' | null;

export const PdfGuideCanvas: React.FC = () => {
  const {
    pageImageUrl,
    isLoadingPage,
    zoom,
    panX,
    panY,
    setZoom,
    setPan,
    activeTool,
    activeColor,
    steps,
    addStep,
    updateStep,
    removeStep,
    shapes,
    addShape,
    updateShape,
    removeShape,
    selectedStepId,
    setSelectedStepId,
    selectedShapeId,
    setSelectedShapeId,
    deleteSelected,
    cropPage,
    hoveredStepId,
    setHoveredStepId,
    badgeSize,
    currentPage,
    docInfo,
    setCanvasWidth,
  } = usePdfGuideStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Pan interaction state
  const [isSpaceDown, setIsSpaceDown] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // 2-Click Arrow state
  const [arrowPendingStart, setArrowPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [drawingShape, setDrawingShape] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const justFinishedDrawingRef = useRef(false);

  // 2-Click Text Box state
  const [textPendingStart, setTextPendingStart] = useState<{ x: number; y: number } | null>(null);

  // 2-Click Crop state
  const [cropPendingStart, setCropPendingStart] = useState<{ x: number; y: number } | null>(null);
  const [cropBox, setCropBox] = useState<{ startX: number; startY: number; curX: number; curY: number } | null>(null);
  const [isCropFinalized, setIsCropFinalized] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showCropConfirm, setShowCropConfirm] = useState(false);
  const [isCropping, setIsCropping] = useState(false);

  // Object Transformation (Move & Resize handles)
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragOriginNorm, setDragOriginNorm] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [initialShapeData, setInitialShapeData] = useState<any>(null);
  const [initialStepData, setInitialStepData] = useState<any>(null);

  // Text Box editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Sync rendered canvas artwork width to store for 1:1 proportional PDF export
  useEffect(() => {
    const el = imageRef.current;
    if (!el) return;
    const updateWidth = () => {
      if (el.clientWidth > 50) {
        setCanvasWidth(el.clientWidth);
      }
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(updateWidth);
      ro.observe(el);
      return () => ro.disconnect();
    }
  }, [pageImageUrl, docInfo, setCanvasWidth]);

  // Space key listener for Panning & Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow typing in textareas / inputs without triggering shortcuts
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpaceDown(true);
        return;
      }

      // Undo / Redo shortcuts (Ctrl+Z, Cmd+Z, Ctrl+Shift+Z, Cmd+Shift+Z, Ctrl+Y, Cmd+Y)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          usePdfGuideStore.getState().redo();
        } else {
          usePdfGuideStore.getState().undo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        usePdfGuideStore.getState().redo();
        return;
      }

      if (e.key === 's' || e.key === 'S') {
        usePdfGuideStore.getState().setActiveTool('step');
      } else if (e.key === 'a' || e.key === 'A') {
        usePdfGuideStore.getState().setActiveTool('arrow');
      } else if (e.key === 'b' || e.key === 'B') {
        usePdfGuideStore.getState().setActiveTool('box');
      } else if (e.key === 'x' || e.key === 'X') {
        usePdfGuideStore.getState().setActiveTool('blur');
      } else if (e.key === 't' || e.key === 'T') {
        usePdfGuideStore.getState().setActiveTool('text');
      } else if (e.key === 'c' || e.key === 'C') {
        usePdfGuideStore.getState().setActiveTool('crop');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        deleteSelected();
      } else if (e.key === 'Escape') {
        setCropBox(null);
        setCropPendingStart(null);
        setIsCropFinalized(false);
        setShowCropConfirm(false);
        setArrowPendingStart(null);
        setTextPendingStart(null);
        setDrawingShape(null);
        setSelectedStepId(null);
        setSelectedShapeId(null);
        setEditingTextId(null);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceDown(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [deleteSelected, setSelectedShapeId, setSelectedStepId]);

  // Helper to get normalized mouse coordinate [0..1] on image
  const getNormCoord = (e: React.MouseEvent) => {
    const img = imageRef.current;
    if (!img) return null;
    const r = img.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    const y = Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
    return { x, y };
  };

  // Mouse Down handler
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 && e.button !== 1) return;

    // Pan via Space or Middle click or Pan tool
    if (isSpaceDown || activeTool === 'pan' || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
      return;
    }

    const norm = getNormCoord(e);
    if (!norm) return;

    // 1. STEP MARKER TOOL: 1-click drops auto-increment badge
    if (activeTool === 'step') {
      addStep(norm.x, norm.y);
      return;
    }

    // 2. ARROW, BOX & BLUR TOOLS: Drag-to-draw (press -> drag -> release to finalize immediately)
    if (activeTool === 'arrow' || activeTool === 'box' || activeTool === 'blur') {
      setArrowPendingStart(null);
      setDrawingShape({ x1: norm.x, y1: norm.y, x2: norm.x, y2: norm.y });
      return;
    }

    // 4. TEXT BOX TOOL: 2-click rectangle interaction (like Crop)
    if (activeTool === 'text') {
      if (!textPendingStart) {
        // Click 1: defines corner 1!
        setTextPendingStart({ x: norm.x, y: norm.y });
        setDrawingShape({ x1: norm.x, y1: norm.y, x2: norm.x, y2: norm.y });
      } else {
        // Click 2: defines corner 2 and finalizes Text Box!
        let x1 = Math.min(textPendingStart.x, norm.x);
        let y1 = Math.min(textPendingStart.y, norm.y);
        let x2 = Math.max(textPendingStart.x, norm.x);
        let y2 = Math.max(textPendingStart.y, norm.y);

        // If clicked too small or in place, give it a comfortable readable default size
        if (x2 - x1 < 0.015) x2 = Math.min(1, x1 + 0.18);
        if (y2 - y1 < 0.015) y2 = Math.min(1, y1 + 0.07);

        const newId = addShape({
          type: 'text',
          color: activeColor,
          norm_x1: x1,
          norm_y1: y1,
          norm_x2: x2,
          norm_y2: y2,
          text: 'Note text',
          font_size: 14,
        });

        setTextPendingStart(null);
        setDrawingShape(null);
        setSelectedShapeId(newId);
        setEditingTextId(newId);
        // Auto-switch to pan so clicking around does not spawn duplicate text boxes
        usePdfGuideStore.getState().setActiveTool('pan');
      }
      return;
    }

    // 5. CROP TOOL: 2-click interaction
    if (activeTool === 'crop') {
      if (!cropPendingStart && !isCropFinalized) {
        // Click 1: defines corner 1!
        setCropPendingStart({ x: norm.x, y: norm.y });
        setCropBox({ startX: norm.x, startY: norm.y, curX: norm.x, curY: norm.y });
        setIsCropFinalized(false);
        setShowCropConfirm(false);
      } else if (cropPendingStart) {
        // Click 2: defines corner 2 and finalizes!
        const dx = Math.abs(norm.x - cropPendingStart.x);
        const dy = Math.abs(norm.y - cropPendingStart.y);
        if (dx > 0.005 && dy > 0.005) {
          setCropBox({ startX: cropPendingStart.x, startY: cropPendingStart.y, curX: norm.x, curY: norm.y });
          setIsCropFinalized(true);
        } else {
          setCropBox(null);
        }
        setCropPendingStart(null);
      }
    }
  };

  // Mouse Move handler
  const handleMouseMove = (e: React.MouseEvent) => {
    // 1. Panning
    if (isPanning) {
      setPan(e.clientX - panStart.x, e.clientY - panStart.y);
      return;
    }

    const norm = getNormCoord(e);
    if (!norm) return;

    // 2. Object Transformation (Move / Resize)
    if (dragMode && (selectedShapeId || selectedStepId)) {
      if (dragMode === 'step' && selectedStepId) {
        const dx = norm.x - dragOriginNorm.x;
        const dy = norm.y - dragOriginNorm.y;
        if (initialStepData) {
          updateStep(selectedStepId, {
            norm_x: Math.max(0, Math.min(1, initialStepData.norm_x + dx)),
            norm_y: Math.max(0, Math.min(1, initialStepData.norm_y + dy)),
          });
        }
        return;
      }

      if (selectedShapeId && initialShapeData) {
        const dx = norm.x - dragOriginNorm.x;
        const dy = norm.y - dragOriginNorm.y;

        if (dragMode === 'move') {
          const w = initialShapeData.norm_x2 - initialShapeData.norm_x1;
          const h = initialShapeData.norm_y2 - initialShapeData.norm_y1;
          let newX1 = initialShapeData.norm_x1 + dx;
          let newY1 = initialShapeData.norm_y1 + dy;
          let newX2 = newX1 + w;
          let newY2 = newY1 + h;

          updateShape(selectedShapeId, {
            norm_x1: Math.max(0, Math.min(1, newX1)),
            norm_y1: Math.max(0, Math.min(1, newY1)),
            norm_x2: Math.max(0, Math.min(1, newX2)),
            norm_y2: Math.max(0, Math.min(1, newY2)),
          });
        } else if (dragMode === 'nw') {
          const maxX = initialShapeData.norm_x2 - 0.02;
          const maxY = initialShapeData.norm_y2 - 0.02;
          updateShape(selectedShapeId, {
            norm_x1: Math.max(0, Math.min(norm.x, maxX)),
            norm_y1: Math.max(0, Math.min(norm.y, maxY)),
          });
        } else if (dragMode === 'ne') {
          const minX = initialShapeData.norm_x1 + 0.02;
          const maxY = initialShapeData.norm_y2 - 0.02;
          updateShape(selectedShapeId, {
            norm_x2: Math.min(1, Math.max(norm.x, minX)),
            norm_y1: Math.max(0, Math.min(norm.y, maxY)),
          });
        } else if (dragMode === 'se') {
          const minX = initialShapeData.norm_x1 + 0.02;
          const minY = initialShapeData.norm_y1 + 0.02;
          updateShape(selectedShapeId, {
            norm_x2: Math.min(1, Math.max(norm.x, minX)),
            norm_y2: Math.min(1, Math.max(norm.y, minY)),
          });
        } else if (dragMode === 'sw') {
          const maxX = initialShapeData.norm_x2 - 0.02;
          const minY = initialShapeData.norm_y1 + 0.02;
          updateShape(selectedShapeId, {
            norm_x1: Math.max(0, Math.min(norm.x, maxX)),
            norm_y2: Math.min(1, Math.max(norm.y, minY)),
          });
        } else if (dragMode === 'tail') {
          updateShape(selectedShapeId, { norm_x1: norm.x, norm_y1: norm.y });
        } else if (dragMode === 'head') {
          updateShape(selectedShapeId, { norm_x2: norm.x, norm_y2: norm.y });
        }
        return;
      }
    }

    // 3. Text Box moving (waiting for Click 2)
    if (textPendingStart) {
      setDrawingShape({
        x1: textPendingStart.x,
        y1: textPendingStart.y,
        x2: norm.x,
        y2: norm.y,
      });
      return;
    }

    // 4. Arrow / Box / Blur drag-to-draw
    if (drawingShape && (activeTool === 'arrow' || activeTool === 'box' || activeTool === 'blur')) {
      setDrawingShape((prev) => (prev ? { ...prev, x2: norm.x, y2: norm.y } : null));
      return;
    }

    // 5. Crop rubber-band (waiting for Click 2)
    if (cropPendingStart) {
      setCropBox({
        startX: cropPendingStart.x,
        startY: cropPendingStart.y,
        curX: norm.x,
        curY: norm.y,
      });
    }
  };

  // Mouse Up handler
  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }

    if (dragMode) {
      setDragMode(null);
      setInitialShapeData(null);
      setInitialStepData(null);
    }

    // Finalize drag-to-draw for Arrow (drag & release immediately creates the arrow)
    if (drawingShape && activeTool === 'arrow') {
      const dx = Math.abs(drawingShape.x2 - drawingShape.x1);
      const dy = Math.abs(drawingShape.y2 - drawingShape.y1);
      if (dx > 0.003 || dy > 0.003) {
        addShape({
          type: 'arrow',
          color: activeColor,
          norm_x1: drawingShape.x1,
          norm_y1: drawingShape.y1,
          norm_x2: drawingShape.x2,
          norm_y2: drawingShape.y2,
        });
        justFinishedDrawingRef.current = true;
        setTimeout(() => {
          justFinishedDrawingRef.current = false;
        }, 50);
      }
      setArrowPendingStart(null);
      setDrawingShape(null);
    }

    // Finalize drag-to-draw for Box and Blur
    if (drawingShape && (activeTool === 'box' || activeTool === 'blur')) {
      const dx = Math.abs(drawingShape.x2 - drawingShape.x1);
      const dy = Math.abs(drawingShape.y2 - drawingShape.y1);
      if (dx > 0.005 || dy > 0.005) {
        addShape({
          type: activeTool,
          color: activeColor,
          norm_x1: Math.min(drawingShape.x1, drawingShape.x2),
          norm_y1: Math.min(drawingShape.y1, drawingShape.y2),
          norm_x2: Math.max(drawingShape.x1, drawingShape.x2),
          norm_y2: Math.max(drawingShape.y1, drawingShape.y2),
          has_fill: false, // Default box is no-fill (only border)
        });
      }
      setDrawingShape(null);
    }

    // Support drag-to-draw for Text tool (drag & release)
    if (drawingShape && activeTool === 'text' && textPendingStart) {
      const dx = Math.abs(drawingShape.x2 - drawingShape.x1);
      const dy = Math.abs(drawingShape.y2 - drawingShape.y1);
      if (dx > 0.015 && dy > 0.015) {
        const x1 = Math.min(drawingShape.x1, drawingShape.x2);
        const y1 = Math.min(drawingShape.y1, drawingShape.y2);
        const x2 = Math.max(drawingShape.x1, drawingShape.x2);
        const y2 = Math.max(drawingShape.y1, drawingShape.y2);
        const newId = addShape({
          type: 'text',
          color: activeColor,
          norm_x1: x1,
          norm_y1: y1,
          norm_x2: x2,
          norm_y2: y2,
          text: 'Note text',
          font_size: 14,
        });
        setTextPendingStart(null);
        setDrawingShape(null);
        setSelectedShapeId(newId);
        setEditingTextId(newId);
        usePdfGuideStore.getState().setActiveTool('pan');
      }
    }

    // Support drag-to-draw for Crop tool (drag & release)
    if (activeTool === 'crop' && cropPendingStart && cropBox) {
      const dx = Math.abs(cropBox.curX - cropPendingStart.x);
      const dy = Math.abs(cropBox.curY - cropPendingStart.y);
      if (dx > 0.01 && dy > 0.01) {
        setIsCropFinalized(true);
        setCropPendingStart(null);
      }
    }
  };

  // Wheel zoom handler
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
      setZoom((prev) => Math.max(0.15, Math.min(8.0, prev * zoomFactor)));
    },
    [setZoom]
  );

  // Copy cropped region to clipboard & immediately dismiss box
  const handleCopyCrop = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cropBox || !imageRef.current) return;
    const img = imageRef.current;

    const x0 = Math.min(cropBox.startX, cropBox.curX);
    const y0 = Math.min(cropBox.startY, cropBox.curY);
    const w = Math.abs(cropBox.curX - cropBox.startX);
    const h = Math.abs(cropBox.curY - cropBox.startY);

    if (w < 0.005 || h < 0.005) return;

    try {
      const canvas = document.createElement('canvas');
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;

      const cropPxX = x0 * naturalW;
      const cropPxY = y0 * naturalH;
      const cropPxW = w * naturalW;
      const cropPxH = h * naturalH;

      canvas.width = Math.max(1, Math.round(cropPxW));
      canvas.height = Math.max(1, Math.round(cropPxH));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(img, cropPxX, cropPxY, cropPxW, cropPxH, 0, 0, canvas.width, canvas.height);

      let copySuccess = false;
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
        try {
          const blobPromise = new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas export failed'))), 'image/png');
          });
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blobPromise }),
          ]);
          copySuccess = true;
        } catch (clipErr) {
          console.warn('Direct clipboard write failed, trying fallback:', clipErr);
        }
      }

      // If clipboard was blocked or unsupported, download snippet PNG directly
      if (!copySuccess) {
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `crop_p${currentPage}_${Date.now()}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      setIsCopied(true);
      setTimeout(() => {
        setIsCopied(false);
        setCropBox(null);
        setCropPendingStart(null);
        setIsCropFinalized(false);
      }, 500);
    } catch (err) {
      console.error('Failed to copy crop:', err);
    }
  };

  // Perform permanent PDF Page Crop
  const handleConfirmCropPage = async () => {
    if (!cropBox) return;
    setIsCropping(true);
    const x1 = Math.min(cropBox.startX, cropBox.curX);
    const y1 = Math.min(cropBox.startY, cropBox.curY);
    const x2 = Math.max(cropBox.startX, cropBox.curX);
    const y2 = Math.max(cropBox.startY, cropBox.curY);

    try {
      await cropPage(x1, y1, x2, y2);
      setCropBox(null);
      setCropPendingStart(null);
      setIsCropFinalized(false);
      setShowCropConfirm(false);
    } catch (err) {
      console.error(err);
    } finally {
      setIsCropping(false);
    }
  };

  // Start dragging handle or object body
  const startDrag = (
    e: React.MouseEvent,
    mode: DragMode,
    targetType: 'shape' | 'step',
    id: string
  ) => {
    // If a 2-click drawing operation is in progress, let the canvas handle the click to finalize it
    if (arrowPendingStart || textPendingStart || cropPendingStart || activeTool === 'crop') {
      return;
    }
    e.stopPropagation();
    const norm = getNormCoord(e);
    if (!norm) return;
    setDragMode(mode);
    setDragOriginNorm(norm);

    if (targetType === 'shape') {
      const sh = shapes.find((s) => s.id === id);
      setInitialShapeData(sh ? { ...sh } : null);
      setSelectedShapeId(id);
    } else {
      const st = steps.find((s) => s.id === id);
      setInitialStepData(st ? { ...st } : null);
      setSelectedStepId(id);
    }
  };

  // Selected items
  const selectedStep = steps.find((s) => s.id === selectedStepId);
  const selectedShape = shapes.find((s) => s.id === selectedShapeId);

  // Floating toolbar positioning for Selected Shape (smart boundary flip & clamp)
  let shapeToolbarLeft = 50;
  let shapeToolbarTop = 50;
  let shapeTransformX = '-50%';
  let shapeTransformY = 'calc(-100% - 12px)';
  let shapeTransformOrigin = 'bottom center';

  if (selectedShape) {
    const minX = Math.min(selectedShape.norm_x1, selectedShape.norm_x2);
    const maxX = Math.max(selectedShape.norm_x1, selectedShape.norm_x2);
    const minY = Math.min(selectedShape.norm_y1, selectedShape.norm_y2);
    const maxY = Math.max(selectedShape.norm_y1, selectedShape.norm_y2);
    const midX = (minX + maxX) / 2;

    // Check if near top edge of page (minY < 0.12): flip to BELOW shape
    const isNearTop = minY < 0.12;
    shapeToolbarTop = (isNearTop ? maxY : minY) * 100;
    shapeTransformY = isNearTop ? '12px' : 'calc(-100% - 12px)';

    // Check horizontal edges to prevent clipping on left or right
    if (midX < 0.22) {
      shapeToolbarLeft = Math.max(0.01, minX) * 100;
      shapeTransformX = '0%';
      shapeTransformOrigin = isNearTop ? 'top left' : 'bottom left';
    } else if (midX > 0.78) {
      shapeToolbarLeft = Math.min(0.99, maxX) * 100;
      shapeTransformX = '-100%';
      shapeTransformOrigin = isNearTop ? 'top right' : 'bottom right';
    } else {
      shapeToolbarLeft = midX * 100;
      shapeTransformX = '-50%';
      shapeTransformOrigin = isNearTop ? 'top center' : 'bottom center';
    }
  }

  // Floating toolbar positioning for Selected Step Badge
  let stepToolbarLeft = 50;
  let stepToolbarTop = 50;
  let stepTransformX = '-50%';
  let stepTransformY = `calc(-100% - ${badgeSize / 2 + 12}px)`;
  let stepTransformOrigin = 'bottom center';

  if (selectedStep) {
    const isNearTop = selectedStep.norm_y < 0.12;
    stepToolbarTop = selectedStep.norm_y * 100;
    stepTransformY = isNearTop ? `calc(${badgeSize / 2 + 12}px)` : `calc(-100% - ${badgeSize / 2 + 12}px)`;

    if (selectedStep.norm_x < 0.22) {
      stepToolbarLeft = Math.max(0.01, selectedStep.norm_x) * 100;
      stepTransformX = '0%';
      stepTransformOrigin = isNearTop ? 'top left' : 'bottom left';
    } else if (selectedStep.norm_x > 0.78) {
      stepToolbarLeft = Math.min(0.99, selectedStep.norm_x) * 100;
      stepTransformX = '-100%';
      stepTransformOrigin = isNearTop ? 'top right' : 'bottom right';
    } else {
      stepToolbarLeft = selectedStep.norm_x * 100;
      stepTransformX = '-50%';
      stepTransformOrigin = isNearTop ? 'top center' : 'bottom center';
    }
  }

  // Crop popup positioning (smart boundary check)
  let cropPopupTop: string | undefined = undefined;
  let cropPopupBottom: string | undefined = '-48px';
  let cropPopupLeft: string | undefined = '0px';
  let cropPopupRight: string | undefined = undefined;
  let cropTransformOrigin = 'top left';

  if (cropBox) {
    const minX = Math.min(cropBox.startX, cropBox.curX);
    const maxX = Math.max(cropBox.startX, cropBox.curX);
    const maxY = Math.max(cropBox.startY, cropBox.curY);

    // If near bottom of page (> 80%), flip to top of crop rectangle
    if (maxY > 0.8) {
      cropPopupTop = '-48px';
      cropPopupBottom = undefined;
      cropTransformOrigin = 'bottom left';
    }

    // If near right edge of page (> 65%), align to right of crop rectangle
    if (minX > 0.55 || maxX > 0.85) {
      cropPopupLeft = undefined;
      cropPopupRight = '0px';
      cropTransformOrigin = maxY > 0.8 ? 'bottom right' : 'top right';
    }
  }

  // Current page size in mm
  const curPage = docInfo?.pages.find((p) => p.page_number === currentPage);
  const pageWmm = curPage?.width_mm || 210;
  const pageHmm = curPage?.height_mm || 297;

  // Determine canvas cursor
  const getCanvasCursor = () => {
    if (isSpaceDown || activeTool === 'pan') {
      return isPanning ? 'cursor-grabbing' : 'cursor-grab';
    }
    if (activeTool === 'step') return 'cursor-crosshair';
    if (activeTool === 'arrow') return arrowPendingStart ? 'cursor-crosshair' : 'cursor-default';
    if (activeTool === 'crop') return cropPendingStart ? 'cursor-crosshair' : 'cursor-default';
    if (activeTool === 'text') return textPendingStart ? 'cursor-crosshair' : 'cursor-crosshair';
    return 'cursor-crosshair';
  };

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      onClick={() => {
        if (!drawingShape && !cropBox && !arrowPendingStart && !cropPendingStart) {
          setSelectedStepId(null);
          setSelectedShapeId(null);
          setEditingTextId(null);
        }
      }}
      className={`flex-1 relative overflow-hidden bg-slate-950 flex items-center justify-center select-none ${getCanvasCursor()}`}
    >
      {/* Background grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle, #fff 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      {isLoadingPage && (
        <div className="absolute inset-0 z-40 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 shadow-xl text-slate-200 text-sm">
            <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            Rendering High-DPI Page {currentPage}...
          </div>
        </div>
      )}

      {/* GPU-Accelerated Canvas Container */}
      <div
        className="relative will-change-transform transition-transform duration-75 origin-center"
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${zoom})`,
        }}
      >
        {pageImageUrl ? (
          <div className="relative shadow-2xl rounded-sm overflow-visible bg-white ring-1 ring-slate-800">
            {/* The PDF High-DPI Page Image */}
            <img
              ref={imageRef}
              crossOrigin="anonymous"
              src={pageImageUrl}
              alt={`Page ${currentPage}`}
              className="max-h-[82vh] max-w-[82vw] object-contain block select-none pointer-events-none"
              style={{
                imageRendering: 'auto',
              }}
              draggable={false}
              onLoad={(e) => {
                const target = e.currentTarget;
                if (target && target.clientWidth > 50) {
                  setCanvasWidth(target.clientWidth);
                }
              }}
            />

            {/* SVG Layer for Shapes (Interactive, Clickable, Selectable, Resizable) */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{ overflow: 'visible' }}
            >
              <defs>
                {(['blue', 'red', 'green', 'amber', 'purple'] as StepBadgeColor[]).map((c) => (
                  <marker
                    key={c}
                    id={`arrowhead-${c}`}
                    viewBox="0 0 10 10"
                    refX="6"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill={SHAPE_COLORS[c].stroke} />
                  </marker>
                ))}
              </defs>

              {/* Render Saved Shapes */}
              {shapes.map((s) => {
                const isSelected = selectedShapeId === s.id;
                const col = SHAPE_COLORS[s.color] || SHAPE_COLORS.blue;

                if (s.type === 'arrow') {
                  return (
                    <g
                      key={s.id}
                      className="pointer-events-auto cursor-move"
                      onMouseDown={(e) => startDrag(e, 'move', 'shape', s.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (justFinishedDrawingRef.current) return;
                        setSelectedShapeId(s.id);
                      }}
                    >
                      {/* Thick transparent hit-box for easy grabbing */}
                      <line
                        x1={`${s.norm_x1 * 100}%`}
                        y1={`${s.norm_y1 * 100}%`}
                        x2={`${s.norm_x2 * 100}%`}
                        y2={`${s.norm_y2 * 100}%`}
                        stroke="transparent"
                        strokeWidth={18 / zoom}
                      />
                      {/* Visible Arrow */}
                      <line
                        x1={`${s.norm_x1 * 100}%`}
                        y1={`${s.norm_y1 * 100}%`}
                        x2={`${s.norm_x2 * 100}%`}
                        y2={`${s.norm_y2 * 100}%`}
                        stroke={col.stroke}
                        strokeWidth={(isSelected ? 3.5 : 2.5) / zoom}
                        markerEnd={`url(#arrowhead-${s.color})`}
                        strokeLinecap="round"
                      />
                      {/* Interactive Resize Handles at Tail and Head */}
                      {isSelected && (
                        <>
                          <circle
                            cx={`${s.norm_x1 * 100}%`}
                            cy={`${s.norm_y1 * 100}%`}
                            r={6 / zoom}
                            fill="#fff"
                            stroke={col.stroke}
                            strokeWidth={2 / zoom}
                            className="cursor-crosshair pointer-events-auto"
                            onMouseDown={(e) => startDrag(e, 'tail', 'shape', s.id)}
                          />
                          <circle
                            cx={`${s.norm_x2 * 100}%`}
                            cy={`${s.norm_y2 * 100}%`}
                            r={6 / zoom}
                            fill="#fff"
                            stroke={col.stroke}
                            strokeWidth={2 / zoom}
                            className="cursor-crosshair pointer-events-auto"
                            onMouseDown={(e) => startDrag(e, 'head', 'shape', s.id)}
                          />
                        </>
                      )}
                    </g>
                  );
                }

                if (s.type === 'box') {
                  const x = Math.min(s.norm_x1, s.norm_x2) * 100;
                  const y = Math.min(s.norm_y1, s.norm_y2) * 100;
                  const w = Math.abs(s.norm_x2 - s.norm_x1) * 100;
                  const h = Math.abs(s.norm_y2 - s.norm_y1) * 100;
                  const isFilled = Boolean(s.has_fill);
                  const sw = s.stroke_width || 2;

                  return (
                    <g key={s.id} className="pointer-events-auto">
                      <rect
                        x={`${x}%`}
                        y={`${y}%`}
                        width={`${w}%`}
                        height={`${h}%`}
                        stroke={col.stroke}
                        strokeWidth={(isSelected ? sw + 1.5 : sw) / zoom}
                        fill={isFilled ? col.fill : 'transparent'}
                        pointerEvents={
                          isFilled || isSelected || activeTool === 'pan' || activeTool === 'box'
                            ? 'all'
                            : 'visibleStroke'
                        }
                        rx={4 / zoom}
                        strokeDasharray={isSelected ? `${6 / zoom} ${4 / zoom}` : undefined}
                        className="cursor-move pointer-events-auto"
                        onMouseDown={(e) => startDrag(e, 'move', 'shape', s.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (justFinishedDrawingRef.current) return;
                          setSelectedShapeId(s.id);
                        }}
                      />
                      {/* 4 Corner Resize Handles */}
                      {isSelected && (
                        <>
                          <circle cx={`${x}%`} cy={`${y}%`} r={5 / zoom} fill="#fff" stroke={col.stroke} strokeWidth={2 / zoom} className="cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'nw', 'shape', s.id)} />
                          <circle cx={`${x + w}%`} cy={`${y}%`} r={5 / zoom} fill="#fff" stroke={col.stroke} strokeWidth={2 / zoom} className="cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'ne', 'shape', s.id)} />
                          <circle cx={`${x + w}%`} cy={`${y + h}%`} r={5 / zoom} fill="#fff" stroke={col.stroke} strokeWidth={2 / zoom} className="cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'se', 'shape', s.id)} />
                          <circle cx={`${x}%`} cy={`${y + h}%`} r={5 / zoom} fill="#fff" stroke={col.stroke} strokeWidth={2 / zoom} className="cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'sw', 'shape', s.id)} />
                        </>
                      )}
                    </g>
                  );
                }

                if (s.type === 'blur') {
                  const x = Math.min(s.norm_x1, s.norm_x2) * 100;
                  const y = Math.min(s.norm_y1, s.norm_y2) * 100;
                  const w = Math.abs(s.norm_x2 - s.norm_x1) * 100;
                  const h = Math.abs(s.norm_y2 - s.norm_y1) * 100;

                  return (
                    <g key={s.id} className="pointer-events-auto">
                      <rect
                        x={`${x}%`}
                        y={`${y}%`}
                        width={`${w}%`}
                        height={`${h}%`}
                        fill="#020617"
                        fillOpacity="0.95"
                        stroke={isSelected ? '#38bdf8' : '#475569'}
                        strokeWidth={(isSelected ? 2 : 1) / zoom}
                        strokeDasharray={isSelected ? `${4 / zoom} ${3 / zoom}` : `${3 / zoom} ${3 / zoom}`}
                        className="cursor-move pointer-events-auto"
                        onMouseDown={(e) => startDrag(e, 'move', 'shape', s.id)}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (justFinishedDrawingRef.current) return;
                          setSelectedShapeId(s.id);
                        }}
                      />
                      {/* Corner Handles */}
                      {isSelected && (
                        <>
                          <circle cx={`${x}%`} cy={`${y}%`} r={5 / zoom} fill="#fff" stroke="#38bdf8" strokeWidth={2 / zoom} className="cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'nw', 'shape', s.id)} />
                          <circle cx={`${x + w}%`} cy={`${y}%`} r={5 / zoom} fill="#fff" stroke="#38bdf8" strokeWidth={2 / zoom} className="cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'ne', 'shape', s.id)} />
                          <circle cx={`${x + w}%`} cy={`${y + h}%`} r={5 / zoom} fill="#fff" stroke="#38bdf8" strokeWidth={2 / zoom} className="cursor-nwse-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'se', 'shape', s.id)} />
                          <circle cx={`${x}%`} cy={`${y + h}%`} r={5 / zoom} fill="#fff" stroke="#38bdf8" strokeWidth={2 / zoom} className="cursor-nesw-resize pointer-events-auto" onMouseDown={(e) => startDrag(e, 'sw', 'shape', s.id)} />
                        </>
                      )}
                    </g>
                  );
                }

                if (s.type === 'text') {
                  // Rendered via HTML overlay below for seamless inline editing, dragging & handles
                  return null;
                }

                return null;
              })}

              {/* Render Shape currently being drawn */}
              {drawingShape && (
                <>
                  {activeTool === 'arrow' && (
                    <line
                      x1={`${drawingShape.x1 * 100}%`}
                      y1={`${drawingShape.y1 * 100}%`}
                      x2={`${drawingShape.x2 * 100}%`}
                      y2={`${drawingShape.y2 * 100}%`}
                      stroke={SHAPE_COLORS[activeColor].stroke}
                      strokeWidth={2.5 / zoom}
                      markerEnd={`url(#arrowhead-${activeColor})`}
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                    />
                  )}
                  {activeTool === 'box' && (
                    <rect
                      x={`${Math.min(drawingShape.x1, drawingShape.x2) * 100}%`}
                      y={`${Math.min(drawingShape.y1, drawingShape.y2) * 100}%`}
                      width={`${Math.abs(drawingShape.x2 - drawingShape.x1) * 100}%`}
                      height={`${Math.abs(drawingShape.y2 - drawingShape.y1) * 100}%`}
                      stroke={SHAPE_COLORS[activeColor].stroke}
                      strokeWidth={2 / zoom}
                      fill="none"
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                    />
                  )}
                  {activeTool === 'text' && (
                    <rect
                      x={`${Math.min(drawingShape.x1, drawingShape.x2) * 100}%`}
                      y={`${Math.min(drawingShape.y1, drawingShape.y2) * 100}%`}
                      width={`${Math.abs(drawingShape.x2 - drawingShape.x1) * 100}%`}
                      height={`${Math.abs(drawingShape.y2 - drawingShape.y1) * 100}%`}
                      stroke={SHAPE_COLORS[activeColor].stroke}
                      strokeWidth={2 / zoom}
                      fill="rgba(255, 255, 255, 0.75)"
                      strokeDasharray={`${4 / zoom} ${4 / zoom}`}
                      rx={3 / zoom}
                    />
                  )}
                  {activeTool === 'blur' && (
                    <rect
                      x={`${Math.min(drawingShape.x1, drawingShape.x2) * 100}%`}
                      y={`${Math.min(drawingShape.y1, drawingShape.y2) * 100}%`}
                      width={`${Math.abs(drawingShape.x2 - drawingShape.x1) * 100}%`}
                      height={`${Math.abs(drawingShape.y2 - drawingShape.y1) * 100}%`}
                      fill="#020617"
                      fillOpacity="0.8"
                      stroke="#cbd5e1"
                      strokeWidth={1 / zoom}
                    />
                  )}
                </>
              )}
            </svg>

            {/* HTML Overlay for Text Boxes (Inline editing, dragging, and resize handles) */}
            {shapes
              .filter((s) => s.type === 'text')
              .map((s) => {
                const x = Math.min(s.norm_x1, s.norm_x2) * 100;
                const y = Math.min(s.norm_y1, s.norm_y2) * 100;
                const w = Math.abs(s.norm_x2 - s.norm_x1) * 100;
                const h = Math.abs(s.norm_y2 - s.norm_y1) * 100;
                const isSelected = selectedShapeId === s.id;
                const isEditing = editingTextId === s.id;
                const col = SHAPE_COLORS[s.color] || SHAPE_COLORS.blue;

                return (
                  <div
                    key={s.id}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      if (isEditing) return; // Allow mouse actions inside textarea when editing
                      startDrag(e, 'move', 'shape', s.id);
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedShapeId(s.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setEditingTextId(s.id);
                    }}
                    className={`absolute rounded transition-shadow pointer-events-auto select-none ${
                      isEditing
                        ? 'ring-2 ring-blue-500 shadow-xl cursor-text'
                        : isSelected
                        ? 'ring-2 ring-blue-400 shadow-lg cursor-move'
                        : 'cursor-move hover:ring-1 hover:ring-slate-400 shadow-xs'
                    }`}
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      width: `${w}%`,
                      height: `${h}%`,
                      backgroundColor: 'rgba(255, 255, 255, 0.95)',
                      border: `1.5px solid ${col.stroke}`,
                      zIndex: isSelected || isEditing ? 35 : 20,
                    }}
                  >
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={s.text || ''}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateShape(s.id, { text: e.target.value })}
                        onBlur={() => setEditingTextId(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingTextId(null);
                          }
                        }}
                        placeholder="Type note..."
                        className="w-full h-full bg-white text-slate-900 font-semibold p-1.5 resize-none focus:outline-none border-0 rounded leading-tight"
                        style={{ fontSize: `${s.font_size || 14}px` }}
                      />
                    ) : (
                      <div
                        className="w-full h-full font-semibold select-none break-words overflow-hidden leading-tight p-1.5 cursor-move"
                        style={{
                          color: col.stroke,
                          fontSize: `${s.font_size || 14}px`,
                        }}
                      >
                        {s.text || 'Double click to edit'}
                      </div>
                    )}

                    {/* 4 Corner Resize Handles when Selected (and not editing) */}
                    {isSelected && !isEditing && (
                      <>
                        <div
                          onMouseDown={(e) => startDrag(e, 'nw', 'shape', s.id)}
                          className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize z-40 pointer-events-auto shadow-sm"
                          title="Resize top-left"
                        />
                        <div
                          onMouseDown={(e) => startDrag(e, 'ne', 'shape', s.id)}
                          className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nesw-resize z-40 pointer-events-auto shadow-sm"
                          title="Resize top-right"
                        />
                        <div
                          onMouseDown={(e) => startDrag(e, 'se', 'shape', s.id)}
                          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nwse-resize z-40 pointer-events-auto shadow-sm"
                          title="Resize bottom-right"
                        />
                        <div
                          onMouseDown={(e) => startDrag(e, 'sw', 'shape', s.id)}
                          className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border-2 border-blue-500 rounded-full cursor-nesw-resize z-40 pointer-events-auto shadow-sm"
                          title="Resize bottom-left"
                        />
                      </>
                    )}
                  </div>
                );
              })}

            {/* Badges Overlay (Draggable & Selectable) */}
            {steps.map((s) => {
              const isSelected = selectedStepId === s.id;
              const isHovered = hoveredStepId === s.id;
              const colorStyle = COLOR_MAP[s.color] || COLOR_MAP.blue;

              return (
                <div
                  key={s.id}
                  onMouseDown={(e) => startDrag(e, 'step', 'step', s.id)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedStepId(s.id);
                  }}
                  onMouseEnter={() => setHoveredStepId(s.id)}
                  onMouseLeave={() => setHoveredStepId(null)}
                  className="absolute cursor-move transition-transform pointer-events-auto"
                  style={{
                    left: `${s.norm_x * 100}%`,
                    top: `${s.norm_y * 100}%`,
                    transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                    transformOrigin: 'center center',
                    zIndex: isSelected ? 35 : 20,
                  }}
                >
                  <div
                    className={`rounded-full flex items-center justify-center border-2 shadow-lg select-none font-bold transition-all ${
                      colorStyle.bg
                    } ${colorStyle.border} ${colorStyle.text} ${colorStyle.shadow} ${
                      isSelected
                        ? 'ring-4 ring-white ring-offset-2 ring-offset-slate-900 scale-110'
                        : isHovered
                        ? 'scale-105 ring-2 ring-white/60'
                        : ''
                    }`}
                    style={{
                      width: `${badgeSize}px`,
                      height: `${badgeSize}px`,
                      fontSize: `${Math.max(10, Math.round(badgeSize * 0.44))}px`,
                    }}
                  >
                    {s.step_number}
                  </div>
                </div>
              );
            })}

            {/* Floating Mini Action Toolbar for Selected STEP BADGE */}
            {selectedStep && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-40 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 pointer-events-auto"
                style={{
                  left: `${stepToolbarLeft}%`,
                  top: `${stepToolbarTop}%`,
                  transform: `translate(${stepTransformX}, ${stepTransformY}) scale(${1 / zoom})`,
                  transformOrigin: stepTransformOrigin,
                }}
              >
                <span className="text-[11px] font-bold text-white whitespace-nowrap">
                  Step {selectedStep.step_number}
                </span>

                <div className="h-3 w-px bg-slate-700" />

                {/* Color picker */}
                <div className="flex items-center gap-1">
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => updateStep(selectedStep.id, { color: c.id })}
                      className={`w-3.5 h-3.5 rounded-full ${c.bg} transition ${
                        selectedStep.color === c.id ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                      }`}
                    />
                  ))}
                </div>

                <div className="h-3 w-px bg-slate-700" />

                {/* Delete button */}
                <button
                  onClick={() => removeStep(selectedStep.id)}
                  title="Delete this step badge (Backspace)"
                  className="p-1 rounded hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Floating Mini Action Toolbar for Selected SHAPE (Arrow, Box, Blur, Text) */}
            {selectedShape && (
              <div
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-40 bg-slate-900/95 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-slate-700 shadow-2xl flex items-center gap-2 pointer-events-auto"
                style={{
                  left: `${shapeToolbarLeft}%`,
                  top: `${shapeToolbarTop}%`,
                  transform: `translate(${shapeTransformX}, ${shapeTransformY}) scale(${1 / zoom})`,
                  transformOrigin: shapeTransformOrigin,
                }}
              >
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300 whitespace-nowrap">
                  {selectedShape.type}
                </span>

                <div className="h-3 w-px bg-slate-700" />

                {/* Color picker */}
                {selectedShape.type !== 'blur' && (
                  <div className="flex items-center gap-1">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => updateShape(selectedShape.id, { color: c.id })}
                        className={`w-3.5 h-3.5 rounded-full ${c.bg} transition ${
                          selectedShape.color === c.id ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Box Fill / No Fill toggle & Border Thickness */}
                {selectedShape.type === 'box' && (
                  <>
                    <div className="h-3 w-px bg-slate-700" />
                    <button
                      onClick={() => updateShape(selectedShape.id, { has_fill: !selectedShape.has_fill })}
                      title={selectedShape.has_fill ? 'Fill: Tint (Click for No Fill)' : 'Fill: None (Click for Tint Fill)'}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1 border transition cursor-pointer ${
                        selectedShape.has_fill
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                    >
                      <Square className={`w-3 h-3 ${selectedShape.has_fill ? 'fill-current' : ''}`} />
                      <span>{selectedShape.has_fill ? 'Filled' : 'No Fill'}</span>
                    </button>

                    {/* Border Thickness Controls (- width +) */}
                    <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-700">
                      <span className="text-[10px] text-slate-400 font-medium mr-0.5">Border:</span>
                      <button
                        onClick={() => {
                          const cur = selectedShape.stroke_width || 2;
                          updateShape(selectedShape.id, { stroke_width: Math.max(1, cur - 1) });
                        }}
                        className="w-4 h-4 rounded hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                        title="Thinner Border (-1px)"
                      >
                        -
                      </button>
                      <span className="text-[11px] font-mono font-bold text-white px-1">
                        {selectedShape.stroke_width || 2}px
                      </span>
                      <button
                        onClick={() => {
                          const cur = selectedShape.stroke_width || 2;
                          updateShape(selectedShape.id, { stroke_width: Math.min(12, cur + 1) });
                        }}
                        className="w-4 h-4 rounded hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                        title="Thicker Border (+1px)"
                      >
                        +
                      </button>
                    </div>
                  </>
                )}

                {/* Text Box Font Size Controls (- fontsize +) */}
                {selectedShape.type === 'text' && (
                  <>
                    <div className="h-3 w-px bg-slate-700" />
                    <div className="flex items-center gap-1 bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-700">
                      <button
                        onClick={() => {
                          const cur = selectedShape.font_size || 14;
                          updateShape(selectedShape.id, { font_size: Math.max(8, cur - 2) });
                        }}
                        className="w-4 h-4 rounded hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                        title="Decrease Font Size (-2px)"
                      >
                        -
                      </button>
                      <span className="text-[11px] font-mono font-bold text-white px-1">
                        {selectedShape.font_size || 14}px
                      </span>
                      <button
                        onClick={() => {
                          const cur = selectedShape.font_size || 14;
                          updateShape(selectedShape.id, { font_size: Math.min(64, cur + 2) });
                        }}
                        className="w-4 h-4 rounded hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold flex items-center justify-center cursor-pointer"
                        title="Increase Font Size (+2px)"
                      >
                        +
                      </button>
                    </div>
                  </>
                )}

                <div className="h-3 w-px bg-slate-700" />

                {/* Delete button */}
                <button
                  onClick={() => removeShape(selectedShape.id)}
                  title="Delete this markup (Backspace)"
                  className="p-1 rounded hover:bg-rose-500/20 text-slate-300 hover:text-rose-400 transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* CROP OVERLAY & DUAL ACTIONS MENU */}
            {activeTool === 'crop' && cropBox && (
              <div
                className="absolute border-2 border-dashed border-amber-400 bg-amber-400/20 pointer-events-auto"
                style={{
                  left: `${Math.min(cropBox.startX, cropBox.curX) * 100}%`,
                  top: `${Math.min(cropBox.startY, cropBox.curY) * 100}%`,
                  width: `${Math.abs(cropBox.curX - cropBox.startX) * 100}%`,
                  height: `${Math.abs(cropBox.curY - cropBox.startY) * 100}%`,
                }}
              >
                {/* Popup Action Menu: Only appears AFTER click 2 finalizes the crop rectangle! */}
                {isCropFinalized && (
                  <div
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    className="absolute flex items-center gap-2 bg-slate-900/95 backdrop-blur-md px-3 py-1.5 rounded-xl border border-slate-700 shadow-2xl z-50 pointer-events-auto"
                    style={{
                      top: cropPopupTop,
                      bottom: cropPopupBottom,
                      left: cropPopupLeft,
                      right: cropPopupRight,
                      transform: `scale(${1 / zoom})`,
                      transformOrigin: cropTransformOrigin,
                    }}
                  >
                    {/* Dimensions in mm */}
                    <div className="text-[11px] font-mono font-bold text-amber-300 whitespace-nowrap pr-1 border-r border-slate-700">
                      {Math.round(Math.abs(cropBox.curX - cropBox.startX) * pageWmm)} × {Math.round(Math.abs(cropBox.curY - cropBox.startY) * pageHmm)} mm
                    </div>

                    {!showCropConfirm ? (
                      <>
                        {/* Option 1: Copy to Clipboard ➔ Box vanishes immediately */}
                        <button
                          onClick={handleCopyCrop}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow transition whitespace-nowrap cursor-pointer"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{isCopied ? 'Copied to Clipboard!' : 'Copy to Clipboard'}</span>
                        </button>

                        {/* Option 2: Crop PDF Page directly */}
                        <button
                          onClick={() => setShowCropConfirm(true)}
                          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition whitespace-nowrap cursor-pointer"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                          <span>Crop PDF Page</span>
                        </button>

                        {/* Cancel button */}
                        <button
                          onClick={() => {
                            setCropBox(null);
                            setCropPendingStart(null);
                            setIsCropFinalized(false);
                          }}
                          className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                          title="Cancel Crop"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      /* Confirmation Dialog for Permanent PDF Crop */
                      <div className="flex items-center gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-amber-300 font-medium">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>Crop Page {currentPage} to this area?</span>
                        </div>
                        <button
                          onClick={handleConfirmCropPage}
                          disabled={isCropping}
                          className="px-2.5 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold transition disabled:opacity-50"
                        >
                          {isCropping ? 'Cropping...' : 'Yes, Crop'}
                        </button>
                        <button
                          onClick={() => setShowCropConfirm(false)}
                          disabled={isCropping}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-slate-500 text-sm">No page loaded</div>
        )}
      </div>

      {/* Floating Instructions / Mode Indicator */}
      <div className="absolute bottom-4 left-4 z-20 pointer-events-none">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 backdrop-blur border border-slate-800 text-[11px] text-slate-300">
          <span className="font-semibold text-white uppercase tracking-wider text-[10px]">
            Mode: {activeTool}
          </span>
          <span className="text-slate-500">•</span>
          {activeTool === 'pan' && <span>Hold Space to pan • Click any item to move or resize handles</span>}
          {activeTool === 'step' && <span>Click anywhere on PDF to stamp ① ② ③ badges • Drag to reposition</span>}
          {activeTool === 'arrow' && (
            <span>
              Drag to draw arrow (or click tail then click head) • Drag endpoints to adjust
            </span>
          )}
          {activeTool === 'box' && <span>Drag to draw outline box (No Fill) • Click to resize or toggle fill</span>}
          {activeTool === 'blur' && <span>Drag to draw permanent redact box • Click to resize corners or move</span>}
          {activeTool === 'text' && (
            <span>
              {textPendingStart
                ? 'Click 2: Place opposite corner to finalize Text Box'
                : 'Click 1: Place first corner of Text Box (like Crop)'}
            </span>
          )}
          {activeTool === 'crop' && (
            <span>
              {cropPendingStart
                ? 'Click 2: Place opposite corner to finalize rectangle'
                : 'Click 1: Place first corner of crop box'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
