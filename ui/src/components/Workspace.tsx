import React, { useCallback } from 'react';
import { Toolbar } from './Toolbar';
import { ViewportGrid } from './ViewportGrid';
import { DefectSidebar } from './DefectSidebar';
import { AnnotationModal } from './AnnotationModal';
import { useHotkeys } from '../hooks/useHotkeys';
import { useInspectionStore } from '../store/useInspectionStore';
import { getDisplayedDimensions } from '../utils/coordinateTransform';

export const Workspace: React.FC = () => {
  const {
    setViewport,
    viewport,
    naturalImageSize,
    inspectionType,
    runStatus,
    isSidebarOpen,
  } = useInspectionStore();

  const isSingle =
    inspectionType === 'single' ||
    runStatus?.report?.mode === 'single' ||
    runStatus?.report?.run_type === 'single';

  const handleFitToScreen = useCallback(() => {
    const sidebarWidth = isSidebarOpen ? 224 : 0;
    const containerWidth = isSingle
      ? Math.max(300, window.innerWidth - sidebarWidth - 48)
      : window.innerWidth * 0.58;
    const containerHeight = isSingle
      ? Math.max(300, window.innerHeight - 80)
      : (window.innerHeight - 80) * 0.48;

    const baseWidth = naturalImageSize?.w || 6000;
    const baseHeight = naturalImageSize?.h || 2500;
    const rot = viewport.rotation || 0;

    const { displayedW, displayedH } = getDisplayedDimensions(baseWidth, baseHeight, rot);

    const scaleX = containerWidth / displayedW;
    const scaleY = containerHeight / displayedH;
    const fitZoom = Math.min(scaleX, scaleY) * 0.95;

    const finalZoom = Math.max(0.05, Math.min(2.0, fitZoom));

    setViewport({
      zoom: finalZoom,
      panX: Math.max(16, (containerWidth - displayedW * finalZoom) / 2),
      panY: Math.max(16, (containerHeight - displayedH * finalZoom) / 2),
    });
  }, [setViewport, viewport.rotation, naturalImageSize, isSingle, isSidebarOpen]);


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
