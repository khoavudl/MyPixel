import React from 'react';
import { RotateCcw, CheckCircle2, Image as ImageIcon } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';

export const WorkspacePlaceholder: React.FC = () => {
  const { runId, runStatus, resetAll } = useInspectionStore();

  const images = runStatus?.images;

  return (
    <div className="max-w-6xl mx-auto py-10 px-6">
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-slate-800">
        <div>
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5 mb-1">
            <CheckCircle2 className="w-4 h-4" /> Pipeline Phase 1 Hoàn Tất Thành Công
          </span>
          <h1 className="text-2xl font-bold text-white">
            Trạm Kiểm Định Bao Bì: <span className="font-mono text-blue-400">{runId}</span>
          </h1>
        </div>

        <button
          onClick={resetAll}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Kiểm Tra Cặp File Mới</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Brand Cropped */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-blue-400 uppercase">1. Brand Cropped (Gốc)</span>
            <ImageIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="bg-slate-950 rounded-xl overflow-hidden aspect-[2/1] flex items-center justify-center border border-slate-800">
            {images?.brand_cropped ? (
              <img src={images.brand_cropped} alt="Brand Cropped" className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-slate-600">Đang tải ảnh...</span>
            )}
          </div>
        </div>

        {/* Vendor Cropped / Aligned */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-purple-400 uppercase">2. Vendor Aligned (Đã Canh)</span>
            <ImageIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="bg-slate-950 rounded-xl overflow-hidden aspect-[2/1] flex items-center justify-center border border-slate-800">
            {images?.vendor_cropped ? (
              <img src={images.vendor_cropped} alt="Vendor Aligned" className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-slate-600">Đang tải ảnh...</span>
            )}
          </div>
        </div>

        {/* Overlay */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-cyan-400 uppercase">3. Overlay Chồng Lớp</span>
            <ImageIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="bg-slate-950 rounded-xl overflow-hidden aspect-[2/1] flex items-center justify-center border border-slate-800">
            {images?.overlay ? (
              <img src={images.overlay} alt="Overlay" className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-slate-600">Đang tải ảnh...</span>
            )}
          </div>
        </div>

        {/* Heatmap */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-amber-400 uppercase">4. Diff Heatmap Nhiệt</span>
            <ImageIcon className="w-4 h-4 text-slate-500" />
          </div>
          <div className="bg-slate-950 rounded-xl overflow-hidden aspect-[2/1] flex items-center justify-center border border-slate-800">
            {images?.absdiff_heatmap ? (
              <img src={images.absdiff_heatmap} alt="Diff Heatmap" className="object-contain w-full h-full" />
            ) : (
              <span className="text-xs text-slate-600">Đang tải ảnh...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
