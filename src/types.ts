export interface DominantColor {
  r: number;
  g: number;
  b: number;
}

export interface ImageMetadata {
  dominantColors: DominantColor[];
  hue: number;         // 0–360
  saturation: number;  // 0–1
  lightness: number;   // 0–1
  brightness: number;  // 0–1 (luminance)
  temperature: number; // -1 cool → +1 warm
  edgeDensity: number; // 0–1
  symmetryH: number;   // 0–1
  symmetryV: number;   // 0–1
  subjectCenter: { x: number; y: number }; // 0–1 normalized
  thirdsScore: number; // 0–1 (1 = on rule-of-thirds point)
}

export type FitMode = 'smart' | 'center' | 'fit';

export interface CropOverride {
  mode: FitMode;
  offsetX: number; // -0.5 to 0.5
  offsetY: number;
  zoom: number;    // 1.0 to 2.0
}

export interface ImageEntry {
  id: string;
  file: File;
  url: string;       // object URL for display
  width: number;     // natural
  height: number;
  metadata: ImageMetadata | null;
  analyzing: boolean;
  included: boolean;
  cropOverride: CropOverride;
}

export type LayoutMode = 'grid-uniform' | 'grid-aspect' | 'mosaic';

export type LockMode = 'canvas' | 'cell' | 'aspect' | 'auto-cols';

export interface LayoutConfig {
  mode: LayoutMode;
  lockMode: LockMode;
  cols: number;
  rows: number;       // computed or manual
  rowsManual: boolean; // if true, rows is set by user; cols adjusts instead
  cellW: number;
  cellH: number;
  gap: number;
  outerPad: number;
  canvasW: number;    // computed
  canvasH: number;    // computed
  cellAspect: number; // cellW/cellH for 'aspect' lockMode
}

export type SortMode =
  | 'none'
  | 'dominantColor'
  | 'hueWheel'
  | 'brightness'
  | 'saturation'
  | 'temperature'
  | 'thirdsScore'
  | 'edgeDensity'
  | 'symmetry'
  | 'subjectPosition'
  | 'similarityChain'
  | 'twoAxis'
  | 'multiCriteria';

export interface SortWeights {
  hue: number;
  brightness: number;
  saturation: number;
  temperature: number;
  edgeDensity: number;
  symmetry: number;
  thirdsScore: number;
}

export interface TwoAxisConfig {
  axisX: keyof SortWeights;
  axisY: keyof SortWeights;
}

export interface SortConfig {
  mode: SortMode;
  reversed: boolean;
  weights: SortWeights;
  twoAxis: TwoAxisConfig;
  seed: number;
}

export interface StyleConfig {
  bgColor: string;
  borderRadius: number; // px per cell
  showBorder: boolean;
  borderColor: string;
  borderWidth: number;
}

export type ExportFormat = 'png' | 'jpeg' | 'webp';

export interface ExportConfig {
  format: ExportFormat;
  scale: number;      // multiplier, e.g. 1.0, 2.5, auto-computed from target width
  targetWidth: number; // 0 = use scale directly; >0 = derive scale from canvas width
  quality: number;   // 0–1 for jpeg/webp
  filename: string;
}

export interface Preset {
  id: string;
  name: string;
  layout: LayoutConfig;
  sort: SortConfig;
  style: StyleConfig;
  export: ExportConfig;
  createdAt: number;
}

export type ControlTab = 'layout' | 'sort' | 'style' | 'export';
