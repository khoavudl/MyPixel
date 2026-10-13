import { create } from 'zustand';
import {
  ActiveTool,
  DefectBox,
  LogMessage,
  RunStatusResponse,
  ViewportTransform,
} from '../types';

export type AppViewMode = 'setup' | 'console' | 'workspace';

interface InspectionState {
  // Setup inputs
  brandFile: File | null;
  vendorFile: File | null;
  targetSizeMm: string;
  brandPage: number;
  vendorPage: number;

  // Run execution
  runId: string | null;
  isAnalyzing: boolean;
  logs: LogMessage[];
  runStatus: RunStatusResponse | null;
  viewMode: AppViewMode;

  // Viewport & Canvas Sync
  activeTool: ActiveTool;
  viewport: ViewportTransform;
  isSynced: boolean;
  isFlickering: boolean;
  flickerTarget: 'brand' | 'vendor';
  loupeNormalizedPos: { x: number; y: number } | null;

  // Annotations
  annotations: DefectBox[];
  selectedBoxId: string | null;
  hoveredBoxId: string | null;
  activeEditingBox: DefectBox | null;
  isSidebarOpen: boolean;
  naturalImageSize: { w: number; h: number } | null;

  // Actions
  setBrandFile: (file: File | null) => void;
  setVendorFile: (file: File | null) => void;
  setTargetSizeMm: (size: string) => void;
  setBrandPage: (page: number) => void;
  setVendorPage: (page: number) => void;
  setRunId: (id: string | null) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
  setRunStatus: (status: RunStatusResponse | null) => void;
  setViewMode: (mode: AppViewMode) => void;
  setActiveTool: (tool: ActiveTool) => void;
  setLoupeNormalizedPos: (pos: { x: number; y: number } | null) => void;
  setViewport: (transform: Partial<ViewportTransform>) => void;
  resetViewport: () => void;
  setIsSynced: (synced: boolean) => void;
  setIsFlickering: (flickering: boolean) => void;
  toggleFlickerTarget: () => void;
  addAnnotation: (box: DefectBox) => void;
  updateAnnotation: (id: string, updates: Partial<DefectBox>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedBoxId: (id: string | null) => void;
  setHoveredBoxId: (id: string | null) => void;
  setActiveEditingBox: (box: DefectBox | null) => void;
  setIsSidebarOpen: (open: boolean) => void;
  setNaturalImageSize: (size: { w: number; h: number } | null) => void;
  jumpToBox: (box: DefectBox) => void;
  resetAll: () => void;
}

const defaultViewport: ViewportTransform = {
  zoom: 1,
  panX: 0,
  panY: 0,
};

export const useInspectionStore = create<InspectionState>((set) => ({
  brandFile: null,
  vendorFile: null,
  targetSizeMm: '620x250',
  brandPage: 1,
  vendorPage: 1,

  runId: null,
  isAnalyzing: false,
  logs: [],
  runStatus: null,
  viewMode: 'setup',

  activeTool: 'pan',
  viewport: defaultViewport,
  isSynced: true,
  isFlickering: false,
  flickerTarget: 'brand',
  loupeNormalizedPos: null,

  annotations: [],
  selectedBoxId: null,
  hoveredBoxId: null,
  activeEditingBox: null,
  isSidebarOpen: true,
  naturalImageSize: null,

  setBrandFile: (file) => set({ brandFile: file }),
  setVendorFile: (file) => set({ vendorFile: file }),
  setTargetSizeMm: (size) => set({ targetSizeMm: size }),
  setBrandPage: (page) => set({ brandPage: page }),
  setVendorPage: (page) => set({ vendorPage: page }),
  setRunId: (id) => set({ runId: id }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
  addLog: (log) => set((state) => ({ logs: [...state.logs, log] })),
  clearLogs: () => set({ logs: [] }),
  setRunStatus: (status) => set({ runStatus: status }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setActiveTool: (tool) =>
    set({
      activeTool: tool,
      loupeNormalizedPos: null,
    }),
  setLoupeNormalizedPos: (pos) => set({ loupeNormalizedPos: pos }),
  setViewport: (transform) =>
    set((state) => ({
      viewport: { ...state.viewport, ...transform },
    })),
  resetViewport: () => set({ viewport: defaultViewport }),
  setIsSynced: (synced) => set({ isSynced: synced }),
  setIsFlickering: (flickering) => set({ isFlickering: flickering }),
  toggleFlickerTarget: () =>
    set((state) => ({
      flickerTarget: state.flickerTarget === 'brand' ? 'vendor' : 'brand',
    })),
  addAnnotation: (box) =>
    set((state) => ({ annotations: [...state.annotations, box] })),
  updateAnnotation: (id, updates) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),
  deleteAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedBoxId: state.selectedBoxId === id ? null : state.selectedBoxId,
      activeEditingBox: state.activeEditingBox?.id === id ? null : state.activeEditingBox,
    })),
  setSelectedBoxId: (id) => set({ selectedBoxId: id }),
  setHoveredBoxId: (id) => set({ hoveredBoxId: id }),
  setActiveEditingBox: (box) => set({ activeEditingBox: box }),
  setIsSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setNaturalImageSize: (size) => set({ naturalImageSize: size }),
  jumpToBox: (box) =>
    set((state) => {
      const imgW = state.naturalImageSize?.w || 6000;
      const imgH = state.naturalImageSize?.h || 2500;
      const boxCenterX = (box.norm_x + box.norm_w / 2) * imgW;
      const boxCenterY = (box.norm_y + box.norm_h / 2) * imgH;

      const containerW = window.innerWidth * 0.45;
      const containerH = (window.innerHeight - 80) * 0.45;

      const targetZoom = Math.min(3.5, Math.max(1.0, containerW / (box.norm_w * imgW * 2.5)));
      const newPanX = containerW / 2 - boxCenterX * targetZoom;
      const newPanY = containerH / 2 - boxCenterY * targetZoom;

      return {
        viewport: { zoom: targetZoom, panX: newPanX, panY: newPanY },
        selectedBoxId: box.id,
      };
    }),
  resetAll: () =>
    set({
      brandFile: null,
      vendorFile: null,
      runId: null,
      isAnalyzing: false,
      logs: [],
      runStatus: null,
      viewMode: 'setup',
      viewport: defaultViewport,
      annotations: [],
      selectedBoxId: null,
      hoveredBoxId: null,
      activeEditingBox: null,
      isSidebarOpen: true,
      naturalImageSize: null,
      loupeNormalizedPos: null,
    }),
}));
