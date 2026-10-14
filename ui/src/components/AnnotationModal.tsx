import React, { useState, useEffect } from 'react';
import { X, FileText, Trash2, Check } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';

export const AnnotationModal: React.FC = () => {
  const {
    activeEditingBox,
    setActiveEditingBox,
    updateAnnotation,
    deleteAnnotation,
    runId,
    annotations,
  } = useInspectionStore();

  const [note, setNote] = useState('');

  useEffect(() => {
    if (activeEditingBox) {
      setNote(activeEditingBox.note || '');
    }
  }, [activeEditingBox]);

  if (!activeEditingBox) return null;

  const handleSave = async () => {
    updateAnnotation(activeEditingBox.id, {
      note,
    });
    setActiveEditingBox(null);

    // Sync to backend API in background
    if (runId) {
      const updatedList = annotations.map((a) =>
        a.id === activeEditingBox.id ? { ...a, note } : a
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
            <h3 className="font-bold text-white text-sm">Defect Note</h3>
          </div>
          <button
            onClick={() => setActiveEditingBox(null)}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {/* Coordinates Info */}
          {bbox && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs flex justify-between text-slate-300">
              <span>Position: ({bbox[0].toFixed(1)}, {bbox[1].toFixed(1)}) mm</span>
              <span>Size: {bbox[2].toFixed(1)} × {bbox[3].toFixed(1)} mm</span>
            </div>
          )}

          {/* Note Input */}
          <div>
            <label className="text-xs font-medium text-slate-400 mb-2 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>Detailed Note:</span>
            </label>
            <textarea
              rows={4}
              autoFocus
              placeholder="Enter defect description or instructions for vendor..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 leading-relaxed resize-none"
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
            <span>Delete Box</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveEditingBox(null)}
              className="px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-600/30"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
