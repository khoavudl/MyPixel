import React, { useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { ViewportGrid } from './ViewportGrid';
import { useHotkeys } from '../hooks/useHotkeys';
import { useInspectionStore } from '../store/useInspectionStore';

export const Workspace: React.FC = () => {
  const { setViewport } = useInspectionStore();

  const handleFitToScreen = useCallback(() => {
    // Standard fit for common packaging aspect ratio (e.g., 620x250 or 217x200)
    // Centers the artboard and sets a comfortable overview zoom (around 0.15 - 0.25x for 7000px wide image)
    const containerWidth = window.innerWidth * 0.58;
    const containerHeight = (window.innerHeight - 80) * 0.48;

    // Approximate artboard pixel dimensions (~7320x2950 or ~2560x2360)
    const assumedWidth = 6000;
    const assumedHeight = 2500;

    const scaleX = containerWidth / assumedWidth;
    const scaleY = containerHeight / assumedHeight;
    const fitZoom = Math.min(scaleX, scaleY) * 0.95;

    const finalZoom = Math.max(0.08, Math.min(1.0, fitZoom));

    setViewport({
      zoom: finalZoom,
      panX: Math.max(20, (containerWidth - assumedWidth * finalZoom) / 2),
      panY: Math.max(20, (containerHeight - assumedHeight * finalZoom) / 2),
    });
  }, [setViewport]);

  const handleActualSize = useCallback(() => {
    setViewport({
      zoom: 1.0,
      panX: 40,
      panY: 40,
    });
  }, [setViewport]);

  // Bind keyboard shortcuts
  useHotkeys(handleFitToScreen);

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-slate-950">
      <Toolbar onFitToScreen={handleFitToScreen} onActualSize={handleActualSize} />
      <ViewportGrid />
    </div>
  );
};
