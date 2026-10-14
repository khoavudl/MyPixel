import React from 'react';
import { CanvasViewer } from './CanvasViewer';
import { useInspectionStore } from '../store/useInspectionStore';

export const ViewportGrid: React.FC = () => {
  const { runStatus, inspectionType } = useInspectionStore();
  const images = runStatus?.images;

  const isSingle =
    inspectionType === 'single' ||
    runStatus?.report?.mode === 'single' ||
    runStatus?.report?.run_type === 'single';

  // Function 2: Single Frame Inspection (1 frame only)
  if (isSingle) {
    const singleImageSrc = images?.single_image || images?.brand_cropped;

    return (
      <div className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] p-3 bg-slate-950 flex flex-col overflow-hidden select-none">
        <div className="flex-1 min-h-0 relative w-full h-full">
          <CanvasViewer
            badgeText="SINGLE"
            badgeColorClass="bg-blue-600/90 text-white"
            imageUrl={singleImageSrc}
            frameId="single"
            isMain={true}
          />
        </div>
      </div>
    );
  }

  // Function 1: 4-Way Comparative View (OLD, NEW, OVERLAY, HEATMAP)
  return (
    <div className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] p-3 bg-slate-950 flex flex-col md:flex-row gap-3 overflow-hidden select-none">
      {/* Left Column: 2 Comparative Views (OLD & NEW) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
        {/* Top: Old Version */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            badgeText="OLD"
            badgeColorClass="bg-blue-600/90 text-white"
            imageUrl={images?.brand_cropped}
            frameId="brand"
            isMain={true}
          />
        </div>

        {/* Bottom: New Version */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            badgeText="NEW"
            badgeColorClass="bg-purple-600/90 text-white"
            imageUrl={images?.vendor_cropped}
            altImageUrl={images?.brand_cropped} // For Flicker Compare
            frameId="vendor"
            isMain={true}
          />
        </div>
      </div>

      {/* Right Column: 2 Secondary Diagnostic Views (OVERLAY & HEATMAP - Equal 50/50 Width) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
        {/* Top Right: Overlay */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            badgeText="OVERLAY"
            badgeColorClass="bg-cyan-600/90 text-white"
            imageUrl={images?.overlay}
            frameId="overlay"
          />
        </div>

        {/* Bottom Right: Heatmap */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            badgeText="HEATMAP"
            badgeColorClass="bg-amber-600/90 text-white"
            imageUrl={images?.absdiff_heatmap}
            frameId="heatmap"
          />
        </div>
      </div>
    </div>
  );
};

