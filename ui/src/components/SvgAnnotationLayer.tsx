import React, { useState, useRef } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';
import { DefectBox } from '../types';

interface SvgAnnotationLayerProps {
  imageWidth: number;
  imageHeight: number;
}

export const SvgAnnotationLayer: React.FC<SvgAnnotationLayerProps> = ({
  imageWidth,
  imageHeight,
}) => {
  const {
    activeTool,
    setActiveTool,
    annotations,
    addAnnotation,
    selectedBoxId,
    setSelectedBoxId,
    hoveredBoxId,
    setHoveredBoxId,
    setActiveEditingBox,
    targetSizeMm,
  } = useInspectionStore();

  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDrag, setCurrentDrag] = useState<{ x: number; y: number } | null>(null);

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

  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool !== 'box') return;
    if (e.button !== 0) return; // Left click only

    e.stopPropagation();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setDrawStart({ x: normX, y: normY });
    setCurrentDrag({ x: normX, y: normY });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawStart || activeTool !== 'box') return;

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;

    const normX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const normY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    setCurrentDrag({ x: normX, y: normY });
  };

  const handleMouseUp = () => {
    if (!drawStart || !currentDrag || activeTool !== 'box') {
      setDrawStart(null);
      setCurrentDrag(null);
      return;
    }

    const norm_x = Math.min(drawStart.x, currentDrag.x);
    const norm_y = Math.min(drawStart.y, currentDrag.y);
    const norm_w = Math.abs(currentDrag.x - drawStart.x);
    const norm_h = Math.abs(currentDrag.y - drawStart.y);

    setDrawStart(null);
    setCurrentDrag(null);

    // Minimum box size threshold (at least 0.3% of the image)
    if (norm_w < 0.003 || norm_h === 0) return;

    const [tW, tH] = getTargetSizeMm();
    const bbox_mm: [number, number, number, number] = [
      Number((norm_x * tW).toFixed(2)),
      Number((norm_y * tH).toFixed(2)),
      Number((norm_w * tW).toFixed(2)),
      Number((norm_h * tH).toFixed(2)),
    ];

    const newBox: DefectBox = {
      id: `box-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      norm_x,
      norm_y,
      norm_w,
      norm_h,
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

  // Temporary box during mouse dragging
  const tempBox =
    drawStart && currentDrag
      ? {
          x: Math.min(drawStart.x, currentDrag.x) * imageWidth,
          y: Math.min(drawStart.y, currentDrag.y) * imageHeight,
          w: Math.abs(currentDrag.x - drawStart.x) * imageWidth,
          h: Math.abs(currentDrag.y - drawStart.y) * imageHeight,
        }
      : null;

  return (
    <svg
      ref={svgRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
            {/* Box Rect */}
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill={isSelected || isHovered ? `${strokeColor}25` : `${strokeColor}10`}
              stroke={strokeColor}
              strokeWidth={isSelected || isHovered ? 4 : 2}
              strokeDasharray={isSelected ? '6 3' : 'none'}
              rx={3}
            />

            {/* Corner Handle Indicators */}
            {(isSelected || isHovered) && (
              <>
                <circle cx={x} cy={y} r={4} fill={strokeColor} />
                <circle cx={x + w} cy={y} r={4} fill={strokeColor} />
                <circle cx={x} cy={y + h} r={4} fill={strokeColor} />
                <circle cx={x + w} cy={y + h} r={4} fill={strokeColor} />
              </>
            )}

            {/* Badge Pill #ID */}
            <g transform={`translate(${x}, ${Math.max(16, y - 6)})`}>
              <rect
                x={0}
                y={-14}
                width={Math.max(28, (index + 1).toString().length * 10 + 16)}
                height={16}
                rx={4}
                fill={strokeColor}
              />
              <text
                x={6}
                y={-2}
                fill="#ffffff"
                fontSize={11}
                fontWeight="bold"
                fontFamily="sans-serif"
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
