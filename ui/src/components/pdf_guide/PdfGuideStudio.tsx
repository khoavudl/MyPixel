import React from 'react';
import { usePdfGuideStore } from '../../store/usePdfGuideStore';
import { PdfGuideDropzone } from './PdfGuideDropzone';
import { PdfGuideHeader } from './PdfGuideHeader';
import { PdfGuideToolbar } from './PdfGuideToolbar';
import { PdfGuideCanvas } from './PdfGuideCanvas';
import { PdfGuideSidebar } from './PdfGuideSidebar';

export const PdfGuideStudio: React.FC = () => {
  const { isOpen, docInfo, isSidebarOpen } = usePdfGuideStore();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col font-sans text-slate-100 select-none overflow-hidden">
      {!docInfo ? (
        <PdfGuideDropzone />
      ) : (
        <>
          <PdfGuideHeader />
          <div className="flex-1 flex overflow-hidden">
            <PdfGuideToolbar />
            <PdfGuideCanvas />
            {isSidebarOpen && <PdfGuideSidebar />}
          </div>
        </>
      )}
    </div>
  );
};
