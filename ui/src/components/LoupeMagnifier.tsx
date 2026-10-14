import React, { useEffect } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';

interface LoupeMagnifierProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageUrl?: string | null;
  imageWidth: number;
  imageHeight: number;
}

export const LoupeMagnifier: React.FC<LoupeMagnifierProps> = ({
  containerRef,
  imageUrl,
  imageWidth,
  imageHeight,
}) => {
  const {
    activeTool,
    viewport,
    targetSizeMm,
    loupeNormalizedPos,
    setLoupeNormalizedPos,
    loupeScaleFactor,
  } = useInspectionStore();

  const LENS_SIZE = 190;
  const LENS_RADIUS = LENS_SIZE / 2;
  const relativeFactor = loupeScaleFactor || 3.0;
  const effectiveZoom = Math.max(0.05, viewport.zoom * relativeFactor);

  // Listen to mousemove inside this container to broadcast normalized position to all 4 screens
  useEffect(() => {
    if (activeTool !== 'loupe') {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const inBounds =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;

      if (!inBounds) return;

      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - viewport.panX) / viewport.zoom;
      const wy = (my - viewport.panY) / viewport.zoom;

      if (wx >= 0 && wx <= imageWidth && wy >= 0 && wy <= imageHeight) {
        setLoupeNormalizedPos({
          x: wx / imageWidth,
          y: wy / imageHeight,
        });
      } else {
        setLoupeNormalizedPos(null);
      }
    };

    const handleMouseLeave = () => {
      setLoupeNormalizedPos(null);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [activeTool, containerRef, viewport, imageWidth, imageHeight, setLoupeNormalizedPos]);

  // If tool is not loupe, no pos is set, or no image, don't render lens
  if (activeTool !== 'loupe' || !loupeNormalizedPos || !imageUrl) {
    return null;
  }

  const container = containerRef.current;
  if (!container) return null;

  // Calculate coordinates in this container's view
  const wx = loupeNormalizedPos.x * imageWidth;
  const wy = loupeNormalizedPos.y * imageHeight;

  const screenX = wx * viewport.zoom + viewport.panX;
  const screenY = wy * viewport.zoom + viewport.panY;

  const cWidth = container.clientWidth;
  const cHeight = container.clientHeight;

  // Only render if within or near this container's visible bounds
  if (
    screenX < -LENS_RADIUS ||
    screenX > cWidth + LENS_RADIUS ||
    screenY < -LENS_RADIUS ||
    screenY > cHeight + LENS_RADIUS
  ) {
    return null;
  }

  // Calculate physical coordinates in mm
  const [targetW, targetH] = (() => {
    try {
      const parts = targetSizeMm.toLowerCase().replace('mm', '').split(/[x,]/);
      return [parseFloat(parts[0]) || 620, parseFloat(parts[1]) || 250];
    } catch {
      return [620, 250];
    }
  })();

  const posXmm = (loupeNormalizedPos.x * targetW).toFixed(2);
  const posYmm = (loupeNormalizedPos.y * targetH).toFixed(2);

  // Background position for relative magnification:
  // wx and wy are scaled by effectiveZoom in the lens
  const bgX = -wx * effectiveZoom + LENS_RADIUS;
  const bgY = -wy * effectiveZoom + LENS_RADIUS;

  return (
    <div
      style={{
        width: LENS_SIZE,
        height: LENS_SIZE,
        left: screenX - LENS_RADIUS,
        top: screenY - LENS_RADIUS,
        backgroundImage: `url(${imageUrl})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${imageWidth * effectiveZoom}px ${imageHeight * effectiveZoom}px`,
        backgroundPosition: `${bgX}px ${bgY}px`,
      }}
      className="absolute pointer-events-none rounded-full border-4 border-cyan-400 shadow-2xl z-40 overflow-hidden ring-4 ring-black/40 backdrop-blur-none"
    >
      {/* Central Crosshair */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full h-[1px] bg-red-500/70" />
        <div className="h-full w-[1px] bg-red-500/70 absolute" />
        <div className="w-2 h-2 rounded-full border border-red-500/90 absolute" />
      </div>

      {/* Pill: Zoom factor & Physical location */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full bg-slate-950/90 border border-slate-700 text-[10px] font-mono text-cyan-300 shadow font-bold whitespace-nowrap flex items-center gap-1.5">
        <span>{relativeFactor.toFixed(1)}x ({Math.round(effectiveZoom * 100)}%)</span>
        <span className="text-slate-500">•</span>
        <span>{posXmm}, {posYmm} mm</span>
      </div>
    </div>
  );
};
