import { create } from 'zustand';
import { GuideShape, GuideToolMode, PdfDocumentInfo, StepBadge, StepBadgeColor } from '../types/pdfGuide';

interface PdfGuideState {
  // Studio visibility
  isOpen: boolean;

  // Document state
  docInfo: PdfDocumentInfo | null;
  currentPage: number;
  pageImageUrl: string | null;
  isLoadingPage: boolean;
  isUploading: boolean;
  error: string | null;

  // Viewport
  zoom: number;
  panX: number;
  panY: number;
  canvasWidth: number; // Rendered reference width of artwork on screen in px

  // Tool & Settings
  activeTool: GuideToolMode;
  activeColor: StepBadgeColor;
  badgeSize: number; // Global badge size in px (16 - 64, default 28)
  currentDpi: number; // Rendering DPI (default 300, or 400 for ultra-sharp)

  // Steps & Annotations
  steps: StepBadge[];
  shapes: GuideShape[];
  selectedStepId: string | null;
  selectedShapeId: string | null;
  hoveredStepId: string | null;
  isSidebarOpen: boolean;
  isExportingPdf: boolean;

  // History for Undo / Redo
  history: { steps: StepBadge[]; shapes: GuideShape[] }[];
  future: { steps: StepBadge[]; shapes: GuideShape[] }[];
  canRevertCrop: boolean;
  lastCropTransform: { min_x: number; min_y: number; crop_w: number; crop_h: number } | null;

  // Actions
  openStudio: () => void;
  closeStudio: () => void;
  setDocInfo: (doc: PdfDocumentInfo | null) => void;
  setCurrentPage: (page: number) => void;
  setCurrentDpi: (dpi: number) => void;
  loadPageImage: (docId: string, pageNum: number, dpi?: number) => Promise<void>;
  uploadPdf: (file: File) => Promise<void>;
  exportPdf: () => Promise<void>;
  setActiveTool: (tool: GuideToolMode) => void;
  setActiveColor: (color: StepBadgeColor) => void;
  setBadgeSize: (size: number) => void;
  setZoom: (zoom: number | ((prev: number) => number)) => void;
  setPan: (panX: number, panY: number) => void;
  setCanvasWidth: (w: number) => void;
  resetViewport: () => void;
  undo: () => void;
  redo: () => void;
  undoCropPage: () => Promise<void>;
  rotatePage: (angle?: number) => Promise<void>;
  addStep: (norm_x: number, norm_y: number) => StepBadge;
  updateStep: (id: string, updates: Partial<StepBadge>) => void;
  removeStep: (id: string) => void;
  reorderSteps: (fromIndex: number, toIndex: number) => void;
  addShape: (shape: Omit<GuideShape, 'id'> & { id?: string }) => string;
  updateShape: (id: string, updates: Partial<GuideShape>) => void;
  removeShape: (id: string) => void;
  clearShapes: () => void;
  setSelectedStepId: (id: string | null) => void;
  setSelectedShapeId: (id: string | null) => void;
  deleteSelected: () => void;
  cropPage: (norm_x1: number, norm_y1: number, norm_x2: number, norm_y2: number) => Promise<void>;
  setHoveredStepId: (id: string | null) => void;
  toggleSidebar: () => void;
  resetAll: () => void;
}

export const usePdfGuideStore = create<PdfGuideState>((set, get) => ({
  isOpen: false,
  docInfo: null,
  currentPage: 1,
  pageImageUrl: null,
  isLoadingPage: false,
  isUploading: false,
  error: null,

  zoom: 1,
  panX: 0,
  panY: 0,
  canvasWidth: 1000,

  activeTool: 'pan',
  activeColor: 'blue',
  badgeSize: 28, // Default slider size
  currentDpi: 300, // 300 DPI for print-quality vector crispness

  steps: [],
  shapes: [],
  selectedStepId: null,
  selectedShapeId: null,
  hoveredStepId: null,
  isSidebarOpen: false,
  isExportingPdf: false,

  history: [],
  future: [],
  canRevertCrop: false,
  lastCropTransform: null,

  openStudio: () => set({ isOpen: true }),
  closeStudio: () => set({ isOpen: false }),

  setDocInfo: (doc) => set({ docInfo: doc }),

  setCurrentDpi: (dpi) => {
    set({ currentDpi: dpi });
    const { docInfo, currentPage } = get();
    if (docInfo) {
      get().loadPageImage(docInfo.doc_id, currentPage, dpi);
    }
  },

  setCurrentPage: (page) => {
    const { docInfo, currentDpi } = get();
    if (!docInfo) return;
    const clamped = Math.max(1, Math.min(page, docInfo.total_pages));
    set({ currentPage: clamped });
    get().loadPageImage(docInfo.doc_id, clamped, currentDpi);
  },

  loadPageImage: async (docId: string, pageNum: number, dpi?: number) => {
    set({ isLoadingPage: true, error: null });
    const targetDpi = dpi || get().currentDpi || 300;
    try {
      const url = `/api/pdf_tools/page_image/${docId}/${pageNum}?dpi=${targetDpi}&t=${Date.now()}`;
      // Pre-load image to avoid flicker
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load page image.'));
        img.src = url;
      });
      set({ pageImageUrl: url, isLoadingPage: false });
    } catch (err: any) {
      set({ error: err.message || 'Error loading page', isLoadingPage: false });
    }
  },

  uploadPdf: async (file: File) => {
    set({ isUploading: true, error: null });
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/pdf_tools/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Upload failed');
      }

      const doc: PdfDocumentInfo = await res.json();
      set({
        docInfo: doc,
        currentPage: 1,
        isUploading: false,
        steps: [],
        selectedStepId: null,
        zoom: 1,
        panX: 0,
        panY: 0,
      });
      await get().loadPageImage(doc.doc_id, 1, get().currentDpi || 300);
    } catch (err: any) {
      set({ error: err.message || 'Failed to upload PDF', isUploading: false });
    }
  },

  exportPdf: async () => {
    const { docInfo, currentPage, badgeSize, steps, shapes, canvasWidth } = get();
    if (!docInfo) return;
    set({ isExportingPdf: true });
    try {
      const payload = {
        doc_id: docInfo.doc_id,
        current_page: currentPage,
        badge_size: badgeSize,
        canvas_width: canvasWidth || 1000,
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

      const res = await fetch('/api/pdf_tools/export_flattened_pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('PDF Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Guide_${docInfo.filename.replace('.pdf', '')}_p${currentPage}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err: any) {
      console.error('Failed to export flattened PDF:', err);
      set({ error: err.message || 'Export PDF failed' });
    } finally {
      set({ isExportingPdf: false });
    }
  },

  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      isSidebarOpen: tool === 'step',
    }),
  setActiveColor: (color) => set({ activeColor: color }),

  setBadgeSize: (size) => set({ badgeSize: Math.max(16, Math.min(64, Math.round(size))) }),

  setZoom: (zoomOrFn) =>
    set((state) => {
      const newZoom = typeof zoomOrFn === 'function' ? zoomOrFn(state.zoom) : zoomOrFn;
      return { zoom: Math.max(0.1, Math.min(10, Number(newZoom.toFixed(2)))) };
    }),

  setPan: (panX, panY) => set({ panX, panY }),

  setCanvasWidth: (w) => set({ canvasWidth: Math.max(200, Math.round(w)) }),

  resetViewport: () => set({ zoom: 1, panX: 0, panY: 0 }),

  undo: () => {
    const { history, future, steps, shapes, canRevertCrop } = get();
    if (history.length === 0) {
      if (canRevertCrop) {
        get().undoCropPage();
      }
      return;
    }
    const previous = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    set({
      history: newHistory,
      future: [{ steps, shapes }, ...future],
      steps: previous.steps,
      shapes: previous.shapes,
      selectedStepId: null,
      selectedShapeId: null,
    });
  },

  redo: () => {
    const { history, future, steps, shapes } = get();
    if (future.length === 0) return;
    const next = future[0];
    const newFuture = future.slice(1);
    set({
      history: [...history, { steps, shapes }],
      future: newFuture,
      steps: next.steps,
      shapes: next.shapes,
      selectedStepId: null,
      selectedShapeId: null,
    });
  },

  undoCropPage: async () => {
    const { docInfo, currentPage, currentDpi, steps, shapes, lastCropTransform } = get();
    if (!docInfo) return;
    set({ isLoadingPage: true, error: null });

    // Transform steps & shapes back to original uncropped coordinates if transform was recorded
    let revertedSteps = steps;
    let revertedShapes = shapes;
    if (lastCropTransform) {
      const { min_x, min_y, crop_w, crop_h } = lastCropTransform;
      revertedSteps = steps.map((s) => ({
        ...s,
        norm_x: s.norm_x * crop_w + min_x,
        norm_y: s.norm_y * crop_h + min_y,
      }));
      revertedShapes = shapes.map((s) => {
        if (s.type === 'arrow') {
          return {
            ...s,
            norm_x1: s.norm_x1 * crop_w + min_x,
            norm_y1: s.norm_y1 * crop_h + min_y,
            norm_x2: s.norm_x2 * crop_w + min_x,
            norm_y2: s.norm_y2 * crop_h + min_y,
          };
        }
        return {
          ...s,
          norm_x1: s.norm_x1 * crop_w + min_x,
          norm_y1: s.norm_y1 * crop_h + min_y,
          norm_x2: s.norm_x2 * crop_w + min_x,
          norm_y2: s.norm_y2 * crop_h + min_y,
        };
      });
    }

    try {
      const payload = {
        doc_id: docInfo.doc_id,
        page_number: currentPage,
        norm_x1: 0,
        norm_y1: 0,
        norm_x2: 1,
        norm_y2: 1,
      };

      const res = await fetch('/api/pdf_tools/undo_crop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to revert crop');
      }

      const data = await res.json();
      if (data.pages) {
        set({
          docInfo: { ...docInfo, pages: data.pages },
          steps: revertedSteps,
          shapes: revertedShapes,
          canRevertCrop: false,
          lastCropTransform: null,
        });
      }

      await get().loadPageImage(docInfo.doc_id, currentPage, currentDpi);
    } catch (err: any) {
      set({ error: err.message || 'Revert crop failed', isLoadingPage: false });
    }
  },

  addStep: (norm_x: number, norm_y: number) => {
    const { steps, shapes, history } = get();
    const nextNum = steps.length + 1;
    const colors: StepBadgeColor[] = ['blue', 'red', 'green', 'amber', 'purple'];
    const newStep: StepBadge = {
      id: `step_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      step_number: nextNum,
      norm_x: Math.max(0, Math.min(1, norm_x)),
      norm_y: Math.max(0, Math.min(1, norm_y)),
      title: `Step ${nextNum}`,
      description: '',
      color: colors[(nextNum - 1) % colors.length],
      created_at: new Date().toISOString(),
    };

    set({
      history: [...history.slice(-30), { steps, shapes }],
      future: [],
      steps: [...steps, newStep],
      selectedStepId: newStep.id,
      isSidebarOpen: true,
    });
    return newStep;
  },

  updateStep: (id: string, updates: Partial<StepBadge>) => {
    set((state) => ({
      steps: state.steps.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  removeStep: (id: string) => {
    set((state) => {
      const filtered = state.steps.filter((s) => s.id !== id);
      // Auto-renumber 1..N
      const renumbered = filtered.map((s, idx) => ({
        ...s,
        step_number: idx + 1,
      }));
      return {
        history: [...state.history.slice(-30), { steps: state.steps, shapes: state.shapes }],
        future: [],
        steps: renumbered,
        selectedStepId: state.selectedStepId === id ? null : state.selectedStepId,
      };
    });
  },

  reorderSteps: (fromIndex: number, toIndex: number) => {
    set((state) => {
      if (
        fromIndex < 0 ||
        fromIndex >= state.steps.length ||
        toIndex < 0 ||
        toIndex >= state.steps.length
      ) {
        return state;
      }
      const newSteps = [...state.steps];
      const [moved] = newSteps.splice(fromIndex, 1);
      newSteps.splice(toIndex, 0, moved);

      // Auto-renumber 1..N based on new array order
      const renumbered = newSteps.map((s, idx) => ({
        ...s,
        step_number: idx + 1,
      }));
      return {
        history: [...state.history.slice(-30), { steps: state.steps, shapes: state.shapes }],
        future: [],
        steps: renumbered,
      };
    });
  },

  addShape: (shape) => {
    const id = (shape as any).id || `shape_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    set((state) => ({
      history: [...state.history.slice(-30), { steps: state.steps, shapes: state.shapes }],
      future: [],
      shapes: [...state.shapes, { ...shape, id }],
      selectedShapeId: id,
    }));
    return id;
  },

  updateShape: (id, updates) => {
    set((state) => ({
      shapes: state.shapes.map((s) => (s.id === id ? { ...s, ...updates } : s)),
    }));
  },

  removeShape: (id) => {
    set((state) => ({
      history: [...state.history.slice(-30), { steps: state.steps, shapes: state.shapes }],
      future: [],
      shapes: state.shapes.filter((s) => s.id !== id),
      selectedShapeId: state.selectedShapeId === id ? null : state.selectedShapeId,
    }));
  },

  clearShapes: () =>
    set((state) => ({
      history: [...state.history.slice(-30), { steps: state.steps, shapes: state.shapes }],
      future: [],
      shapes: [],
      selectedShapeId: null,
    })),

  setSelectedStepId: (id) => set({ selectedStepId: id, selectedShapeId: null }),
  setSelectedShapeId: (id) => set({ selectedShapeId: id, selectedStepId: null }),

  deleteSelected: () => {
    const { selectedStepId, selectedShapeId } = get();
    if (selectedStepId) {
      get().removeStep(selectedStepId);
    } else if (selectedShapeId) {
      get().removeShape(selectedShapeId);
    }
  },

  cropPage: async (norm_x1, norm_y1, norm_x2, norm_y2) => {
    const { docInfo, currentPage, currentDpi, steps, shapes, history } = get();
    if (!docInfo) return;

    const min_x = Math.max(0, Math.min(norm_x1, norm_x2));
    const min_y = Math.max(0, Math.min(norm_y1, norm_y2));
    const max_x = Math.min(1, Math.max(norm_x1, norm_x2));
    const max_y = Math.min(1, Math.max(norm_y1, norm_y2));
    const crop_w = max_x - min_x;
    const crop_h = max_y - min_y;

    if (crop_w < 0.005 || crop_h < 0.005) return;

    // 1. Transform existing steps to remain at exact physical locations on the cropped page
    const updatedSteps = steps.map((s) => ({
      ...s,
      norm_x: (s.norm_x - min_x) / crop_w,
      norm_y: (s.norm_y - min_y) / crop_h,
    }));

    // 2. Transform existing shapes to remain at exact physical locations on the cropped page
    const updatedShapes = shapes.map((s) => {
      if (s.type === 'arrow') {
        return {
          ...s,
          norm_x1: (s.norm_x1 - min_x) / crop_w,
          norm_y1: (s.norm_y1 - min_y) / crop_h,
          norm_x2: (s.norm_x2 - min_x) / crop_w,
          norm_y2: (s.norm_y2 - min_y) / crop_h,
        };
      }
      const x1 = (s.norm_x1 - min_x) / crop_w;
      const y1 = (s.norm_y1 - min_y) / crop_h;
      const x2 = (s.norm_x2 - min_x) / crop_w;
      const y2 = (s.norm_y2 - min_y) / crop_h;
      return {
        ...s,
        norm_x1: Math.min(x1, x2),
        norm_y1: Math.min(y1, y2),
        norm_x2: Math.max(x1, x2),
        norm_y2: Math.max(y1, y2),
      };
    });

    set({
      history: [...history.slice(-30), { steps, shapes }],
      future: [],
      steps: updatedSteps,
      shapes: updatedShapes,
      lastCropTransform: { min_x, min_y, crop_w, crop_h },
      isLoadingPage: true,
      error: null,
    });

    try {
      const payload = {
        doc_id: docInfo.doc_id,
        page_number: currentPage,
        norm_x1: min_x,
        norm_y1: min_y,
        norm_x2: max_x,
        norm_y2: max_y,
      };

      const res = await fetch('/api/pdf_tools/crop_page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to crop page');
      }

      const data = await res.json();
      // Update docInfo with updated page sizes
      if (data.pages) {
        set({ docInfo: { ...docInfo, pages: data.pages }, canRevertCrop: true });
      }

      // Reload fresh cropped image
      await get().loadPageImage(docInfo.doc_id, currentPage, currentDpi);
    } catch (err: any) {
      set({ error: err.message || 'Crop failed', isLoadingPage: false });
    }
  },

  rotatePage: async (angle = 90) => {
    const { docInfo, currentPage, currentDpi, steps, shapes, history } = get();
    if (!docInfo) return;

    // 1. Rotate existing steps 90 deg clockwise:
    // (x, y) -> (1 - y, x)
    const rotatedSteps = steps.map((s) => ({
      ...s,
      norm_x: 1 - s.norm_y,
      norm_y: s.norm_x,
    }));

    // 2. Rotate existing shapes 90 deg clockwise:
    const rotatedShapes = shapes.map((s) => {
      if (s.type === 'arrow') {
        return {
          ...s,
          norm_x1: 1 - s.norm_y1,
          norm_y1: s.norm_x1,
          norm_x2: 1 - s.norm_y2,
          norm_y2: s.norm_x2,
        };
      }
      const x1 = 1 - s.norm_y2;
      const y1 = s.norm_x1;
      const x2 = 1 - s.norm_y1;
      const y2 = s.norm_x2;
      return {
        ...s,
        norm_x1: Math.min(x1, x2),
        norm_y1: Math.min(y1, y2),
        norm_x2: Math.max(x1, x2),
        norm_y2: Math.max(y1, y2),
      };
    });

    set({
      history: [...history.slice(-30), { steps, shapes }],
      future: [],
      steps: rotatedSteps,
      shapes: rotatedShapes,
      isLoadingPage: true,
      error: null,
    });

    try {
      const payload = {
        doc_id: docInfo.doc_id,
        page_number: currentPage,
        angle,
      };

      const res = await fetch('/api/pdf_tools/rotate_page', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to rotate page');
      }

      const data = await res.json();
      if (data.pages) {
        set({ docInfo: { ...docInfo, pages: data.pages } });
      }

      await get().loadPageImage(docInfo.doc_id, currentPage, currentDpi);
    } catch (err: any) {
      set({ error: err.message || 'Rotate page failed', isLoadingPage: false });
    }
  },
  setHoveredStepId: (id) => set({ hoveredStepId: id }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  resetAll: () =>
    set({
      docInfo: null,
      currentPage: 1,
      pageImageUrl: null,
      steps: [],
      shapes: [],
      selectedStepId: null,
      selectedShapeId: null,
      hoveredStepId: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      history: [],
      future: [],
      canRevertCrop: false,
      lastCropTransform: null,
      error: null,
      activeTool: 'pan',
    }),
}));
