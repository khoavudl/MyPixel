import React, { useRef, useState } from 'react';
import { FileUp, ArrowLeft, Loader2, Sparkles } from 'lucide-react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';

export const PdfGuideDropzone: React.FC = () => {
  const { uploadPdf, isUploading, error, closeStudio } = usePdfGuideStore();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const name = file.name.toLowerCase();
    const validExts = ['.pdf', '.png', '.jpg', '.jpeg', '.bmp', '.webp', '.tif', '.tiff'];
    if (validExts.some((ext) => name.endsWith(ext))) {
      uploadPdf(file);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-slate-100 relative">
      {/* Top back button */}
      <div className="absolute top-6 left-6">
        <button
          onClick={closeStudio}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700/60 transition text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Inspection
        </button>
      </div>

      <div className="max-w-xl w-full text-center space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5" />
          Editor Toolbox • Standalone
        </div>

        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white mb-2">
            Editor Toolbox
          </h2>
          <p className="text-sm text-slate-400">
            Quickly view, crop, annotate any PDF or image (JPEG, PNG, BMP, TIFF), and stamp auto-increment badges (①, ②, ③) to generate visual guides in seconds.
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-left">
            {error}
          </div>
        )}

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all ${
            isDragOver
              ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
              : 'border-slate-700 hover:border-slate-500 bg-slate-900/60 hover:bg-slate-900/90'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.bmp,.webp,.tif,.tiff,image/*,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          {isUploading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <div className="text-slate-300 font-medium">Processing & Rendering Document...</div>
            </div>
          ) : (
            <>
              <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 flex items-center justify-center mb-4 ring-8 ring-blue-600/10">
                <FileUp className="w-8 h-8" />
              </div>
              <div className="text-base font-semibold text-slate-200 mb-1">
                Drag & drop your PDF or image file here
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Supports PDF, PNG, JPG, JPEG, BMP & TIFF documents
              </p>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
              >
                Browse File
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            100% Client & Local CPU
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            Auto-renumbering ① ② ③
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            Zero impact on main inspection
          </div>
        </div>
      </div>
    </div>
  );
};
