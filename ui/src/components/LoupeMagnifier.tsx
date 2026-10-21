import React, { useEffect } from 'react';
import { useInspectionStore } from '../store/useInspectionStore';
import { screenToCanonical, canonicalToScreen } from '../utils/coordinateTransform';

interface LoupeMagnifierProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  imageUrl?: string | null;
  imageWidth: number;
  imageHeight: number;
  displayedWidth?: number;
  displayedHeight?: number;
}

export const LoupeMagnifier: React.FC<LoupeMagnifierProps> = ({
  containerRef,
  imageUrl,
  imageWidth,
  imageHeight,
  displayedWidth,
  displayedHeight,
}) => {
  const {
    activeTool,
    viewport,
    loupeNormalizedPos,
    setLoupeNormalizedPos,
    loupeScaleFactor,
  } = useInspectionStore();

  const LENS_SIZE = 190;
  const LENS_RADIUS = LENS_SIZE / 2;
  const relativeFactor = loupeScaleFactor || 3.0;
  const effectiveZoom = Math.max(0.05, viewport.zoom * relativeFactor);

  const dispW = displayedWidth || imageWidth;
  const dispH = displayedHeight || imageHeight;
  const rot = viewport.rotation || 0;

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
      const wxPrime = (mx - viewport.panX) / viewport.zoom;
      const wyPrime = (my - viewport.panY) / viewport.zoom;

      if (wxPrime >= 0 && wxPrime <= dispW && wyPrime >= 0 && wyPrime <= dispH) {
        const uPrime = wxPrime / dispW;
        const vPrime = wyPrime / dispH;
        const canonical = screenToCanonical(uPrime, vPrime, rot);
        setLoupeNormalizedPos({
          x: canonical.u,
          y: canonical.v,
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
  }, [activeTool, containerRef, viewport, dispW, dispH, rot, setLoupeNormalizedPos]);

  // If tool is not loupe, no pos is set, or no image, don't render lens
  if (activeTool !== 'loupe' || !loupeNormalizedPos || !imageUrl) {
    return null;
  }

  const container = containerRef.current;
  if (!container) return null;

  // Calculate coordinates in this container's view
  const { uPrime, vPrime } = canonicalToScreen(
    loupeNormalizedPos.x,
    loupeNormalizedPos.y,
    rot
  );

  const screenX = uPrime * dispW * viewport.zoom + viewport.panX;
  const screenY = vPrime * dispH * viewport.zoom + viewport.panY;

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

  const wx = loupeNormalizedPos.x * imageWidth;
  const wy = loupeNormalizedPos.y * imageHeight;

  return (
    <div
      style={{
        width: LENS_SIZE,
        height: LENS_SIZE,
        left: screenX - LENS_RADIUS,
        top: screenY - LENS_RADIUS,
      }}
      className="absolute pointer-events-none rounded-full border-4 border-cyan-400 shadow-2xl z-40 overflow-hidden ring-4 ring-black/40 bg-slate-950"
    >
      {/* Magnified Image transformed with rotation */}
      <img
        src={imageUrl}
        alt="Magnifier view"
        draggable={false}
        style={{
          width: imageWidth,
          height: imageHeight,
          maxWidth: 'none',
          transform: `translate(${LENS_RADIUS}px, ${LENS_RADIUS}px) scale(${effectiveZoom}) rotate(${rot}deg) translate(${-wx}px, ${-wy}px)`,
          transformOrigin: '0 0',
          display: 'block',
        }}
        className="pointer-events-none"
      />
    </div>
  );
};
