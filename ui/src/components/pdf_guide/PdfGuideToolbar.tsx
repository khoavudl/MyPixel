import React from 'react';
import { Hand, Stamp, ArrowUpRight, Square, EyeOff, Type, Crop, Info } from 'lucide-react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';
import { GuideToolMode } from '../../types/pdfGuide';

export const PdfGuideToolbar: React.FC = () => {
  const { activeTool, setActiveTool } = usePdfGuideStore();

  const tools: { id: GuideToolMode; label: string; icon: React.FC<{ className?: string }>; shortcut: string }[] = [
    { id: 'pan', label: 'Pan / Navigate', icon: Hand, shortcut: 'Space' },
    { id: 'step', label: 'Step Marker (① ② ③)', icon: Stamp, shortcut: 'S' },
    { id: 'arrow', label: 'Directional Arrow', icon: ArrowUpRight, shortcut: 'A' },
    { id: 'box', label: 'Highlight Box', icon: Square, shortcut: 'B' },
    { id: 'blur', label: 'Redact / Blur Box', icon: EyeOff, shortcut: 'X' },
    { id: 'text', label: 'Text Box / Note', icon: Type, shortcut: 'T' },
    { id: 'crop', label: 'Crop Region / Copy', icon: Crop, shortcut: 'C' },
  ];

  return (
    <aside className="w-14 border-r border-slate-800 bg-slate-900/70 flex flex-col items-center py-3 gap-2 shrink-0 select-none z-20">
      {tools.map((t) => {
        const Icon = t.icon;
        const isActive = activeTool === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setActiveTool(t.id)}
            title={`${t.label} (Press ${t.shortcut})`}
            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center transition relative ${
              isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[9px] font-mono mt-0.5 opacity-70">{t.shortcut}</span>
            {isActive && (
              <span className="absolute -left-1 w-1 h-4 bg-blue-400 rounded-r-full" />
            )}
          </button>
        );
      })}

      <div className="w-8 h-px bg-slate-800 my-1" />

      {/* Tool info hint */}
      <div className="mt-auto px-1 text-center" title="Tip: Click anywhere on PDF when Step tool is active to stamp ① ② ③">
        <Info className="w-4 h-4 text-slate-500 mx-auto" />
      </div>
    </aside>
  );
};
