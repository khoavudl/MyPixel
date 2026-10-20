export type StepBadgeColor = 'blue' | 'red' | 'green' | 'amber' | 'purple';

export interface StepBadge {
  id: string;
  step_number: number;
  norm_x: number; // 0 to 1
  norm_y: number; // 0 to 1
  title: string;
  description: string;
  color: StepBadgeColor;
  created_at: string;
}

export type AnnotationShapeType = 'arrow' | 'box' | 'blur' | 'text';

export interface GuideShape {
  id: string;
  type: AnnotationShapeType;
  color: StepBadgeColor;
  norm_x1: number;
  norm_y1: number;
  norm_x2: number;
  norm_y2: number;
  text?: string;
  font_size?: number;
  has_fill?: boolean;
  stroke_width?: number;
}

export interface PdfPageInfo {
  page_number: number;
  width_pt: number;
  height_pt: number;
  width_mm: number;
  height_mm: number;
}

export interface PdfDocumentInfo {
  doc_id: string;
  filename: string;
  total_pages: number;
  pages: PdfPageInfo[];
}

export type GuideToolMode = 'pan' | 'step' | 'arrow' | 'box' | 'blur' | 'crop' | 'text';

