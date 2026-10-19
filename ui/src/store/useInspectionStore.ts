import { create } from 'zustand';
import {
  ActiveTool,
  CompareCropMode,
  DefectBox,
  InspectionType,
  LogMessage,
  MainFunctionTab,
  ManualAlignPrepareData,
  RotationAngle,
  RunStatusResponse,
  ViewportTransform,
} from '../types';
import { canonicalToScreen, getDisplayedDimensions } from '../utils/coordinateTransform';

export type AppViewMode = 'setup' | 'console' | 'workspace' | 'manual_align';

interface InspectionState {
  // Navigation / Main screen functions
  activeMainTab: MainFunctionTab;
  inspectionType: InspectionType;

  // Function 2: Setup inputs (Compare)
  brandFile: File | null;
  vendorFile: File | null;
  targetSizeMm: string;
  brandPage: number;
  vendorPage: number;
  compareCropMode: CompareCropMode;
  manualAlignData: ManualAlignPrepareData | null;

  // Function 3: Setup inputs (Single Inspection)
  singleFile: File | null;
  singlePage: number;
  singleTargetSizeMm: string;
  singleCropMode: 'auto' | 'full';

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
  setActiveMainTab: (tab: MainFunctionTab) => void;
  setInspectionType: (type: InspectionType) => void;
  setBrandFile: (file: File | null) => void;
  setVendorFile: (file: File | null) => void;
  setTargetSizeMm: (size: string) => void;
  setBrandPage: (page: number) => void;
  setVendorPage: (page: number) => void;
  setCompareCropMode: (mode: CompareCropMode) => void;
  setManualAlignData: (data: ManualAlignPrepareData | null) => void;
  setSingleFile: (file: File | null) => void;
  setSinglePage: (page: number) => void;
  setSingleTargetSizeMm: (size: string) => void;
  setSingleCropMode: (mode: 'auto' | 'full') => void;
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
  activeMainTab: 'compare',
  inspectionType: 'compare',

  brandFile: null,
  vendorFile: null,
  targetSizeMm: '',
  brandPage: 1,
  vendorPage: 1,
  compareCropMode: 'auto',

  singleFile: null,
  singlePage: 1,
  singleTargetSizeMm: '',
  singleCropMode: 'auto',

  runId: null,
  isAnalyzing: false,
  logs: [],
  runStatus: null,
  viewMode: 'setup',
  manualAlignData: null,

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

  setActiveMainTab: (tab) => set({ activeMainTab: tab }),
  setInspectionType: (type) => set({ inspectionType: type }),
  setBrandFile: (file) => set({ brandFile: file }),
  setVendorFile: (file) => set({ vendorFile: file }),
  setTargetSizeMm: (size) => set({ targetSizeMm: size }),
  setBrandPage: (page) => set({ brandPage: page }),
  setVendorPage: (page) => set({ vendorPage: page }),
  setCompareCropMode: (mode) => set({ compareCropMode: mode }),
  setManualAlignData: (data) => set({ manualAlignData: data }),
  setSingleFile: (file) => set({ singleFile: file }),
  setSinglePage: (page) => set({ singlePage: page }),
  setSingleTargetSizeMm: (size) => set({ singleTargetSizeMm: size }),
  setSingleCropMode: (mode) => set({ singleCropMode: mode }),
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

      const isSingle =
        state.inspectionType === 'single' ||
        state.runStatus?.report?.mode === 'single' ||
        state.runStatus?.report?.run_type === 'single';

      const sidebarWidth = state.isSidebarOpen ? 224 : 0;
      const totalAvailableW = Math.max(200, window.innerWidth - sidebarWidth - 36);
      const totalAvailableH = Math.max(200, window.innerHeight - 56 - 36);

      const containerW = isSingle ? totalAvailableW : totalAvailableW / 2;
      const containerH = isSingle ? totalAvailableH : totalAvailableH / 2;

      const boxDisplayW =
        rot === 90 || rot === 270 ? box.norm_h * imgH : box.norm_w * imgW;
      const boxDisplayH =
        rot === 90 || rot === 270 ? box.norm_w * imgW : box.norm_h * imgH;

      // 1.35 factor ensures box fills ~75% of container with 12-15% clean margins on all sides
      const paddingFactor = 1.35;
      const zoomW = containerW / Math.max(10, boxDisplayW * paddingFactor);
      const zoomH = containerH / Math.max(10, boxDisplayH * paddingFactor);

      // Clamp between 0.05 (handles ultra-wide / ultra-tall boxes on 8000px artboards) and 3.0 (for tiny marks)
      const targetZoom = Math.min(3.0, Math.max(0.05, Math.min(zoomW, zoomH)));

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
      singleFile: null,
      singlePage: 1,
      singleTargetSizeMm: '620x250',
      singleCropMode: 'auto',
      inspectionType: 'compare',
      runId: null,
      isAnalyzing: false,
      logs: [],
      runStatus: null,
      viewMode: 'setup',
      manualAlignData: null,
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
