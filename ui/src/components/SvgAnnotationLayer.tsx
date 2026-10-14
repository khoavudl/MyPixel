import React, { useState, useRef, useEffect } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';
import { DefectBox } from '../types';
import { screenDragToCanonicalBox } from '../utils/coordinateTransform';

interface SvgAnnotationLayerProps {
  imageWidth: number;
  imageHeight: number;
  displayedWidth?: number;
  displayedHeight?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export const SvgAnnotationLayer: React.FC<SvgAnnotationLayerProps> = ({
  imageWidth,
  imageHeight,
  displayedWidth,
  displayedHeight,
  containerRef,
}) => {
  const {
    activeTool,
    setActiveTool,
    viewport,
    annotations,
    addAnnotation,
    selectedBoxId,
    setSelectedBoxId,
    hoveredBoxId,
    setHoveredBoxId,
    setActiveEditingBox,
    targetSizeMm,
  } = useInspectionStore();

  const [drawStart, setDrawStart] = useState<{ uPrime: number; vPrime: number } | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{ uPrime: number; vPrime: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Parse target size mm (e.g. "620x250" -> [620, 250])
  const getTargetSizeMm = (): [number, number] => {
    try {
      const parts = targetSizeMm.toLowerCase().replace('mm', '').split(/[x,]/);
      if (parts.length === 2) {
        return [parseFloat(parts[0]) || 620, parseFloat(parts[1]) || 250];
      }
    } catch {
      // fallback
    }
    return [620, 250];
  };

  // Convert mouse event coordinates to normalized screen coordinates [0, 1] x [0, 1]
  const getScreenNormalized = (e: React.MouseEvent<SVGSVGElement> | MouseEvent) => {
    const container = containerRef?.current;
    const dispW = displayedWidth || imageWidth;
    const dispH = displayedHeight || imageHeight;

    if (container) {
      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - viewport.panX) / viewport.zoom;
      const worldY = (mouseY - viewport.panY) / viewport.zoom;

      return {
        uPrime: Math.max(0, Math.min(1, worldX / dispW)),
        vPrime: Math.max(0, Math.min(1, worldY / dispH)),
      };
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { uPrime: 0, vPrime: 0 };
    return {
      uPrime: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      vPrime: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'box') return;
    if (e.button !== 0) return; // Left click only

    e.stopPropagation();
    const pt = getScreenNormalized(e);
    setDrawStart(pt);
    setCurrentDrag(pt);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawStart || activeTool !== 'box') return;
    const pt = getScreenNormalized(e);
    setCurrentDrag(pt);
  };

  const finishDrawing = (endPt?: { uPrime: number; vPrime: number }) => {
    if (!drawStart || activeTool !== 'box') {
      setDrawStart(null);
      setCurrentDrag(null);
      return;
    }

    const dragEnd = endPt || currentDrag || drawStart;
    const canonicalBox = screenDragToCanonicalBox(
      drawStart,
      dragEnd,
      viewport.rotation || 0
    );

    setDrawStart(null);
    setCurrentDrag(null);

    // Minimum box size threshold (at least 0.3% of the image)
    if (canonicalBox.norm_w < 0.003 || canonicalBox.norm_h === 0) return;

    const [tW, tH] = getTargetSizeMm();
    const bbox_mm: [number, number, number, number] = [
      Number((canonicalBox.norm_x * tW).toFixed(2)),
      Number((canonicalBox.norm_y * tH).toFixed(2)),
      Number((canonicalBox.norm_w * tW).toFixed(2)),
      Number((canonicalBox.norm_h * tH).toFixed(2)),
    ];

    const newBox: DefectBox = {
      id: `box-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      norm_x: canonicalBox.norm_x,
      norm_y: canonicalBox.norm_y,
      norm_w: canonicalBox.norm_w,
      norm_h: canonicalBox.norm_h,
      bbox_mm,
      tag: 'content',
      severity: 'major',
      note: '',
      created_at: new Date().toISOString(),
    };

    addAnnotation(newBox);
    setActiveEditingBox(newBox);
    setSelectedBoxId(newBox.id);
    setActiveTool('pan');
  };

  // Listen to window mousemove and mouseup during box creation so drag doesn't drop outside SVG bounds
  useEffect(() => {
    if (!drawStart) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const pt = getScreenNormalized(e);
      setCurrentDrag(pt);
    };

    const handleWindowMouseUp = (e: MouseEvent) => {
      const pt = getScreenNormalized(e);
      finishDrawing(pt);
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [drawStart, currentDrag, viewport]);

  // Compute canonical coordinates of temporary drag box
  const tempBoxCanonical =
    drawStart && currentDrag
      ? screenDragToCanonicalBox(drawStart, currentDrag, viewport.rotation || 0)
      : null;

  const tempBox = tempBoxCanonical
    ? {
        x: tempBoxCanonical.norm_x * imageWidth,
        y: tempBoxCanonical.norm_y * imageHeight,
        w: tempBoxCanonical.norm_w * imageWidth,
        h: tempBoxCanonical.norm_h * imageHeight,
      }
    : null;

  return (
    <svg
      ref={svgRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      className={`absolute inset-0 w-full h-full select-none ${
        activeTool === 'box'
          ? 'pointer-events-auto cursor-crosshair'
          : 'pointer-events-none'
      }`}
    >
      {/* Existing Saved Annotations */}
      {annotations.map((box, index) => {
        const x = box.norm_x * imageWidth;
        const y = box.norm_y * imageHeight;
        const w = box.norm_w * imageWidth;
        const h = box.norm_h * imageHeight;

        const isHovered = hoveredBoxId === box.id;
        const isSelected = selectedBoxId === box.id;

        const colorMap: Record<string, string> = {
          critical: '#ef4444',
          major: '#f97316',
          minor: '#eab308',
        };
        const strokeColor = colorMap[box.severity] || '#3b82f6';

        // Screen-Space Invariant Sizing calculation
        const invZoom = 1 / Math.max(0.01, viewport.zoom);
        const rot = viewport.rotation || 0;
        const badgeH = 18;
        const badgeW = Math.max(32, (index + 1).toString().length * 9 + 18);
        const handleRadius = Math.max(3, Math.min(10, 4 * invZoom));

        return (
          <g
            key={box.id}
            className="cursor-pointer pointer-events-auto transition-opacity"
            onMouseEnter={() => setHoveredBoxId(box.id)}
            onMouseLeave={() => setHoveredBoxId(null)}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedBoxId(box.id);
              setActiveEditingBox(box);
            }}
          >
            {/* Box Rect with non-scaling stroke */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              vectorEffect="non-scaling-stroke"
              fill={isSelected || isHovered ? `${strokeColor}25` : `${strokeColor}10`}
              stroke={strokeColor}
              strokeWidth={isSelected || isHovered ? 3.5 : 2}
              strokeDasharray={isSelected ? '6 3' : 'none'}
              rx={3}
            />

            {/* Corner Handle Indicators */}
            {(isSelected || isHovered) && (
              <g style={{ pointerEvents: 'none' }}>
                <circle cx={x} cy={y} r={handleRadius} fill={strokeColor} />
                <circle cx={x + w} cy={y} r={handleRadius} fill={strokeColor} />
                <circle cx={x} cy={y + h} r={handleRadius} fill={strokeColor} />
                <circle cx={x + w} cy={y + h} r={handleRadius} fill={strokeColor} />
              </g>
            )}

            {/* Badge Pill #ID: Screen-Space Invariant & Counter-Rotated (Always Horizontal & Crisp) */}
            <g
              transform={`translate(${x}, ${y}) scale(${invZoom}) rotate(${-rot}) translate(0, -${badgeH + 4})`}
              className="pointer-events-auto cursor-pointer"
            >
              <rect
                x={0}
                y={0}
                width={badgeW}
                height={badgeH}
                rx={4}
                fill={strokeColor}
                className="shadow-md"
              />
              <text
                x={badgeW / 2}
                y={13}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={11}
                fontWeight="bold"
                fontFamily="ui-monospace, monospace, sans-serif"
              >
                #{index + 1}
              </text>
            </g>
          </g>
        );
      })}

      {/* Temporary Dragging Box */}
      {tempBox && (
        <rect
          x={tempBox.x}
          y={tempBox.y}
          width={tempBox.w}
          height={tempBox.h}
          vectorEffect="non-scaling-stroke"
          fill="rgba(59, 130, 246, 0.2)"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="4 2"
          rx={3}
        />
      )}
    </svg>
  );
};
