import React, { useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { ViewportGrid } from './ViewportGrid';
import { DefectSidebar } from './DefectSidebar';
import { AnnotationModal } from './AnnotationModal';
import { useHotkeys } from '../hooks/useHotkeys';
import { useInspectionStore } from '../store/useInspectionStore';
import { getDisplayedDimensions } from '../utils/coordinateTransform';

export const Workspace: React.FC = () => {
  const { setViewport, viewport, naturalImageSize } = useInspectionStore();

  const handleFitToScreen = useCallback(() => {
    // Standard fit for packaging aspect ratio taking rotation into account
    const containerWidth = window.innerWidth * 0.58;
    const containerHeight = (window.innerHeight - 80) * 0.48;

    const baseWidth = naturalImageSize?.w || 6000;
    const baseHeight = naturalImageSize?.h || 2500;
    const rot = viewport.rotation || 0;

    const { displayedW, displayedH } = getDisplayedDimensions(baseWidth, baseHeight, rot);

    const scaleX = containerWidth / displayedW;
    const scaleY = containerHeight / displayedH;
    const fitZoom = Math.min(scaleX, scaleY) * 0.95;

    const finalZoom = Math.max(0.08, Math.min(1.0, fitZoom));

    setViewport({
      zoom: finalZoom,
      panX: Math.max(20, (containerWidth - displayedW * finalZoom) / 2),
      panY: Math.max(20, (containerHeight - displayedH * finalZoom) / 2),
    });
  }, [setViewport, viewport.rotation, naturalImageSize]);

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
      <div className="flex-1 flex flex-row overflow-hidden relative">
        <ViewportGrid />
        <DefectSidebar />
      </div>
      <AnnotationModal />
    </div>
  );
};
