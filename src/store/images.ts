import { create } from 'zustand';
import type { ImageEntry, CropOverride, ImageMetadata } from '../types';
import { recordHistory, useHistoryStore } from './history';

interface ImagesState {
  images: ImageEntry[];
  orderedIds: string[]; // sorted order (ids)
  selectedId: string | null;
  cropModalId: string | null;

  addImages: (entries: ImageEntry[]) => void;
  removeImage: (id: string) => void;
  toggleInclude: (id: string) => void;
  setMetadata: (id: string, metadata: ImageMetadata) => void;
  setAnalyzing: (id: string, val: boolean) => void;
  setCropOverride: (id: string, override: Partial<CropOverride>) => void;
  setOrderedIds: (ids: string[]) => void;
  setSelectedId: (id: string | null) => void;
  openCropModal: (id: string) => void;
  closeCropModal: () => void;
  reorderManual: (fromIndex: number, toIndex: number) => void;
  clear: () => void;
}

export const useImagesStore = create<ImagesState>((set, get) => ({
  images: [],
  orderedIds: [],
  selectedId: null,
  cropModalId: null,

  addImages: (entries) => {
    recordHistory();
    set((s) => {
      const next = [...s.images, ...entries];
      const nextIds = [...s.orderedIds, ...entries.map((e) => e.id)];
      return { images: next, orderedIds: nextIds };
    });
  },

  removeImage: (id) => {
    recordHistory();
    set((s) => ({
      images: s.images.filter((img) => img.id !== id),
      orderedIds: s.orderedIds.filter((i) => i !== id),
      selectedId: s.selectedId === id ? null : s.selectedId,
    }));
  },

  toggleInclude: (id) => {
    recordHistory();
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, included: !img.included } : img
      ),
    }));
  },

  setMetadata: (id, metadata) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, metadata, analyzing: false } : img
      ),
    })),

  setAnalyzing: (id, val) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id ? { ...img, analyzing: val } : img
      ),
    })),

  setCropOverride: (id, override) =>
    set((s) => ({
      images: s.images.map((img) =>
        img.id === id
          ? { ...img, cropOverride: { ...img.cropOverride, ...override } }
          : img
      ),
    })),

  setOrderedIds: (ids) => {
    recordHistory();
    set({ orderedIds: ids });
  },

  setSelectedId: (id) => set({ selectedId: id }),

  openCropModal: (id) => set({ cropModalId: id, selectedId: id }),

  closeCropModal: () => set({ cropModalId: null }),

  reorderManual: (fromIndex, toIndex) => {
    recordHistory();
    set((s) => {
      const ids = [...s.orderedIds];
      const [moved] = ids.splice(fromIndex, 1);
      ids.splice(toIndex, 0, moved);
      return { orderedIds: ids };
    });
  },

  clear: () => {
    get().images.forEach((img) => URL.revokeObjectURL(img.url));
    useHistoryStore.getState().clear();
    set({ images: [], orderedIds: [], selectedId: null, cropModalId: null });
  },
}));

export const getImageById = (images: ImageEntry[], id: string) =>
  images.find((img) => img.id === id);

export const includedImages = (images: ImageEntry[], orderedIds: string[]) =>
  orderedIds
    .map((id) => images.find((img) => img.id === id))
    .filter((img): img is ImageEntry => !!img && img.included);
