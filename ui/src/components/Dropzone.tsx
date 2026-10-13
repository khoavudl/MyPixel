import React, { useRef, useState } from 'react';
import { FileUp, FileCheck, Play, Sparkles } from 'lucide-react';
import { useInspectionStore } from '../store/useInspectionStore';

export const Dropzone: React.FC = () => {
  const {
    brandFile,
    vendorFile,
    targetSizeMm,
    brandPage,
    vendorPage,
    setBrandFile,
    setVendorFile,
    setTargetSizeMm,
    setBrandPage,
    setVendorPage,
    setRunId,
    setIsAnalyzing,
    clearLogs,
    setViewMode,
  } = useInspectionStore();

  const [isDraggingBrand, setIsDraggingBrand] = useState(false);
  const [isDraggingVendor, setIsDraggingVendor] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const brandInputRef = useRef<HTMLInputElement>(null);
  const vendorInputRef = useRef<HTMLInputElement>(null);

  const handleStartAnalysis = async () => {
    if (!brandFile || !vendorFile) {
      setErrorMsg('Vui lòng chọn đủ cả 2 file Brand PDF và Vendor PDF.');
      return;
    }
    if (!targetSizeMm.trim()) {
      setErrorMsg('Vui lòng nhập kích thước thiết kế mục tiêu WxH mm (ví dụ 620x250).');
      return;
    }

    setErrorMsg(null);
    clearLogs();
    setIsAnalyzing(true);
    setViewMode('console');

    const formData = new FormData();
    formData.append('brand_file', brandFile);
    formData.append('vendor_file', vendorFile);
    formData.append('target_size_mm', targetSizeMm);
    formData.append('brand_page', brandPage.toString());
    formData.append('vendor_page', vendorPage.toString());

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Không thể khởi chạy phân tích');
      }

      const data = await res.json();
      setRunId(data.run_id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setIsAnalyzing(false);
      setViewMode('setup');
    }
  };

  const handleFileDrop = (
    e: React.DragEvent<HTMLDivElement>,
    target: 'brand' | 'vendor'
  ) => {
    e.preventDefault();
    if (target === 'brand') setIsDraggingBrand(false);
    else setIsDraggingVendor(false);

    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      if (target === 'brand') setBrandFile(file);
      else setVendorFile(file);
    } else {
      setErrorMsg('Vui lòng chỉ kéo thả file định dạng PDF (.pdf).');
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-12 px-6">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Pre-press Packaging Verification Studio</span>
        </div>
        <h1 className="text-3xl font-extrabold text-white tracking-tight sm:text-4xl">
          Kiểm Định Bao Bì In Ấn Chuẩn Xác Cao
        </h1>
        <p className="mt-2 text-sm text-slate-400 max-w-xl mx-auto">
          Đối chiếu bản thiết kế gốc (Brand) và bản dàn trang (Supplier). Bóc tách vector,
          chồng khít sub-pixel và phát hiện sai sót trước khi xuất bản in.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-300 font-bold ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2 Dropzones side-by-side */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Brand PDF Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingBrand(true);
          }}
          onDragLeave={() => setIsDraggingBrand(false)}
          onDrop={(e) => handleFileDrop(e, 'brand')}
          onClick={() => brandInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
            brandFile
              ? 'border-emerald-500/60 bg-emerald-500/5'
              : isDraggingBrand
              ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <input
            ref={brandInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setBrandFile(file);
            }}
          />

          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              brandFile
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {brandFile ? (
              <FileCheck className="w-7 h-7" />
            ) : (
              <FileUp className="w-7 h-7" />
            )}
          </div>

          <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            Bản Thiết Kế Gốc (Brand)
          </span>
          <h3 className="text-base font-semibold text-slate-200">
            {brandFile ? brandFile.name : 'Kéo thả file PDF Brand vào đây'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {brandFile
              ? `${(brandFile.size / 1024 / 1024).toFixed(2)} MB • Nhấp để đổi file`
              : 'hoặc nhấp chuột để chọn file từ máy'}
          </p>

          <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-xs text-slate-400 font-medium">Trang:</label>
            <input
              type="number"
              min={1}
              value={brandPage}
              onChange={(e) => setBrandPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-center text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Vendor PDF Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingVendor(true);
          }}
          onDragLeave={() => setIsDraggingVendor(false)}
          onDrop={(e) => handleFileDrop(e, 'vendor')}
          onClick={() => vendorInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-200 ${
            vendorFile
              ? 'border-emerald-500/60 bg-emerald-500/5'
              : isDraggingVendor
              ? 'border-blue-500 bg-blue-500/10 scale-[1.01]'
              : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <input
            ref={vendorInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setVendorFile(file);
            }}
          />

          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors ${
              vendorFile
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {vendorFile ? (
              <FileCheck className="w-7 h-7" />
            ) : (
              <FileUp className="w-7 h-7" />
            )}
          </div>

          <span className="text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
            Bản Dàn Trang (Vendor / Supplier)
          </span>
          <h3 className="text-base font-semibold text-slate-200">
            {vendorFile ? vendorFile.name : 'Kéo thả file PDF Vendor vào đây'}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            {vendorFile
              ? `${(vendorFile.size / 1024 / 1024).toFixed(2)} MB • Nhấp để đổi file`
              : 'hoặc nhấp chuột để chọn file từ máy'}
          </p>

          <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
            <label className="text-xs text-slate-400 font-medium">Trang:</label>
            <input
              type="number"
              min={1}
              value={vendorPage}
              onChange={(e) => setVendorPage(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-16 px-2 py-1 text-xs bg-slate-950 border border-slate-800 rounded text-center text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
      </div>

      {/* Configuration & Action Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex-1 w-full md:w-auto">
          <label className="block text-xs font-medium text-slate-400 mb-2">
            Khổ thiết kế mục tiêu (W × H mm):
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              placeholder="e.g. 620x250"
              value={targetSizeMm}
              onChange={(e) => setTargetSizeMm(e.target.value)}
              className="px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-blue-500 w-44"
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setTargetSizeMm('620x250')}
                className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                620 × 250 (Cà phê)
              </button>
              <button
                type="button"
                onClick={() => setTargetSizeMm('217x200.5')}
                className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
              >
                217 × 200.5 (Kracks)
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={handleStartAnalysis}
          disabled={!brandFile || !vendorFile}
          className={`w-full md:w-auto px-8 py-3.5 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-all shadow-lg ${
            brandFile && vendorFile
              ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/25 cursor-pointer hover:scale-[1.02]'
              : 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
          }`}
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Bắt Đầu Kiểm Định (Analyze)</span>
        </button>
      </div>
    </div>
  );
};
