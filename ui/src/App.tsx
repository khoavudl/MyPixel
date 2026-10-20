import React from 'react';
import { useInspectionStore } from './store/useInspectionStore';
import { usePdfGuideStore } from './store/usePdfGuideStore';
import { Dropzone } from './components/Dropzone';
import { LogConsole } from './components/LogConsole';
import { Workspace } from './components/Workspace';
import { ManualAlignView } from './components/ManualAlignView';
import { PdfGuideStudio } from './components/pdf_guide/PdfGuideStudio';
import { ScanSearch, BookOpenCheck } from 'lucide-react';

import fesLogo from './assets/fes.png';

export const App: React.FC = () => {
  const { viewMode } = useInspectionStore();

  return (
    <>
      {/* Standalone PDF Guide Studio Overlay (Zero impact on main inspection state) */}
      <PdfGuideStudio />

      {viewMode === 'workspace' ? (
        <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
          <Workspace />
        </div>
      ) : (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
          {/* Top Navbar */}
          <header className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-40">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30">
                <ScanSearch className="w-5 h-5" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-extrabold text-base tracking-tight text-white">
                  MYPIXEL
                </span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                  ARTDIFF v2.0
                </span>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Standalone Mini Tool Editor Toolbox button */}
              <button
                onClick={() => usePdfGuideStore.getState().openStudio()}
                title="Open Editor Toolbox (Quick Viewer, Crop, Markups & Step-by-Step SOP Maker)"
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:text-blue-300 transition text-xs font-semibold cursor-pointer shadow-sm shadow-blue-500/10"
              >
                <BookOpenCheck className="w-4 h-4 text-blue-400" />
                <span>Editor Toolbox</span>
              </button>

              <img
                src={fesLogo}
                alt="FES Logo"
                className="h-8 w-auto object-contain bg-transparent select-none"
              />
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col">
            {viewMode === 'setup' && <Dropzone />}
            {viewMode === 'console' && <LogConsole />}
            {viewMode === 'manual_align' && <ManualAlignView />}
          </main>
        </div>
      )}
    </>
  );
};

export default App;
