import { create } from 'zustand';
import {
  ActiveTool,
  DefectBox,
  LogMessage,
  RotationAngle,
  RunStatusResponse,
  ViewportTransform,
} from '../types';
import { canonicalToScreen, getDisplayedDimensions } from '../utils/coordinateTransform';

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
  loupeScaleFactor: number;

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
  setLoupeScaleFactor: (factor: number) => void;
  setViewport: (transform: Partial<ViewportTransform>) => void;
  resetViewport: () => void;
  rotateClockwise: () => void;
  rotateCounterClockwise: () => void;
  setRotation: (rotation: RotationAngle) => void;
  setIsSynced: (synced: boolean) => void;
  setIsFlickering: (flickering: boolean) => void;
  toggleFlickerTarget: () => void;
  setAnnotations: (annotations: DefectBox[]) => void;
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
  rotation: 0,
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
  loupeScaleFactor: 3.0,

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
  setLoupeScaleFactor: (factor) =>
    set({ loupeScaleFactor: Math.min(8.0, Math.max(1.5, Math.round(factor * 10) / 10)) }),
  setViewport: (transform) =>
    set((state) => ({
      viewport: { ...state.viewport, ...transform },
    })),
  resetViewport: () => set({ viewport: defaultViewport }),
  rotateClockwise: () =>
    set((state) => {
      const angles: RotationAngle[] = [0, 90, 180, 270];
      const idx = angles.indexOf(state.viewport.rotation || 0);
      const nextAngle = angles[(idx + 1) % 4];
      return {
        viewport: { ...state.viewport, rotation: nextAngle },
      };
    }),
  rotateCounterClockwise: () =>
    set((state) => {
      const angles: RotationAngle[] = [0, 90, 180, 270];
      const idx = angles.indexOf(state.viewport.rotation || 0);
      const nextAngle = angles[(idx + 3) % 4];
      return {
        viewport: { ...state.viewport, rotation: nextAngle },
      };
    }),
  setRotation: (rotation) =>
    set((state) => ({
      viewport: { ...state.viewport, rotation },
    })),
  setIsSynced: (synced) => set({ isSynced: synced }),
  setIsFlickering: (flickering) => set({ isFlickering: flickering }),
  toggleFlickerTarget: () =>
    set((state) => ({
      flickerTarget: state.flickerTarget === 'brand' ? 'vendor' : 'brand',
    })),
  setAnnotations: (annotations) => set({ annotations }),
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
      const rot = state.viewport.rotation || 0;

      // Center of the box in canonical space [0, 1]
      const canonicalCenterX = box.norm_x + box.norm_w / 2;
      const canonicalCenterY = box.norm_y + box.norm_h / 2;

      // Convert center to screen normalized coords and dimensions
      const { displayedW, displayedH } = getDisplayedDimensions(imgW, imgH, rot);
      const { uPrime, vPrime } = canonicalToScreen(canonicalCenterX, canonicalCenterY, rot);

      const boxCenterX = uPrime * displayedW;
      const boxCenterY = vPrime * displayedH;

      const containerW = window.innerWidth * 0.45;
      const containerH = (window.innerHeight - 80) * 0.45;

      const boxDisplayW =
        rot === 90 || rot === 270 ? box.norm_h * imgH : box.norm_w * imgW;
      const targetZoom = Math.min(
        3.5,
        Math.max(1.0, containerW / (boxDisplayW * 2.5))
      );
      const newPanX = containerW / 2 - boxCenterX * targetZoom;
      const newPanY = containerH / 2 - boxCenterY * targetZoom;

      return {
        viewport: { ...state.viewport, zoom: targetZoom, panX: newPanX, panY: newPanY },
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
