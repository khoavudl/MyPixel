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

  // Annotations
  annotations: DefectBox[];
  selectedBoxId: string | null;

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
  setViewport: (transform: Partial<ViewportTransform>) => void;
  resetViewport: () => void;
  setIsSynced: (synced: boolean) => void;
  setIsFlickering: (flickering: boolean) => void;
  toggleFlickerTarget: () => void;
  addAnnotation: (box: DefectBox) => void;
  updateAnnotation: (id: string, updates: Partial<DefectBox>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedBoxId: (id: string | null) => void;
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

  annotations: [],
  selectedBoxId: null,

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
  setActiveTool: (tool) => set({ activeTool: tool }),
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
    })),
  setSelectedBoxId: (id) => set({ selectedBoxId: id }),
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
    }),
}));
