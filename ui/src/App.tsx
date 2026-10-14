import React from 'react';
import { useInspectionStore } from './store/useInspectionStore';
import { Dropzone } from './components/Dropzone';
import { LogConsole } from './components/LogConsole';
import { Workspace } from './components/Workspace';
import { ScanSearch } from 'lucide-react';

import fesLogo from './assets/fes.png';

export const App: React.FC = () => {
  const { viewMode } = useInspectionStore();

  if (viewMode === 'workspace') {
    return (
      <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col font-sans overflow-hidden">
        <Workspace />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-50">
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

        <div className="flex items-center">
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
      </main>
    </div>
  );
};

export default App;
