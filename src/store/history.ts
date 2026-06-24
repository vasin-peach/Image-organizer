import { create } from 'zustand';
import type {
  LayoutConfig,
  SortConfig,
  StyleConfig,
  CellAdjust,
  MosaicAdjust,
  CropOverride,
  ImageMetadata,
} from '../types';
import { useConfigStore } from './config';
import { useImagesStore } from './images';

const MAX_HISTORY = 50;

export interface HistorySnapshot {
  layout: LayoutConfig;
  sort: SortConfig;
  style: StyleConfig;
  cellAdjust: CellAdjust | null;
  mosaicAdjust: MosaicAdjust | null;
  images: Array<{
    id: string;
    included: boolean;
    cropOverride: CropOverride;
    metadata: ImageMetadata | null;
    analyzing: boolean;
    width: number;
    height: number;
    file: File;
    url: string;
  }>;
  orderedIds: string[];
}

interface HistoryState {
  past: HistorySnapshot[];
  future: HistorySnapshot[];
  gestureCount: number;
  canUndo: boolean;
  canRedo: boolean;

  pushSnapshot: (snap: HistorySnapshot) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  beginGesture: () => void;
  endGesture: () => void;
}

function cloneImageEntry(
  img: ReturnType<typeof useImagesStore.getState>['images'][number]
): HistorySnapshot['images'][number] {
  return {
    ...img,
    cropOverride: { ...img.cropOverride },
    metadata: img.metadata
      ? {
          ...img.metadata,
          dominantColors: img.metadata.dominantColors.map((c) => ({ ...c })),
          subjectCenter: { ...img.metadata.subjectCenter },
        }
      : null,
  };
}

export function captureSnapshot(): HistorySnapshot {
  const cfg = useConfigStore.getState();
  const imgs = useImagesStore.getState();
  return {
    layout: structuredClone(cfg.layout),
    sort: structuredClone(cfg.sort),
    style: structuredClone(cfg.style),
    cellAdjust: cfg.cellAdjust ? structuredClone(cfg.cellAdjust) : null,
    mosaicAdjust: cfg.mosaicAdjust ? structuredClone(cfg.mosaicAdjust) : null,
    images: imgs.images.map(cloneImageEntry),
    orderedIds: [...imgs.orderedIds],
  };
}

function applySnapshot(snap: HistorySnapshot): void {
  const current = useImagesStore.getState().images;
  for (const img of current) {
    URL.revokeObjectURL(img.url);
  }

  useConfigStore.setState({
    layout: structuredClone(snap.layout),
    sort: structuredClone(snap.sort),
    style: structuredClone(snap.style),
    cellAdjust: snap.cellAdjust ? structuredClone(snap.cellAdjust) : null,
    mosaicAdjust: snap.mosaicAdjust ? structuredClone(snap.mosaicAdjust) : null,
  });

  useImagesStore.setState({
    images: snap.images.map((img) => ({
      ...cloneImageEntry(img),
      url: URL.createObjectURL(img.file),
    })),
    orderedIds: [...snap.orderedIds],
  });
}

function syncFlags(past: HistorySnapshot[], future: HistorySnapshot[]) {
  return {
    canUndo: past.length > 0,
    canRedo: future.length > 0,
  };
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  gestureCount: 0,
  canUndo: false,
  canRedo: false,

  pushSnapshot: (snap) => {
    set((s) => {
      const past = [...s.past, snap];
      if (past.length > MAX_HISTORY) past.shift();
      return { past, future: [], ...syncFlags(past, []) };
    });
  },

  undo: () => {
    const { past, future } = get();
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    const current = captureSnapshot();
    applySnapshot(previous);
    const nextPast = past.slice(0, -1);
    const nextFuture = [current, ...future];
    set({
      past: nextPast,
      future: nextFuture,
      ...syncFlags(nextPast, nextFuture),
    });
  },

  redo: () => {
    const { past, future } = get();
    if (future.length === 0) return;
    const next = future[0];
    const current = captureSnapshot();
    applySnapshot(next);
    const nextPast = [...past, current];
    const nextFuture = future.slice(1);
    if (nextPast.length > MAX_HISTORY) nextPast.shift();
    set({
      past: nextPast,
      future: nextFuture,
      ...syncFlags(nextPast, nextFuture),
    });
  },

  clear: () => set({ past: [], future: [], ...syncFlags([], []) }),

  beginGesture: () => {
    set((s) => {
      if (s.gestureCount === 0) {
        get().pushSnapshot(captureSnapshot());
      }
      return { gestureCount: s.gestureCount + 1 };
    });
  },

  endGesture: () => {
    set((s) => ({ gestureCount: Math.max(0, s.gestureCount - 1) }));
  },
}));

/** Record current state before a discrete edit (skipped during gestures). */
export function recordHistory(): void {
  const { gestureCount, pushSnapshot } = useHistoryStore.getState();
  if (gestureCount > 0) return;
  pushSnapshot(captureSnapshot());
}

export function beginHistoryGesture(): void {
  useHistoryStore.getState().beginGesture();
}

export function endHistoryGesture(): void {
  useHistoryStore.getState().endGesture();
}
