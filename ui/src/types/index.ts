export type LogType = 'log' | 'step_start' | 'step_end' | 'complete' | 'error';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED';

export interface LogMessage {
  type: LogType;
  task?: string | null;
  status: TaskStatus;
  message: string;
  timestamp: number;
  details?: Record<string, unknown> | null;
}

export interface RunImages {
  brand_cropped?: string | null;
  vendor_cropped?: string | null;
  overlay?: string | null;
  absdiff_heatmap?: string | null;
  grid_vectors?: string | null;
  frame_brand?: string | null;
  frame_vendor?: string | null;
  single_image?: string | null;
}


export interface RunReport {
  run_id: string;
  timestamp_utc: string;
  mode: string;
  run_type?: string | null;
  target_size_mm: [number, number];
  status: string;
  exit_code: number;
  error?: string | null;
  tasks?: Record<string, unknown>;
  inputs?: Record<string, unknown>;
}


export interface RunStatusResponse {
  run_id: string;
  status: string;
  exit_code?: number | null;
  error?: string | null;
  images: RunImages;
  report?: RunReport | null;
}

export type DefectTag = 'content' | 'shift' | 'barcode' | 'missing_char' | 'color' | 'other';
export type DefectSeverity = 'critical' | 'major' | 'minor';

export interface DefectBox {
  id: string;
  norm_x: number;
  norm_y: number;
  norm_w: number;
  norm_h: number;
  bbox_mm?: [number, number, number, number] | null;
  tag: DefectTag;
  severity: DefectSeverity;
  note: string;
  created_at: string;
}

export type ActiveTool = 'pan' | 'box' | 'loupe' | 'flicker';
export type RotationAngle = 0 | 90 | 180 | 270;

export interface ViewportTransform {
  zoom: number;
  panX: number;
  panY: number;
  rotation: RotationAngle;
}

export interface PastRunSummary {
  run_id: string;
  timestamp_utc?: string | null;
  status: string;
  run_type?: string | null;
  exit_code?: number | null;
  brand_filename?: string | null;
  vendor_filename?: string | null;
  target_size_mm?: [number, number] | null;
  annotations_count: number;
  has_images: boolean;
}

export type InspectionType = 'compare' | 'single';
export type MainFunctionTab = 'history' | 'compare' | 'single';
export type CompareCropMode = 'auto' | 'full' | 'manual';

export interface ManualAlignPrepareData {
  run_id: string;
  brand_image: string;
  vendor_image: string;
  brand_size_mm: [number, number];
  vendor_size_mm: [number, number];
  brand_shape_px: [number, number];
  vendor_shape_px: [number, number];
  initial_crop_bbox_mm: [number, number, number, number];
  brand_filename: string;
  vendor_filename: string;
  brand_page: number;
  vendor_page: number;
  initial_transform?: {
    offset_x_mm: number;
    offset_y_mm: number;
    scale_x: number;
    scale_y: number;
    rotation_deg: number;
  } | null;
}



