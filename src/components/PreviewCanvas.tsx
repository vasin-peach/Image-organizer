import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useImagesStore, includedImages } from '../store/images';
import { useConfigStore } from '../store/config';
import { computeLayout } from '../lib/layout/layouts';
import { sortImages } from '../lib/sort/sorters';
import { renderToCanvas, exportImage } from '../lib/render/renderer';
import { solveLayout } from '../lib/constraints/coherentSize';
import {
  adjustColWeight,
  adjustRowWeight,
  normalizeCellAdjust,
} from '../lib/layout/cellAdjust';
import {
  adjustMosaicColWeight,
  adjustMosaicHeightScale,
  normalizeMosaicAdjust,
} from '../lib/layout/mosaicAdjust';
import { applyEdgeSnap, type SnapGuide } from '../lib/layout/snapGuides';
import type { ImageEntry } from '../types';
import type { CellRect } from '../lib/layout/layouts';
import CropOverlayModal from './CropOverlayModal';
import { beginHistoryGesture, endHistoryGesture } from '../store/history';

const DOUBLE_CLICK_MS = 300;
const DRAG_THRESHOLD = 5;
const MIN_CANVAS = 100;
const MIN_CROP_ZOOM = 1;
const MAX_CROP_ZOOM = 2;
const CROP_ZOOM_WHEEL_SENSITIVITY = 0.002;
const CROP_ZOOM_GESTURE_MS = 400;

// ─── Image cache ──────────────────────────────────────────────────────────────
const imageCache = new Map<string, HTMLImageElement>();
function loadImage(img: ImageEntry): Promise<HTMLImageElement> {
  if (imageCache.has(img.id)) return Promise.resolve(imageCache.get(img.id)!);
  return new Promise((resolve) => {
    const el = new Image();
    el.onload = () => { imageCache.set(img.id, el); resolve(el); };
    el.onerror = () => resolve(el);
    el.src = img.url;
  });
}

function coverExcess(cellW: number, cellH: number, imgW: number, imgH: number, zoom: number) {
  const coverScale = Math.max(cellW / imgW, cellH / imgH) * zoom;
  const coverW = imgW * coverScale;
  const coverH = imgH * coverScale;
  return { excessX: coverW - cellW, excessY: coverH - cellH };
}

type RepositionDrag = {
  imageId: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startOffsetX: number;
  startOffsetY: number;
  cellW: number;
  cellH: number;
  imgW: number;
  imgH: number;
  zoom: number;
  gestureStarted: boolean;
};

type CellResizeDrag =
  | {
      layout: 'grid';
      kind: 'col' | 'row';
      rowIndex: number;
      colIndex: number;
      cellCountInRow: number;
      pointerId: number;
      startClient: number;
      availPx: number;
      totalWeight: number;
    }
  | {
      layout: 'mosaic';
      kind: 'col';
      colIndex: number;
      pointerId: number;
      startClient: number;
      availPx: number;
      totalWeight: number;
    }
  | {
      layout: 'mosaic';
      kind: 'height';
      imageId: string;
      pointerId: number;
      startClient: number;
      baseHeight: number;
    };

type CanvasResizeDrag = {
  edge: 'right' | 'bottom' | 'corner';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCanvasW: number;
  startCanvasH: number;
};

function getDraggedCellEdge(
  cellResize: CellResizeDrag,
  cells: CellRect[]
): { edge: number; axis: 'x' | 'y' } | null {
  if (cellResize.layout === 'grid') {
    if (cellResize.kind === 'col') {
      const cell = cells.find(
        (c) => c.rowIndex === cellResize.rowIndex && c.colIndex === cellResize.colIndex
      );
      return cell ? { edge: cell.x + cell.w, axis: 'x' } : null;
    }
    const cell = cells.find((c) => c.rowIndex === cellResize.rowIndex);
    return cell ? { edge: cell.y + cell.h, axis: 'y' } : null;
  }
  if (cellResize.kind === 'col') {
    const cell = cells.find((c) => c.colIndex === cellResize.colIndex);
    return cell ? { edge: cell.x + cell.w, axis: 'x' } : null;
  }
  const cell = cells.find((c) => c.imageId === cellResize.imageId);
  return cell ? { edge: cell.y + cell.h, axis: 'y' } : null;
}

// ─── Single sortable cell overlay ─────────────────────────────────────────────
function SortableCell({
  cell,
  img,
  isDragging,
  zoom,
  reorderArmedId,
  cropZoomTargetId,
  onCellPointerDown,
  onCellWheel,
  onColResizeStart,
  onRowResizeStart,
  registerReorderListener,
  showResizeHandles,
}: {
  cell: CellRect;
  img: ImageEntry;
  isDragging: boolean;
  zoom: number;
  reorderArmedId: string | null;
  cropZoomTargetId: string | null;
  onCellPointerDown: (e: React.PointerEvent, img: ImageEntry, cell: CellRect) => boolean;
  onCellWheel: (e: React.WheelEvent, img: ImageEntry) => void;
  onColResizeStart: (e: React.PointerEvent, cell: CellRect) => void;
  onRowResizeStart: (e: React.PointerEvent, cell: CellRect, img: ImageEntry) => void;
  registerReorderListener: (id: string, handler: ((e: React.PointerEvent) => void) | null) => void;
  showResizeHandles: boolean;
}) {
  const isReorderArmed = reorderArmedId === img.id;
  const isZoomTarget = cropZoomTargetId === img.id;
  const canCropZoom = img.cropOverride.mode !== 'fit';
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: img.id,
    disabled: !isReorderArmed,
  });

  useLayoutEffect(() => {
    registerReorderListener(
      img.id,
      isReorderArmed && listeners?.onPointerDown
        ? (listeners.onPointerDown as (e: React.PointerEvent) => void)
        : null
    );
    return () => registerReorderListener(img.id, null);
  }, [img.id, isReorderArmed, listeners, registerReorderListener]);

  const cellStyle: React.CSSProperties = {
    position: 'absolute',
    left: cell.x,
    top: cell.y,
    width: cell.w,
    height: cell.h,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 0 : 2,
  };

  return (
    <div ref={setNodeRef} style={cellStyle} {...attributes} className="group">
      <div
        className={`absolute inset-0 ${isReorderArmed ? 'cursor-grab active:cursor-grabbing' : isZoomTarget && canCropZoom ? 'cursor-zoom-in' : 'cursor-move'}`}
        onPointerDown={(e) => {
          if (isReorderArmed && listeners?.onPointerDown) {
            listeners.onPointerDown(e);
            return;
          }
          if (onCellPointerDown(e, img, cell)) return;
        }}
        onWheel={(e) => onCellWheel(e, img)}
      />

      <div
        className={`absolute inset-0 border-2 rounded-sm pointer-events-none transition-colors ${
          isZoomTarget && canCropZoom
            ? 'border-indigo-400/70'
            : 'border-transparent group-hover:border-white/20'
        }`}
      />

      {isZoomTarget && canCropZoom && (
        <div className="absolute top-1 right-1 z-10 pointer-events-none bg-black/70 border border-indigo-400/40 rounded px-1.5 py-0.5 text-[9px] text-indigo-200 font-mono shadow-lg">
          {img.cropOverride.zoom.toFixed(2)}×
        </div>
      )}

      {/* Column resize — right edge */}
      {showResizeHandles && (
        <div
          className="absolute top-0 right-0 w-2 h-full cursor-col-resize z-20 opacity-0 group-hover:opacity-100"
          style={{ transform: `scaleX(${1 / zoom})`, transformOrigin: 'right center' }}
          onPointerDown={(e) => onColResizeStart(e, cell)}
        />
      )}

      {/* Row / height resize — bottom edge */}
      {showResizeHandles && (
        <div
          className="absolute bottom-0 left-0 w-full h-2 cursor-row-resize z-20 opacity-0 group-hover:opacity-100"
          style={{ transform: `scaleY(${1 / zoom})`, transformOrigin: 'center bottom' }}
          onPointerDown={(e) => onRowResizeStart(e, cell, img)}
        />
      )}

      {isReorderArmed && (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="bg-indigo-600/80 border border-indigo-400/50 rounded px-2 py-0.5 text-[9px] text-white/90 select-none shadow-lg">
            drag to reorder
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Snap guide lines during cell resize ──────────────────────────────────────
function SnapGuideLines({
  guides,
  totalW,
  totalH,
}: {
  guides: SnapGuide[];
  totalW: number;
  totalH: number;
}) {
  if (guides.length === 0) return null;

  return (
    <>
      {guides.map((guide, i) =>
        guide.axis === 'x' ? (
          <div
            key={`snap-v-${i}`}
            className="absolute pointer-events-none z-40"
            style={{
              left: guide.position,
              top: 0,
              width: 1,
              height: totalH,
              background: 'rgba(129, 140, 248, 0.95)',
              boxShadow: '0 0 6px rgba(99, 102, 241, 0.9)',
            }}
          />
        ) : (
          <div
            key={`snap-h-${i}`}
            className="absolute pointer-events-none z-40"
            style={{
              left: 0,
              top: guide.position,
              width: totalW,
              height: 1,
              background: 'rgba(129, 140, 248, 0.95)',
              boxShadow: '0 0 6px rgba(99, 102, 241, 0.9)',
            }}
          />
        )
      )}
    </>
  );
}

// ─── Canvas frame resize handles ──────────────────────────────────────────────
function CanvasResizeHandles({
  zoom,
  onResizeStart,
}: {
  zoom: number;
  onResizeStart: (e: React.PointerEvent, edge: CanvasResizeDrag['edge']) => void;
}) {
  const handleStyle = (cursor: string): React.CSSProperties => ({
    position: 'absolute',
    zIndex: 30,
    background: 'rgba(99,102,241,0.35)',
    border: '1px solid rgba(129,140,248,0.6)',
    opacity: 0.7,
    cursor,
  });

  return (
    <>
      <div
        style={{
          ...handleStyle('ew-resize'),
          right: 0,
          top: '10%',
          width: Math.max(6, 8 / zoom),
          height: '80%',
        }}
        onPointerDown={(e) => onResizeStart(e, 'right')}
      />
      <div
        style={{
          ...handleStyle('ns-resize'),
          bottom: 0,
          left: '10%',
          height: Math.max(6, 8 / zoom),
          width: '80%',
        }}
        onPointerDown={(e) => onResizeStart(e, 'bottom')}
      />
      <div
        style={{
          ...handleStyle('nwse-resize'),
          right: 0,
          bottom: 0,
          width: Math.max(12, 14 / zoom),
          height: Math.max(12, 14 / zoom),
          borderRadius: 2,
        }}
        onPointerDown={(e) => onResizeStart(e, 'corner')}
      />
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const PreviewCanvas = forwardRef<{ triggerExport: () => void }>(function PreviewCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    images,
    orderedIds,
    setOrderedIds,
    setCropOverride,
    cropModalId,
    closeCropModal,
    setSelectedId,
  } = useImagesStore();
  const { layout, sort, style, exportCfg, setSort, setLayout, cellAdjust, setCellAdjust, mosaicAdjust, setMosaicAdjust } =
    useConfigStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reorderArmedId, setReorderArmedId] = useState<string | null>(null);
  const [cropZoomTargetId, setCropZoomTargetId] = useState<string | null>(null);
  const [switchedToManual, setSwitchedToManual] = useState(false);
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([]);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const repositionDragRef = useRef<RepositionDrag | null>(null);
  const cellResizeRef = useRef<CellResizeDrag | null>(null);
  const canvasResizeRef = useRef<CanvasResizeDrag | null>(null);
  const cropZoomGestureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reorderListenersRef = useRef<Map<string, (e: React.PointerEvent) => void>>(new Map());

  const registerReorderListener = useCallback(
    (id: string, handler: ((e: React.PointerEvent) => void) | null) => {
      if (handler) reorderListenersRef.current.set(id, handler);
      else reorderListenersRef.current.delete(id);
    },
    []
  );

  const sorted = useMemo(
    () => sortImages(includedImages(images, orderedIds), sort),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images, orderedIds, sort.mode, sort.reversed, sort.seed]
  );

  const solvedLayout = useMemo(
    () => solveLayout(layout, Math.max(1, sorted.length), layout.lockMode).layout,
    [layout, sorted.length]
  );

  useEffect(() => {
    const normalized = normalizeCellAdjust(
      cellAdjust,
      solvedLayout.rows,
      solvedLayout.cols
    );
    if (
      !cellAdjust ||
      cellAdjust.rows !== normalized.rows ||
      cellAdjust.cols !== normalized.cols
    ) {
      setCellAdjust(normalized, { skipHistory: true });
    }
  }, [cellAdjust, solvedLayout.rows, solvedLayout.cols, setCellAdjust]);

  useEffect(() => {
    if (solvedLayout.mode !== 'mosaic') return;
    const normalized = normalizeMosaicAdjust(mosaicAdjust, solvedLayout.cols);
    if (!mosaicAdjust || mosaicAdjust.cols !== normalized.cols) {
      setMosaicAdjust(normalized, { skipHistory: true });
    }
  }, [mosaicAdjust, solvedLayout.mode, solvedLayout.cols, setMosaicAdjust]);

  const effectiveCellAdjust = useMemo(
    () =>
      normalizeCellAdjust(cellAdjust, solvedLayout.rows, solvedLayout.cols),
    [cellAdjust, solvedLayout.rows, solvedLayout.cols]
  );

  const effectiveMosaicAdjust = useMemo(
    () => normalizeMosaicAdjust(mosaicAdjust, solvedLayout.cols),
    [mosaicAdjust, solvedLayout.cols]
  );

  const layoutResult = useMemo(
    () =>
      computeLayout(
        sorted,
        solvedLayout,
        effectiveCellAdjust,
        solvedLayout.mode === 'mosaic' ? effectiveMosaicAdjust : null
      ),
    [sorted, solvedLayout, effectiveCellAdjust, effectiveMosaicAdjust]
  );

  const showCellResizeHandles =
    solvedLayout.mode === 'grid-uniform' || solvedLayout.mode === 'mosaic';

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_THRESHOLD } })
  );

  const renderArgsRef = useRef({ sorted, layoutResult, style, layout: solvedLayout });

  useEffect(() => {
    renderArgsRef.current = { sorted, layoutResult, style, layout: solvedLayout };
  }, [sorted, layoutResult, style, solvedLayout]);

  useEffect(() => {
    let cancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;

    (async () => {
      const { sorted: s, layoutResult: lr, style: st, layout: l } = renderArgsRef.current;
      await Promise.all(s.map(loadImage));
      if (cancelled) return;
      const elMap = new Map<string, HTMLImageElement>();
      s.forEach((img) => { const el = imageCache.get(img.id); if (el) elMap.set(img.id, el); });
      if (cancelled) return;
      await renderToCanvas(canvas, elMap, { layout: lr, images: s, style: st, layoutCfg: l, scale: 1 });
    })();

    return () => { cancelled = true; };
  }, [sorted, layoutResult, style, solvedLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { clientWidth, clientHeight } = container;
    const fitZoom = Math.min(
      (clientWidth - 32) / layoutResult.totalW,
      (clientHeight - 32) / layoutResult.totalH,
      1
    );
    setZoom(fitZoom);
    setPan({ x: 0, y: 0 });
  }, [layoutResult.totalW, layoutResult.totalH]);

  const applyCanvasSize = useCallback(
    (canvasW: number, canvasH: number) => {
      const { layout: next } = solveLayout(
        { ...layout, canvasW, canvasH, lockMode: 'canvas' },
        Math.max(1, sorted.length),
        'canvas'
      );
      setLayout(next);
    },
    [layout, sorted.length, setLayout]
  );

  const adjustCropZoom = useCallback(
    (imageId: string, deltaY: number) => {
      const img = useImagesStore.getState().images.find((i) => i.id === imageId);
      if (!img || img.cropOverride.mode === 'fit') return;

      if (cropZoomGestureTimer.current === null) {
        beginHistoryGesture();
      }

      const delta = -deltaY * CROP_ZOOM_WHEEL_SENSITIVITY;
      const next = Math.max(
        MIN_CROP_ZOOM,
        Math.min(MAX_CROP_ZOOM, img.cropOverride.zoom + delta)
      );
      setCropOverride(imageId, { zoom: next });

      if (cropZoomGestureTimer.current) clearTimeout(cropZoomGestureTimer.current);
      cropZoomGestureTimer.current = setTimeout(() => {
        endHistoryGesture();
        cropZoomGestureTimer.current = null;
      }, CROP_ZOOM_GESTURE_MS);
    },
    [setCropOverride]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (cropZoomTargetId && !e.altKey) {
        adjustCropZoom(cropZoomTargetId, e.deltaY);
        return;
      }
      setZoom((z) => Math.max(0.05, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
    },
    [cropZoomTargetId, adjustCropZoom]
  );

  const handleCellWheel = useCallback(
    (e: React.WheelEvent, img: ImageEntry) => {
      e.stopPropagation();
      e.preventDefault();
      setCropZoomTargetId(img.id);
      setSelectedId(img.id);
      adjustCropZoom(img.id, e.deltaY);
    },
    [adjustCropZoom, setSelectedId]
  );

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 1 && !e.altKey) return;
    setIsPanning(true);
    panStart.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
  }, [pan]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({
      x: panStart.current.px + (e.clientX - panStart.current.mx),
      y: panStart.current.py + (e.clientY - panStart.current.my),
    });
  }, [isPanning]);

  const onMouseUp = useCallback(() => setIsPanning(false), []);

  const handleCellPointerDown = useCallback(
    (e: React.PointerEvent, img: ImageEntry, cell: CellRect): boolean => {
      if (e.button !== 0) return false;
      e.stopPropagation();

      const now = Date.now();
      const last = lastClickRef.current;
      if (last && last.id === img.id && now - last.time < DOUBLE_CLICK_MS) {
        lastClickRef.current = null;
        repositionDragRef.current = null;
        setCropZoomTargetId(null);
        flushSync(() => setReorderArmedId(img.id));
        const listener = reorderListenersRef.current.get(img.id);
        listener?.(e);
        return true;
      }
      lastClickRef.current = { id: img.id, time: now };
      setCropZoomTargetId(img.id);
      setSelectedId(img.id);

      const { offsetX, offsetY, zoom: cropZoom } = img.cropOverride;
      repositionDragRef.current = {
        imageId: img.id,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startOffsetX: offsetX,
        startOffsetY: offsetY,
        cellW: cell.w,
        cellH: cell.h,
        imgW: img.width,
        imgH: img.height,
        zoom: cropZoom,
        gestureStarted: false,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return false;
    },
    [setSelectedId]
  );

  useEffect(
    () => () => {
      if (cropZoomGestureTimer.current) {
        clearTimeout(cropZoomGestureTimer.current);
        endHistoryGesture();
      }
    },
    []
  );

  const handleColResizeStart = useCallback(
    (e: React.PointerEvent, cell: CellRect) => {
      if (e.button !== 0) return;
      if (solvedLayout.mode === 'grid-uniform') {
        e.stopPropagation();
        e.preventDefault();

        const row = cell.rowIndex;
        const cellsInRow = layoutResult.cells.filter((c) => c.rowIndex === row).length;
        const weights = effectiveCellAdjust.colWeights[row].slice(0, cellsInRow);
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        const availW =
          solvedLayout.canvasW -
          2 * solvedLayout.outerPad -
          (cellsInRow + 1) * solvedLayout.gap;

        cellResizeRef.current = {
          layout: 'grid',
          kind: 'col',
          rowIndex: row,
          colIndex: cell.colIndex,
          cellCountInRow: cellsInRow,
          pointerId: e.pointerId,
          startClient: e.clientX,
          availPx: availW,
          totalWeight,
        };
        beginHistoryGesture();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (solvedLayout.mode === 'mosaic') {
        e.stopPropagation();
        e.preventDefault();

        const cols = solvedLayout.cols;
        const totalWeight = effectiveMosaicAdjust.colWeights.reduce((s, w) => s + w, 0);
        const availW =
          solvedLayout.canvasW - 2 * solvedLayout.outerPad - (cols + 1) * solvedLayout.gap;

        cellResizeRef.current = {
          layout: 'mosaic',
          kind: 'col',
          colIndex: cell.colIndex,
          pointerId: e.pointerId,
          startClient: e.clientX,
          availPx: availW,
          totalWeight,
        };
        beginHistoryGesture();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [solvedLayout, layoutResult.cells, effectiveCellAdjust, effectiveMosaicAdjust]
  );

  const handleRowResizeStart = useCallback(
    (e: React.PointerEvent, cell: CellRect, img: ImageEntry) => {
      if (e.button !== 0) return;
      if (solvedLayout.mode === 'grid-uniform') {
        e.stopPropagation();
        e.preventDefault();

        const rows = solvedLayout.rows;
        const totalWeight = effectiveCellAdjust.rowWeights.reduce((s, w) => s + w, 0);
        const availH =
          solvedLayout.canvasH - 2 * solvedLayout.outerPad - (rows + 1) * solvedLayout.gap;

        cellResizeRef.current = {
          layout: 'grid',
          kind: 'row',
          rowIndex: cell.rowIndex,
          colIndex: cell.colIndex,
          cellCountInRow: 0,
          pointerId: e.pointerId,
          startClient: e.clientY,
          availPx: availH,
          totalWeight,
        };
        beginHistoryGesture();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (solvedLayout.mode === 'mosaic') {
        e.stopPropagation();
        e.preventDefault();

        const heightScale = effectiveMosaicAdjust.heightScales[img.id] ?? 1;
        const baseHeight = cell.h / heightScale;

        cellResizeRef.current = {
          layout: 'mosaic',
          kind: 'height',
          imageId: img.id,
          pointerId: e.pointerId,
          startClient: e.clientY,
          baseHeight: Math.max(1, baseHeight),
        };
        beginHistoryGesture();
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      }
    },
    [solvedLayout, effectiveCellAdjust, effectiveMosaicAdjust]
  );

  const handleCanvasResizeStart = useCallback(
    (e: React.PointerEvent, edge: CanvasResizeDrag['edge']) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();

      canvasResizeRef.current = {
        edge,
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startCanvasW: solvedLayout.canvasW,
        startCanvasH: solvedLayout.canvasH,
      };
      beginHistoryGesture();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [solvedLayout.canvasW, solvedLayout.canvasH]
  );

  const onContainerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const repos = repositionDragRef.current;
      if (repos && e.pointerId === repos.pointerId) {
        const dx = (e.clientX - repos.startClientX) / zoom;
        const dy = (e.clientY - repos.startClientY) / zoom;
        if (Math.hypot(e.clientX - repos.startClientX, e.clientY - repos.startClientY) < DRAG_THRESHOLD) {
          return;
        }
        if (!repos.gestureStarted) {
          beginHistoryGesture();
          repos.gestureStarted = true;
        }
        const { excessX, excessY } = coverExcess(
          repos.cellW,
          repos.cellH,
          repos.imgW,
          repos.imgH,
          repos.zoom
        );
        const nextOffsetX =
          excessX > 0
            ? Math.max(-0.5, Math.min(0.5, repos.startOffsetX + dx / excessX))
            : repos.startOffsetX;
        const nextOffsetY =
          excessY > 0
            ? Math.max(-0.5, Math.min(0.5, repos.startOffsetY + dy / excessY))
            : repos.startOffsetY;
        setCropOverride(repos.imageId, { offsetX: nextOffsetX, offsetY: nextOffsetY });
        return;
      }

      const cellResize = cellResizeRef.current;
      if (cellResize && e.pointerId === cellResize.pointerId) {
        const rawDeltaPx =
          cellResize.kind === 'col'
            ? (e.clientX - cellResize.startClient) / zoom
            : (e.clientY - cellResize.startClient) / zoom;

        const edgeInfo = getDraggedCellEdge(cellResize, layoutResult.cells);
        const { deltaPx, guide } = edgeInfo
          ? applyEdgeSnap(
              rawDeltaPx,
              edgeInfo.edge,
              edgeInfo.axis,
              layoutResult.cells,
              solvedLayout.canvasW,
              solvedLayout.canvasH,
              solvedLayout.outerPad,
              zoom
            )
          : { deltaPx: rawDeltaPx, guide: null };

        setSnapGuides(guide ? [guide] : []);

        if (cellResize.layout === 'grid') {
          const deltaWeight = (deltaPx / cellResize.availPx) * cellResize.totalWeight;

          if (cellResize.kind === 'col') {
            setCellAdjust(
              adjustColWeight(
                effectiveCellAdjust,
                cellResize.rowIndex,
                cellResize.colIndex,
                deltaWeight,
                cellResize.cellCountInRow
              )
            );
            cellResize.startClient = e.clientX;
          } else {
            setCellAdjust(
              adjustRowWeight(effectiveCellAdjust, cellResize.rowIndex, deltaWeight)
            );
            cellResize.startClient = e.clientY;
          }
        } else if (cellResize.kind === 'col') {
          const deltaWeight = (deltaPx / cellResize.availPx) * cellResize.totalWeight;
          setMosaicAdjust(
            adjustMosaicColWeight(effectiveMosaicAdjust, cellResize.colIndex, deltaWeight)
          );
          cellResize.startClient = e.clientX;
        } else {
          const deltaScale = deltaPx / cellResize.baseHeight;
          setMosaicAdjust(
            adjustMosaicHeightScale(
              effectiveMosaicAdjust,
              cellResize.imageId,
              deltaScale
            )
          );
          cellResize.startClient = e.clientY;
        }
        return;
      }

      const canvasResize = canvasResizeRef.current;
      if (canvasResize && e.pointerId === canvasResize.pointerId) {
        const dx = (e.clientX - canvasResize.startClientX) / zoom;
        const dy = (e.clientY - canvasResize.startClientY) / zoom;
        let nextW = canvasResize.startCanvasW;
        let nextH = canvasResize.startCanvasH;
        if (canvasResize.edge === 'right' || canvasResize.edge === 'corner') {
          nextW = Math.max(MIN_CANVAS, canvasResize.startCanvasW + dx);
        }
        if (canvasResize.edge === 'bottom' || canvasResize.edge === 'corner') {
          nextH = Math.max(MIN_CANVAS, canvasResize.startCanvasH + dy);
        }
        applyCanvasSize(Math.round(nextW), Math.round(nextH));
      }
    },
    [
      zoom,
      setCropOverride,
      effectiveCellAdjust,
      effectiveMosaicAdjust,
      setCellAdjust,
      setMosaicAdjust,
      applyCanvasSize,
      layoutResult.cells,
      solvedLayout.canvasW,
      solvedLayout.canvasH,
      solvedLayout.outerPad,
    ]
  );

  const onContainerPointerUp = useCallback((e: React.PointerEvent) => {
    if (repositionDragRef.current?.pointerId === e.pointerId) {
      if (repositionDragRef.current.gestureStarted) {
        endHistoryGesture();
      }
      repositionDragRef.current = null;
    }
    if (cellResizeRef.current?.pointerId === e.pointerId) {
      cellResizeRef.current = null;
      setSnapGuides([]);
      endHistoryGesture();
    }
    if (canvasResizeRef.current?.pointerId === e.pointerId) {
      canvasResizeRef.current = null;
      endHistoryGesture();
    }
  }, []);

  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    setReorderArmedId(null);
    if (sort.mode !== 'none') {
      const sortedIds = sorted.map((i) => i.id);
      const excludedIds = images.filter((i) => !i.included).map((i) => i.id);
      setOrderedIds([...sortedIds, ...excludedIds]);
      setSort({ mode: 'none' });
      setSwitchedToManual(true);
      setTimeout(() => setSwitchedToManual(false), 2500);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    setReorderArmedId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const currentIds = useImagesStore.getState().orderedIds;
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...currentIds];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setOrderedIds(next);
  };

  const triggerExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { sorted: s, layoutResult: lr, layout: l, style: st } = renderArgsRef.current;
    await Promise.all(s.map(loadImage));
    const elMap = new Map<string, HTMLImageElement>();
    s.forEach((img) => { const el = imageCache.get(img.id); if (el) elMap.set(img.id, el); });
    await exportImage(canvas, elMap, s, lr, l, st, exportCfg);
  }, [exportCfg]);

  useImperativeHandle(ref, () => ({ triggerExport }));

  const activeImg = activeDragId ? sorted.find((i) => i.id === activeDragId) : null;

  const canvasContainerStyle: React.CSSProperties = {
    position: 'absolute',
    width: layoutResult.totalW,
    height: layoutResult.totalH,
    left: '50%',
    top: '50%',
    marginLeft: -(layoutResult.totalW / 2),
    marginTop: -(layoutResult.totalH / 2),
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: 'center center',
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative bg-[#0a0c10]"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseUp}
      onWheel={onWheel}
      onPointerMove={onContainerPointerMove}
      onPointerUp={onContainerPointerUp}
      onPointerCancel={onContainerPointerUp}
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-full text-white/20 text-sm">
          Add images in the Library panel to begin
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sorted.map((i) => i.id)} strategy={rectSortingStrategy}>
            <div style={canvasContainerStyle}>
              <canvas ref={canvasRef} className="block absolute inset-0" />
              {layoutResult.cells.map((cell) => {
                const img = sorted.find((i) => i.id === cell.imageId);
                if (!img) return null;
                return (
                  <SortableCell
                    key={img.id}
                    cell={cell}
                    img={img}
                    isDragging={activeDragId === img.id}
                    zoom={zoom}
                    reorderArmedId={reorderArmedId}
                    cropZoomTargetId={cropZoomTargetId}
                    onCellPointerDown={handleCellPointerDown}
                    onCellWheel={handleCellWheel}
                    onColResizeStart={handleColResizeStart}
                    onRowResizeStart={handleRowResizeStart}
                    registerReorderListener={registerReorderListener}
                    showResizeHandles={showCellResizeHandles}
                  />
                );
              })}
              <SnapGuideLines
                guides={snapGuides}
                totalW={layoutResult.totalW}
                totalH={layoutResult.totalH}
              />
              <CanvasResizeHandles zoom={zoom} onResizeStart={handleCanvasResizeStart} />
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeImg ? (
              <img
                src={activeImg.url}
                alt=""
                style={{
                  width: (layoutResult.cells.find((c) => c.imageId === activeImg.id)?.w ?? 100) * zoom,
                  height: (layoutResult.cells.find((c) => c.imageId === activeImg.id)?.h ?? 100) * zoom,
                  objectFit: 'cover',
                  opacity: 0.85,
                  borderRadius: 4,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
                  border: '2px solid rgba(99,102,241,0.7)',
                  pointerEvents: 'none',
                }}
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {switchedToManual && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 border border-white/10 text-white/70 text-[11px] px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-1.5 shadow-lg">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          ล็อกลำดับจาก sort · ลากเพื่อปรับเพิ่มเติม
        </div>
      )}

      <div className="absolute bottom-2 right-2 bg-black/60 text-white/60 text-xs px-2 py-1 rounded flex items-center gap-2">
        <span>{Math.round(zoom * 100)}%</span>
        <button className="hover:text-white transition-colors" onClick={() => setZoom(1)}>1:1</button>
        <button
          className="hover:text-white transition-colors"
          onClick={() => {
            if (!containerRef.current) return;
            const { clientWidth, clientHeight } = containerRef.current;
            setZoom(
              Math.min(
                (clientWidth - 32) / layoutResult.totalW,
                (clientHeight - 32) / layoutResult.totalH,
                1
              )
            );
            setPan({ x: 0, y: 0 });
          }}
        >
          Fit
        </button>
      </div>

      {sorted.length > 0 && (
        <div className="absolute top-2 left-2 bg-black/60 text-white/40 text-[10px] px-2 py-1 rounded space-y-0.5">
          <div>{sorted.length} images · {layoutResult.totalW}×{layoutResult.totalH}px</div>
          <div className="text-white/25">
            ลาก = ปรับ crop · คลิก + scroll = ซูม · ดับเบิลคลิก = สลับลำดับ
            {showCellResizeHandles ? ' · ลากขอบ = ปรับขนาดช่อง' : ''}
            {' · Alt+scroll = ซูม preview'}
          </div>
        </div>
      )}

      {cropModalId && !activeDragId && (
        <CropOverlayModal imageId={cropModalId} onClose={closeCropModal} />
      )}
    </div>
  );
});

export default PreviewCanvas;
