import { useCallback, useEffect, useRef, useState } from 'react';
import { useImagesStore } from '../store/images';
import { useConfigStore, MAX_RES_OPTIONS, type MaxResolution } from '../store/config';
import { resizeImageFile } from '../lib/resizeImage';
import CustomSelect from './CustomSelect';
import type { ImageEntry, ImageMetadata } from '../types';
import AnalyzerWorker from '../workers/imageAnalyzer.worker?worker';

// ─── Worker singleton ─────────────────────────────────────────────────────────
let workerInstance: Worker | null = null;
const pendingCallbacks = new Map<string, (meta: ImageMetadata) => void>();

function getWorker(): Worker {
  if (!workerInstance) {
    workerInstance = new AnalyzerWorker();
    workerInstance.onmessage = (e: MessageEvent<{ id: string; metadata?: ImageMetadata; error?: string }>) => {
      const { id, metadata } = e.data;
      const cb = pendingCallbacks.get(id);
      if (cb && metadata) { cb(metadata); pendingCallbacks.delete(id); }
    };
  }
  return workerInstance;
}

// ─── Entry factory ────────────────────────────────────────────────────────────
async function createEntry(file: File, maxSide: number): Promise<ImageEntry & { wasResized: boolean; originalSize: number }> {
  const originalSize = file.size;
  const { file: resizedFile, width, height, resized } = await resizeImageFile(file, maxSide);
  const url = URL.createObjectURL(resizedFile);
  return {
    id: crypto.randomUUID(), file: resizedFile, url, width, height,
    metadata: null, analyzing: false, included: true,
    cropOverride: { mode: 'smart', offsetX: 0, offsetY: 0, zoom: 1 },
    wasResized: resized, originalSize,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LibraryPanel() {
  const { images, orderedIds, addImages, removeImage, toggleInclude, setMetadata, setAnalyzing, openCropModal } =
    useImagesStore();
  const { maxResolution, setMaxResolution } = useConfigStore();

  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [resizeStats, setResizeStats] = useState<{ count: number; savedKB: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Analysis ──────────────────────────────────────────────────────────────
  const analyzeEntry = useCallback(
    async (entry: ImageEntry) => {
      setAnalyzing(entry.id, true);
      try {
        const bitmap = await createImageBitmap(entry.file);
        const worker = getWorker();
        pendingCallbacks.set(entry.id, (meta) => setMetadata(entry.id, meta));
        worker.postMessage({ id: entry.id, bitmap }, [bitmap]);
      } catch { setAnalyzing(entry.id, false); }
    },
    [setAnalyzing, setMetadata]
  );

  // ─── File handling ─────────────────────────────────────────────────────────
  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'));
      const entries = await Promise.all(imageFiles.map((f) => createEntry(f, maxResolution)));
      const resized = entries.filter((e) => e.wasResized);
      if (resized.length > 0) {
        const savedKB = Math.round(resized.reduce((s, e) => s + e.originalSize - e.file.size, 0) / 1024);
        setResizeStats({ count: resized.length, savedKB });
        setTimeout(() => setResizeStats(null), 4000);
      }
      addImages(entries);
      entries.forEach((e) => analyzeEntry(e));
    },
    [addImages, analyzeEntry, maxResolution]
  );

  const onFileDrop = useCallback(
    (e: React.DragEvent) => {
      // Only handle file drops, not dnd-kit drags
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      setIsDraggingFile(false);
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const onPaste = useCallback(
    (e: ClipboardEvent) => {
      const files: File[] = [];
      if (e.clipboardData) {
        for (const item of Array.from(e.clipboardData.items)) {
          if (item.type.startsWith('image/')) { const f = item.getAsFile(); if (f) files.push(f); }
        }
      }
      if (files.length) handleFiles(files);
    },
    [handleFiles]
  );

  useEffect(() => {
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [onPaste]);

  const orderedImages = orderedIds
    .map((id) => images.find((img) => img.id === id))
    .filter(Boolean) as ImageEntry[];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="p-3 border-b border-white/10 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white/80">
            Library
            <span className="ml-1.5 text-xs text-white/40">
              ({images.filter((i) => i.included).length}/{images.length})
            </span>
          </span>
          <div className="flex gap-1.5">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded"
            >
              + Add
            </button>
            {images.length > 0 && (
              <button
                onClick={() => useImagesStore.getState().clear()}
                className="text-xs bg-red-900/60 hover:bg-red-800 text-white px-2 py-1 rounded"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Resize setting */}
        <div className="flex items-center gap-1.5">
          <svg className="w-3 h-3 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
          <CustomSelect
            value={maxResolution}
            options={MAX_RES_OPTIONS}
            onChange={(v) => setMaxResolution(v as MaxResolution)}
            className="flex-1"
          />
        </div>


        {/* Resize feedback toast */}
        {resizeStats && (
          <div className="text-[10px] text-green-400/80 bg-green-900/20 rounded px-2 py-1">
            ✓ Resized {resizeStats.count} image{resizeStats.count > 1 ? 's' : ''} · saved ~{resizeStats.savedKB} KB
          </div>
        )}
      </div>

      {/* Drop zone / grid */}
      <div
        className={`flex-1 overflow-y-auto p-2 transition-colors ${
          isDraggingFile ? 'bg-indigo-900/30 ring-2 ring-inset ring-indigo-400' : ''
        }`}
        onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDraggingFile(true); } }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingFile(false); }}
        onDrop={onFileDrop}
      >
        {orderedImages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-white/30 text-sm text-center gap-2 p-4">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p>Drop images here<br />or click <strong>+ Add</strong><br />or paste from clipboard</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {orderedImages.map((img) => (
              <ThumbnailCard
                key={img.id}
                img={img}
                onToggle={() => toggleInclude(img.id)}
                onRemove={() => removeImage(img.id)}
                onCrop={() => openCropModal(img.id)}
              />
            ))}
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files && handleFiles(e.target.files)}
      />
    </div>
  );
}

// ─── Thumbnail card ───────────────────────────────────────────────────────────
function ThumbnailCard({
  img,
  onToggle,
  onRemove,
  onCrop,
}: {
  img: ImageEntry;
  onToggle: () => void;
  onRemove: () => void;
  onCrop: () => void;
}) {
  const dominantColor = img.metadata?.dominantColors[0]
    ? `rgb(${img.metadata.dominantColors[0].r},${img.metadata.dominantColors[0].g},${img.metadata.dominantColors[0].b})`
    : null;

  return (
    <div
      className={`relative group rounded overflow-hidden border-2 transition-all cursor-pointer ${
        img.included ? 'border-transparent' : 'border-white/10 opacity-50'
      }`}
      onClick={onToggle}
    >
      <img
        src={img.url}
        alt={img.file.name}
        className="w-full aspect-[4/3] object-cover pointer-events-none"
        loading="lazy"
        draggable={false}
      />

      {/* Dominant color bar */}
      {dominantColor && (
        <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: dominantColor }} />
      )}

      {/* Analyzing spinner */}
      {img.analyzing && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
        </div>
      )}

      {/* Excluded overlay */}
      {!img.included && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
          <span className="text-white/60 text-xs">excluded</span>
        </div>
      )}

      {/* Crop button */}
      {img.included && (
        <button
          onClick={(e) => { e.stopPropagation(); onCrop(); }}
          className="absolute bottom-1 right-1 bg-black/70 rounded px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-white/70 hover:text-indigo-300"
        >
          Crop
        </button>
      )}

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="absolute top-0.5 right-0.5 bg-black/70 rounded p-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-white/70 hover:text-red-400"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Brightness badge */}
      {img.metadata && (
        <div className="absolute top-0.5 left-0.5 bg-black/60 text-white/70 text-[9px] px-1 rounded">
          {Math.round(img.metadata.brightness * 100)}%
        </div>
      )}
    </div>
  );
}
