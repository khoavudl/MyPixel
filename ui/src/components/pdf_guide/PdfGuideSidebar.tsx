import React, { useState } from 'react';
import {
  Trash2,
  ChevronUp,
  ChevronDown,
  Copy,
  Check,
  Download,
  ListOrdered,
  FileDown,
  FileText,
  Shapes,
  Loader2,
} from 'lucide-react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';
import { StepBadgeColor } from '../../types/pdfGuide';

const COLOR_OPTIONS: { id: StepBadgeColor; label: string; bg: string }[] = [
  { id: 'blue', label: 'Action (Blue)', bg: 'bg-blue-600' },
  { id: 'red', label: 'Warning / Fix (Red)', bg: 'bg-rose-600' },
  { id: 'green', label: 'Pass / Success (Green)', bg: 'bg-emerald-600' },
  { id: 'amber', label: 'Note (Amber)', bg: 'bg-amber-500' },
  { id: 'purple', label: 'Check (Purple)', bg: 'bg-purple-600' },
];

export const PdfGuideSidebar: React.FC = () => {
  const {
    steps,
    updateStep,
    removeStep,
    reorderSteps,
    shapes,
    clearShapes,
    activeColor,
    setActiveColor,
    selectedStepId,
    setSelectedStepId,
    setHoveredStepId,
    docInfo,
    currentPage,
    badgeSize,
    canvasWidth,
    exportPdf,
    isExportingPdf,
  } = usePdfGuideStore();

  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  // Copy full step list as Markdown / SOP text
  const handleCopyMarkdown = async () => {
    if (steps.length === 0) return;
    const lines = [
      `# Manual Guide: ${docInfo?.filename || 'Document'} (Page ${currentPage})`,
      '',
      ...steps.map(
        (s) =>
          `### Step ${s.step_number}: ${s.title}\n${s.description ? s.description + '\n' : ''}`
      ),
    ];
    await navigator.clipboard.writeText(lines.join('\n'));
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Save draft guide to backend
  const handleSaveDraft = async () => {
    if (!docInfo) return;
    try {
      const payload = {
        doc_id: docInfo.doc_id,
        badge_size: badgeSize,
        current_page: currentPage,
        steps: steps.map((s) => ({
          id: s.id,
          step_number: s.step_number,
          norm_x: s.norm_x,
          norm_y: s.norm_y,
          title: s.title,
          description: s.description,
          color: s.color,
        })),
        shapes: shapes.map((sh) => ({
          id: sh.id,
          type: sh.type,
          color: sh.color,
          norm_x1: sh.norm_x1,
          norm_y1: sh.norm_y1,
          norm_x2: sh.norm_x2,
          norm_y2: sh.norm_y2,
          text: sh.text || '',
          font_size: sh.font_size || 14,
          has_fill: sh.has_fill || false,
          stroke_width: sh.stroke_width || 2,
        })),
      };

      const res = await fetch(`/api/pdf_tools/save_guide/${docInfo.doc_id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsSaved(true);
        setTimeout(() => setIsSaved(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save draft:', err);
    }
  };

  // Helper to trigger browser download
  const triggerDownload = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  // Export SOP DOCX Guide
  const handleExportDocx = async () => {
    if (!docInfo) return;
    setIsExportingDocx(true);
    try {
      const payload = {
        doc_id: docInfo.doc_id,
        current_page: currentPage,
        badge_size: badgeSize,
        canvas_width: canvasWidth || 1000,
        format: 'docx',
        steps: steps.map((s) => ({
          id: s.id,
          step_number: s.step_number,
          norm_x: s.norm_x,
          norm_y: s.norm_y,
          title: s.title,
          description: s.description,
          color: s.color,
        })),
        shapes: shapes.map((sh) => ({
          id: sh.id,
          type: sh.type,
          color: sh.color,
          norm_x1: sh.norm_x1,
          norm_y1: sh.norm_y1,
          norm_x2: sh.norm_x2,
          norm_y2: sh.norm_y2,
          text: sh.text || '',
          font_size: sh.font_size || 14,
          has_fill: sh.has_fill || false,
          stroke_width: sh.stroke_width || 2,
        })),
      };

      const res = await fetch('/api/pdf_tools/export_sop_doc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('DOCX Export failed');

      const blob = await res.blob();
      triggerDownload(blob, `SOP_Guide_${docInfo.filename.replace('.pdf', '')}_p${currentPage}.docx`);
    } catch (err) {
      console.error('Failed to export SOP docx:', err);
    } finally {
      setIsExportingDocx(false);
    }
  };

  return (
    <aside className="w-80 border-l border-slate-800 bg-slate-900/90 flex flex-col shrink-0 select-none z-20 overflow-hidden">
      {/* Sidebar Header */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-xs text-white uppercase tracking-wider">
            Guide Steps
          </span>
          <span className="px-1.5 py-0.2 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-mono font-bold">
            {steps.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleSaveDraft}
            title="Save draft to server"
            disabled={!docInfo}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition text-[11px] font-medium"
          >
            {isSaved ? <Check className="w-3 h-3 text-emerald-400" /> : <Download className="w-3 h-3" />}
            {isSaved ? 'Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Global Active Color Palette */}
      <div className="px-3 py-2 border-b border-slate-800/80 bg-slate-950/40 flex items-center justify-between">
        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
          Active Color:
        </span>
        <div className="flex items-center gap-1.5">
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveColor(c.id)}
              title={`Draw in ${c.label}`}
              className={`w-4 h-4 rounded-full ${c.bg} transition-all ${
                activeColor === c.id ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Markups info bar (if any shapes drawn) */}
      {shapes.length > 0 && (
        <div className="px-3 py-1.5 bg-slate-950/60 border-b border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <Shapes className="w-3.5 h-3.5 text-blue-400" />
            <span>Markups: <b className="text-white">{shapes.length}</b></span>
          </div>
          <button
            onClick={clearShapes}
            className="text-[10px] text-red-400 hover:text-red-300 hover:underline"
          >
            Clear Markups
          </button>
        </div>
      )}

      {/* Step List Container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {steps.length === 0 ? (
          <div className="text-center py-10 px-4 text-slate-500 space-y-2">
            <div className="w-10 h-10 rounded-full bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div className="text-xs font-semibold text-slate-300">No steps created yet</div>
            <p className="text-[11px] text-slate-400">
              Press <kbd className="px-1 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-blue-400">S</kbd> or click the Stamp icon on the left toolbar, then click anywhere on the PDF to drop step badges!
            </p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const isSelected = selectedStepId === step.id;
            return (
              <div
                key={step.id}
                onClick={() => setSelectedStepId(step.id)}
                onMouseEnter={() => setHoveredStepId(step.id)}
                onMouseLeave={() => setHoveredStepId(null)}
                className={`rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-blue-500/80 bg-blue-950/20 ring-1 ring-blue-500/30'
                    : 'border-slate-800 hover:border-slate-700 bg-slate-900/60'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white ${
                        COLOR_OPTIONS.find((c) => c.id === step.color)?.bg || 'bg-blue-600'
                      }`}
                    >
                      {step.step_number}
                    </span>
                    <input
                      type="text"
                      value={step.title}
                      onChange={(e) => updateStep(step.id, { title: e.target.value })}
                      placeholder="Step Title..."
                      className="bg-transparent font-semibold text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 -ml-1 border-b border-transparent focus:border-blue-500 w-36"
                    />
                  </div>

                  {/* Actions: Move Up, Move Down, Delete */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSteps(idx, idx - 1);
                      }}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                      title="Move Up"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        reorderSteps(idx, idx + 1);
                      }}
                      disabled={idx === steps.length - 1}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20"
                      title="Move Down"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeStep(step.id);
                      }}
                      className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                      title="Delete step (auto-renumbers remaining)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Color Selector */}
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Tag:
                  </span>
                  <div className="flex items-center gap-1">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateStep(step.id, { color: c.id });
                        }}
                        title={c.label}
                        className={`w-3.5 h-3.5 rounded-full ${c.bg} transition-transform ${
                          step.color === c.id ? 'ring-2 ring-white scale-110' : 'opacity-60 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Description textarea */}
                <textarea
                  value={step.description}
                  onChange={(e) => updateStep(step.id, { description: e.target.value })}
                  placeholder="Instructions or action details for this step..."
                  rows={2}
                  className="w-full bg-slate-950/70 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>
            );
          })
        )}
      </div>

      {/* Sidebar Footer: Advanced Export Engine */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/80 shrink-0 space-y-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
          Export Document
        </div>

        {/* 1. Export to PDF Button */}
        <button
          onClick={exportPdf}
          disabled={isExportingPdf || !docInfo}
          className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 font-medium text-xs transition disabled:opacity-50 cursor-pointer"
        >
          {isExportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5 text-blue-400" />}
          <span>{isExportingPdf ? 'Exporting PDF...' : 'Export to PDF'}</span>
        </button>

        {/* 2. SOP Guide DOCX Button */}
        <button
          onClick={handleExportDocx}
          disabled={isExportingDocx || !docInfo}
          className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-600/20 transition disabled:opacity-50"
        >
          {isExportingDocx ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5 text-blue-200" />}
          <span>{isExportingDocx ? 'Generating Word...' : 'SOP Guide Report (.docx)'}</span>
        </button>

        {/* 3. Copy Markdown */}
        {steps.length > 0 && (
          <button
            onClick={handleCopyMarkdown}
            className="w-full flex items-center justify-center gap-1.5 py-1 text-slate-400 hover:text-slate-200 text-[11px] transition"
          >
            {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{isCopied ? 'Copied to Clipboard!' : 'Copy Steps as Markdown'}</span>
          </button>
        )}
      </div>
    </aside>
  );
};
