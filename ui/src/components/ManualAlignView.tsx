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
  } = useInspectionStore();

  if (!manualAlignData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
        <p className="text-base font-semibold text-slate-300 mb-4">
          Chưa có dữ liệu phiên căn chỉnh thủ công.
        </p>
        <button
          onClick={() => setViewMode('setup')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all cursor-pointer"
        >
          Quay lại trang chủ
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
    brand_filename,
    vendor_filename,
    brand_page,
    vendor_page,
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

  const [offsetXmm, setOffsetXmm] = useState(0.0);
  const [offsetYmm, setOffsetYmm] = useState(0.0);
  const [scale, setScale] = useState(isVendorScaledDown ? sizeRatio : 1.0);
  const [rotationDeg, setRotationDeg] = useState(0.0);

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
  const dragStartPosRef = useRef({ x: 0, y: 0, initialOffX: 0, initialOffY: 0, initialScale: 1.0 });

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
        setScale((prev) => Number((prev * 1.01).toFixed(4)));
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        setScale((prev) => Math.max(0.1, Number((prev * 0.99).toFixed(4))));
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
  }, [pxPerMmBrand]);

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
      const dxPx = (e.clientX - dragStartPosRef.current.x) / viewportZoom;
      const initialW = vendor_shape_px[0] * dragStartPosRef.current.initialScale;
      const newScale = Math.max(0.05, (initialW + dxPx * 2) / vendor_shape_px[0]);
      setScale(Number(newScale.toFixed(4)));
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
    };
  };

  // Corner resize drag start
  const handleCornerMouseDown = (e: React.MouseEvent, corner: string) => {
    e.stopPropagation();
    if (e.button !== 0) return;
    setIsTransformingCorner(corner);
    dragStartPosRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialOffX: offsetXmm,
      initialOffY: offsetYmm,
      initialScale: scale,
    };
  };

  // Wheel zoom on canvas viewport
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
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
        throw new Error(errJson.detail || 'Lỗi khi áp dụng căn chỉnh thủ công');
      }

      const statusResponse: RunStatusResponse = await res.json();
      setRunId(run_id);
      setRunStatus(statusResponse);
      setInspectionType('compare');
      setAnnotations([]);
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
            title="Quay lại cài đặt"
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
                  Trạm Căn Chỉnh Thủ Công
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
            <span className="text-slate-400 text-[11px]">Độ mờ:</span>
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
              title="Chế độ đảo màu sai khác: chỗ khớp sẽ biến thành màu đen, chỗ lệch sẽ sáng lên"
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
              title="Chế độ trong suốt bình thường"
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
              title="Chế độ Cyan / Đỏ (Anaglyph)"
            >
              Cyan/Red
            </button>
          </div>

          {/* Scale Control */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <span className="text-slate-400 text-[11px]">Scale:</span>
            <button
              onClick={() => setScale((prev) => Math.max(0.05, Number((prev - 0.05).toFixed(4))))}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-slate-300 cursor-pointer"
            >
              -
            </button>
            <span className="font-mono text-xs text-white min-w-[3.5rem] text-center">
              {scale.toFixed(2)}×
            </span>
            <button
              onClick={() => setScale((prev) => Number((prev + 0.05).toFixed(4)))}
              className="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center font-bold text-slate-300 cursor-pointer"
            >
              +
            </button>
            {isVendorScaledDown && (
              <button
                onClick={() => setScale(Number(sizeRatio.toFixed(4)))}
                className="ml-1 px-1.5 py-0.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded text-[10px] font-medium border border-amber-500/30 cursor-pointer"
                title={`Khớp tỷ lệ A4 về khổ thật (${sizeRatio.toFixed(2)}x)`}
              >
                Khớp A4
              </button>
            )}
          </div>

          {/* Rotation Controls */}
          <div className="flex items-center gap-1 bg-slate-950 px-2 py-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setRotationDeg((r) => Number(((r - 90 + 360) % 360).toFixed(1)))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Xoay trái 90°"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-xs text-white w-11 text-center">
              {rotationDeg.toFixed(1)}°
            </span>
            <button
              onClick={() => setRotationDeg((r) => Number(((r + 90) % 360).toFixed(1)))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              title="Xoay phải 90°"
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
              setScale(isVendorScaledDown ? sizeRatio : 1.0);
              setRotationDeg(0);
            }}
            className="px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            Đặt lại (Reset)
          </button>

          <button
            onClick={handleConfirmAndApply}
            disabled={isSubmitting}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer transition-transform hover:scale-105"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Đang xử lý nắn khít...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác Nhận & Vào Trạm Soi</span>
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
            className="border border-blue-400/80 hover:border-blue-400 group shadow-lg pointer-events-auto"
          >
            <img
              src={vendor_image}
              alt="Vendor Layer"
              className="w-full h-full object-fill pointer-events-none select-none"
              draggable={false}
            />

            {/* Corner Resize Handles */}
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'se')}
              className="absolute -right-2 -bottom-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-se-resize hover:scale-125 transition-transform"
            />
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'ne')}
              className="absolute -right-2 -top-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-ne-resize hover:scale-125 transition-transform"
            />
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'sw')}
              className="absolute -left-2 -bottom-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-sw-resize hover:scale-125 transition-transform"
            />
            <div
              onMouseDown={(e) => handleCornerMouseDown(e, 'nw')}
              className="absolute -left-2 -top-2 w-4 h-4 rounded-full bg-blue-500 border-2 border-white shadow-md cursor-nw-resize hover:scale-125 transition-transform"
            />

            {/* Center Drag Badge */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="px-2 py-1 bg-blue-600/90 text-white rounded-md text-[10px] font-bold flex items-center gap-1 shadow-md">
                <Move className="w-3 h-3" />
                <span>Kéo di chuyển Vendor</span>
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
              Vùng Artboard Thành Phẩm ({cropBoxMm[2].toFixed(1)} × {cropBoxMm[3].toFixed(1)} mm)
            </div>
          </div>
        </div>

        {/* Floating Quick Help Guide */}
        <div className="absolute bottom-4 left-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-2xl shadow-xl max-w-sm text-xs text-slate-300 pointer-events-none">
          <div className="font-semibold text-white mb-1.5 flex items-center gap-1.5 text-xs">
            <Info className="w-3.5 h-3.5 text-blue-400" />
            <span>Mẹo căn khít nhanh:</span>
          </div>
          <ul className="space-y-1 text-[11px] text-slate-400 leading-relaxed">
            <li>• Bấm giữ chuột vào <b>Vendor</b> để kéo di chuyển đến vị trí Brand.</li>
            <li>• Kéo <b>chấm tròn ở 4 góc</b> để phóng to/thu nhỏ kích thước.</li>
            <li>• Bàn phím: <b>Mũi tên</b> nhích 1px (giữ <b>Shift</b>: 10px, <b>Alt</b>: 0.1px).</li>
            <li>• Phím <b>[ / ]</b> để xoay nhẹ $0.2^\circ$; phím <b>+ / -</b> để co dãn $1\%$.</li>
            <li>• Chế độ <b>Difference</b>: Di chuyển đến khi hình <b>chìm vào màu đen</b> là chuẩn!</li>
          </ul>
        </div>

        {/* Floating Viewport Zoom Controls */}
        <div className="absolute bottom-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-800 p-1 rounded-xl shadow-xl flex items-center gap-1 z-20">
          <button
            onClick={() => setViewportZoom((z) => Math.max(0.1, z * 0.85))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Thu nhỏ Viewport"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-slate-300 px-2 min-w-[3rem] text-center">
            {Math.round(viewportZoom * 100)}%
          </span>
          <button
            onClick={() => setViewportZoom((z) => Math.min(8.0, z * 1.15))}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
            title="Phóng to Viewport"
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
            title="Vừa màn hình (Fit)"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Error Alert Modal if Submission Fails */}
        {errorMsg && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-950/90 border border-red-500/40 px-4 py-2.5 rounded-xl shadow-2xl flex items-center gap-2 text-xs text-red-200 z-50 animate-bounce">
            <span className="font-semibold text-red-300">Lỗi:</span>
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
