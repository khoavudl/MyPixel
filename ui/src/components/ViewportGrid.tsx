import React from 'react';
import { CanvasViewer } from './CanvasViewer';
import { useInspectionStore } from '../store/useInspectionStore';

export const ViewportGrid: React.FC = () => {
  const { runStatus } = useInspectionStore();
  const images = runStatus?.images;

  return (
    <div className="flex-1 min-w-0 h-[calc(100vh-3.5rem)] p-3 bg-slate-950 flex flex-col md:flex-row gap-3 overflow-hidden select-none">
      {/* Left Column: 2 Large Comparative Views (Brand & Vendor) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
        {/* Top: Brand Cropped */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            title="Bản Thiết Kế Gốc (Brand)"
            badgeText="Brand"
            badgeColorClass="bg-blue-600/90 text-white"
            imageUrl={images?.brand_cropped}
            frameId="brand"
            isMain={true}
          />
        </div>

        {/* Bottom: Vendor Aligned */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            title="Bản Dàn Trang Đã Canh (Vendor Aligned)"
            badgeText="Vendor"
            badgeColorClass="bg-purple-600/90 text-white"
            imageUrl={images?.vendor_cropped}
            altImageUrl={images?.brand_cropped} // For Flicker Compare
            frameId="vendor"
            isMain={true}
          />
        </div>
      </div>

      {/* Right Column: 2 Secondary Diagnostic Views (Overlay & Heatmap - Equal 50/50 Width) */}
      <div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
        {/* Top Right: Overlay */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            title="Overlay Chồng Khít Kênh Màu"
            badgeText="Overlay"
            badgeColorClass="bg-cyan-600/90 text-white"
            imageUrl={images?.overlay}
            frameId="overlay"
          />
        </div>

        {/* Bottom Right: Absdiff Heatmap */}
        <div className="flex-1 min-h-0 relative">
          <CanvasViewer
            title="Bản Đồ Nhiệt Khác Biệt (Absdiff Heatmap)"
            badgeText="Heatmap"
            badgeColorClass="bg-amber-600/90 text-white"
            imageUrl={images?.absdiff_heatmap}
            frameId="heatmap"
          />
        </div>
      </div>
    </div>
  );
};
