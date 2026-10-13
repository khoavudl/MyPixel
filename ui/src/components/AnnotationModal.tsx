import React, { useState, useEffect } from 'react';
import { X, Tag, AlertTriangle, FileText, Trash2, Check } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';
import { DefectSeverity, DefectTag } from '../types';

export const AnnotationModal: React.FC = () => {
  const {
    activeEditingBox,
    setActiveEditingBox,
    updateAnnotation,
    deleteAnnotation,
    runId,
    annotations,
  } = useInspectionStore();

  const [tag, setTag] = useState<DefectTag>('content');
  const [severity, setSeverity] = useState<DefectSeverity>('major');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (activeEditingBox) {
      setTag(activeEditingBox.tag);
      setSeverity(activeEditingBox.severity);
      setNote(activeEditingBox.note || '');
    }
  }, [activeEditingBox]);

  if (!activeEditingBox) return null;

  const handleSave = async () => {
    updateAnnotation(activeEditingBox.id, {
      tag,
      severity,
      note,
    });
    setActiveEditingBox(null);

    // Sync to backend API in background
    if (runId) {
      const updatedList = annotations.map((a) =>
        a.id === activeEditingBox.id ? { ...a, tag, severity, note } : a
      );
      try {
        await fetch(`/api/runs/${runId}/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, annotations: updatedList }),
        });
      } catch (e) {
        console.error('Failed to sync annotations to backend:', e);
      }
    }
  };

  const handleDelete = async () => {
    deleteAnnotation(activeEditingBox.id);
    setActiveEditingBox(null);

    if (runId) {
      const updatedList = annotations.filter((a) => a.id !== activeEditingBox.id);
      try {
        await fetch(`/api/runs/${runId}/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ run_id: runId, annotations: updatedList }),
        });
      } catch (e) {
        console.error('Failed to sync annotations to backend:', e);
      }
    }
  };

  const bbox = activeEditingBox.bbox_mm;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
              #
            </span>
            <h3 className="font-bold text-white text-sm">Ghi Chú Bắt Lỗi Bounding Box</h3>
          </div>
          <button
            onClick={() => setActiveEditingBox(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {/* Coordinates Info */}
          {bbox && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs flex justify-between text-slate-300">
              <span>Vị trí: ({bbox[0].toFixed(1)}, {bbox[1].toFixed(1)}) mm</span>
              <span>Kích thước: {bbox[2].toFixed(1)} × {bbox[3].toFixed(1)} mm</span>
            </div>
          )}

          {/* Tag Selection */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>Loại Lỗi (Tag):</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'content', label: 'Sai Nội Dung' },
                { id: 'missing_char', label: 'Mất Dấu/Chữ' },
                { id: 'shift', label: 'Lệch Vị Trí' },
                { id: 'barcode', label: 'Mã Vạch' },
                { id: 'color', label: 'Màu Sắc' },
                { id: 'other', label: 'Khác' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTag(item.id as DefectTag)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-medium border text-center transition-colors cursor-pointer ${
                    tag === item.id
                      ? 'bg-blue-600 text-white border-blue-500 shadow-sm'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity Selection */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Mức Độ Nghiêm Trọng:</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'critical', label: 'Critical (Chặn in)', color: 'text-red-400 border-red-500/40 bg-red-500/10' },
                { id: 'major', label: 'Major (Đáng chú ý)', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
                { id: 'minor', label: 'Minor (Nhẹ)', color: 'text-yellow-300 border-yellow-500/40 bg-yellow-500/10' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSeverity(item.id as DefectSeverity)}
                  className={`px-2 py-1.5 rounded-xl text-xs font-medium border text-center transition-colors cursor-pointer ${
                    severity === item.id
                      ? `${item.color} font-bold shadow-sm`
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note Input */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Ghi Chú Chi Tiết:</span>
            </label>
            <textarea
              rows={3}
              placeholder="Mô tả sai lệch (ví dụ: Dòng 4 thành phần mất dấu ỉ trong từ 'chỉnh')..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-950/80 border-t border-slate-800 flex items-center justify-between">
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Xoá Box</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveEditingBox(null)}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/30"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Lưu Lỗi</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
