import React, { useState } from 'react';
import {
  ListFilter,
  ChevronRight,
  ChevronLeft,
  FileDown,
  Edit2,
  Trash2,
  Navigation,
  CheckCircle,
} from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { DefectBox } from '../types';

export const DefectSidebar: React.FC = () => {
  const {
    annotations,
    selectedBoxId,
    setSelectedBoxId,
    hoveredBoxId,
    setHoveredBoxId,
    setActiveEditingBox,
    deleteAnnotation,
    jumpToBox,
    isSidebarOpen,
    setIsSidebarOpen,
    runId,
  } = useInspectionStore();

  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);

  const handleExport = async (format: 'html' | 'json' = 'html') => {
    if (!runId) return;
    setIsExporting(true);

    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, format }),
      });

      if (!res.ok) throw new Error('Xuất báo cáo thất bại');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit_report_${runId}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    } catch (err) {
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!isSidebarOpen) {
    return (
      <button
        onClick={() => setIsSidebarOpen(true)}
        title="Mở danh sách lỗi"
        className="fixed right-3 bottom-5 z-40 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 p-2.5 rounded-xl shadow-2xl flex items-center gap-2 cursor-pointer transition-all"
      >
        <ChevronLeft className="w-4 h-4" />
        <span className="text-xs font-bold">Lỗi ({annotations.length})</span>
      </button>
    );
  }

  return (
    <div className="w-56 h-full bg-slate-900 border-l border-slate-800 flex flex-col select-none z-30 shadow-2xl">
      {/* Header */}
      <div className="p-3 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListFilter className="w-4 h-4 text-blue-400 shrink-0" />
          <h3 className="font-bold text-white text-xs uppercase tracking-wider truncate">
            Danh Sách Lỗi
          </h3>
          <span className="px-1.5 py-0.2 rounded-full bg-blue-600/20 text-blue-400 text-[11px] font-extrabold border border-blue-500/30 shrink-0">
            {annotations.length}
          </span>
        </div>

        <button
          onClick={() => setIsSidebarOpen(false)}
          title="Thu gọn sidebar"
          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Defect Cards List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {annotations.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-500 text-xs leading-relaxed">
            <p className="font-medium text-slate-400 mb-1">Chưa có box lỗi nào</p>
            <p>
              Chọn công cụ <strong>Draw Box (B)</strong> trên thanh công cụ và kéo chuột trên bất kỳ
              khung hình nào để bắt lỗi.
            </p>
          </div>
        ) : (
          annotations.map((box: DefectBox, idx: number) => {
            const isSelected = selectedBoxId === box.id;
            const isHovered = hoveredBoxId === box.id;

            return (
              <div
                key={box.id}
                onMouseEnter={() => setHoveredBoxId(box.id)}
                onMouseLeave={() => setHoveredBoxId(null)}
                onClick={() => {
                  setSelectedBoxId(box.id);
                  jumpToBox(box);
                }}
                className={`p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-blue-600/15 border-blue-500 shadow-md shadow-blue-500/10'
                    : isHovered
                    ? 'bg-slate-800/80 border-slate-700'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Card Top: Number */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="w-5 h-5 rounded-md bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">
                    #{idx + 1}
                  </span>
                </div>

                {/* Card Note or Placeholder */}
                <p className="text-xs text-slate-200 line-clamp-2 mb-2 font-normal">
                  {box.note || <em className="text-slate-500">Chưa có ghi chú mô tả...</em>}
                </p>

                {/* Card Bottom: Coordinates & Quick Actions */}
                <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1.5 border-t border-slate-800/60">
                  <span>
                    {box.bbox_mm
                      ? `${box.bbox_mm[0].toFixed(1)}, ${box.bbox_mm[1].toFixed(1)} mm`
                      : 'N/A'}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        jumpToBox(box);
                      }}
                      title="Bay tới vị trí lỗi trên canvas"
                      className="p-1 hover:text-blue-400 text-slate-400 rounded transition-colors"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveEditingBox(box);
                      }}
                      title="Sửa thông tin note"
                      className="p-1 hover:text-white text-slate-400 rounded transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAnnotation(box.id);
                      }}
                      title="Xoá lỗi này"
                      className="p-1 hover:text-red-400 text-slate-400 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer: 1-Click Export Button */}
      <div className="p-2.5 bg-slate-950/90 border-t border-slate-800">
        <button
          onClick={() => handleExport('html')}
          disabled={isExporting}
          className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-lg ${
            exportSuccess
              ? 'bg-emerald-600 text-white shadow-emerald-600/30'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25 cursor-pointer hover:scale-[1.01]'
          }`}
        >
          {exportSuccess ? (
            <>
              <CheckCircle className="w-3.5 h-3.5" />
              <span>Đã Tải Báo Cáo</span>
            </>
          ) : (
            <>
              <FileDown className="w-3.5 h-3.5" />
              <span>{isExporting ? 'Đang Xuất...' : 'Xuất Báo Cáo (Export)'}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
