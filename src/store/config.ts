import { create } from 'zustand';
import type {
  LayoutConfig,
  SortConfig,
  StyleConfig,
  ExportConfig,
  ControlTab,
  Preset,
} from '../types';

export type MaxResolution = 0 | 720 | 1080 | 1920 | 2560 | 3840;
export const MAX_RES_OPTIONS: { value: MaxResolution; label: string }[] = [
  { value: 0,    label: 'Original (no resize)' },
  { value: 720,  label: '720px  (fastest)' },
  { value: 1080, label: '1080px' },
  { value: 1920, label: '1920px (recommended)' },
  { value: 2560, label: '2560px' },
  { value: 3840, label: '3840px (4K)' },
];

const defaultLayout: LayoutConfig = {
  mode: 'grid-uniform',
  lockMode: 'canvas',
  cols: 5,
  rows: 6,
  rowsManual: false,
  cellW: 200,
  cellH: 250,
  gap: 4,
  outerPad: 8,
  canvasW: 1032,
  canvasH: 1528,
  cellAspect: 0.8,
};

const defaultSort: SortConfig = {
  mode: 'none',
  reversed: false,
  weights: {
    hue: 1,
    brightness: 0,
    saturation: 0,
    temperature: 0,
    edgeDensity: 0,
    symmetry: 0,
    thirdsScore: 0,
  },
  twoAxis: { axisX: 'hue', axisY: 'brightness' },
  seed: 42,
};

const defaultStyle: StyleConfig = {
  bgColor: '#000000',
  borderRadius: 0,
  showBorder: false,
  borderColor: '#ffffff',
  borderWidth: 1,
};

const defaultExport: ExportConfig = {
  format: 'png',
  scale: 1,
  targetWidth: 1920,
  quality: 0.92,
  filename: 'collage',
};

interface ConfigState {
  layout: LayoutConfig;
  sort: SortConfig;
  style: StyleConfig;
  exportCfg: ExportConfig;
  activeTab: ControlTab;
  presets: Preset[];
  maxResolution: MaxResolution;

  setLayout: (patch: Partial<LayoutConfig>) => void;
  setSort: (patch: Partial<SortConfig>) => void;
  setStyle: (patch: Partial<StyleConfig>) => void;
  setExport: (patch: Partial<ExportConfig>) => void;
  setActiveTab: (tab: ControlTab) => void;
  setMaxResolution: (v: MaxResolution) => void;
  savePreset: (name: string) => void;
  loadPreset: (id: string) => void;
  deletePreset: (id: string) => void;
}

const PRESET_KEY = 'image-organizer-presets';

const loadPresetsFromStorage = (): Preset[] => {
  try {
    const raw = localStorage.getItem(PRESET_KEY);
    return raw ? (JSON.parse(raw) as Preset[]) : [];
  } catch {
    return [];
  }
};

const savePresetsToStorage = (presets: Preset[]) => {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets));
};

export const useConfigStore = create<ConfigState>((set, get) => ({
  layout: defaultLayout,
  sort: defaultSort,
  style: defaultStyle,
  exportCfg: defaultExport,
  activeTab: 'layout',
  presets: loadPresetsFromStorage(),
  maxResolution: 1920,

  setLayout: (patch) =>
    set((s) => ({ layout: { ...s.layout, ...patch } })),

  setSort: (patch) =>
    set((s) => ({ sort: { ...s.sort, ...patch } })),

  setStyle: (patch) =>
    set((s) => ({ style: { ...s.style, ...patch } })),

  setExport: (patch) =>
    set((s) => ({ exportCfg: { ...s.exportCfg, ...patch } })),

  setMaxResolution: (v) => set({ maxResolution: v }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  savePreset: (name) => {
    const { layout, sort, style, exportCfg, presets } = get();
    const preset: Preset = {
      id: crypto.randomUUID(),
      name,
      layout,
      sort,
      style,
      export: exportCfg,
      createdAt: Date.now(),
    };
    const next = [preset, ...presets];
    savePresetsToStorage(next);
    set({ presets: next });
  },

  loadPreset: (id) => {
    const preset = get().presets.find((p) => p.id === id);
    if (!preset) return;
    set({
      layout: preset.layout,
      sort: preset.sort,
      style: preset.style,
      exportCfg: preset.export,
    });
  },

  deletePreset: (id) => {
    const next = get().presets.filter((p) => p.id !== id);
    savePresetsToStorage(next);
    set({ presets: next });
  },
}));
