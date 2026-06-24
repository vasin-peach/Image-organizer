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
import type { ImageEntry } from '../types';
import type { CellRect } from '../lib/layout/layouts';
import CropOverlayModal from './CropOverlayModal';

const DOUBLE_CLICK_MS = 300;
const DRAG_THRESHOLD = 5;
const MIN_CANVAS = 100;

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
};

type CellResizeDrag = {
  kind: 'col' | 'row';
  rowIndex: number;
  colIndex: number;
  cellCountInRow: number;
  pointerId: number;
  startClient: number;
  startWeight: number;
  availPx: number;
  totalWeight: number;
};

type CanvasResizeDrag = {
  edge: 'right' | 'bottom' | 'corner';
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCanvasW: number;
  startCanvasH: number;
};

// ─── Single sortable cell overlay ─────────────────────────────────────────────
function SortableCell({
  cell,
  img,
  isDragging,
  zoom,
  reorderArmedId,
  onCellPointerDown,
  onColResizeStart,
  onRowResizeStart,
  registerReorderListener,
}: {
  cell: CellRect;
  img: ImageEntry;
  isDragging: boolean;
  zoom: number;
  reorderArmedId: string | null;
  onCellPointerDown: (e: React.PointerEvent, img: ImageEntry, cell: CellRect) => boolean;
  onColResizeStart: (e: React.PointerEvent, cell: CellRect) => void;
  onRowResizeStart: (e: React.PointerEvent, cell: CellRect) => void;
  registerReorderListener: (id: string, handler: ((e: React.PointerEvent) => void) | null) => void;
}) {
  const isReorderArmed = reorderArmedId === img.id;
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
        className={`absolute inset-0 ${isReorderArmed ? 'cursor-grab active:cursor-grabbing' : 'cursor-move'}`}
        onPointerDown={(e) => {
          if (isReorderArmed && listeners?.onPointerDown) {
            listeners.onPointerDown(e);
            return;
          }
          if (onCellPointerDown(e, img, cell)) return;
        }}
      />

      <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/20 transition-colors rounded-sm pointer-events-none" />

      {/* Column resize — right edge */}
      <div
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize z-20 opacity-0 group-hover:opacity-100"
        style={{ transform: `scaleX(${1 / zoom})`, transformOrigin: 'right center' }}
        onPointerDown={(e) => onColResizeStart(e, cell)}
      />

      {/* Row resize — bottom edge */}
      <div
        className="absolute bottom-0 left-0 w-full h-2 cursor-row-resize z-20 opacity-0 group-hover:opacity-100"
        style={{ transform: `scaleY(${1 / zoom})`, transformOrigin: 'center bottom' }}
        onPointerDown={(e) => onRowResizeStart(e, cell)}
      />

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
  } = useImagesStore();
  const { layout, sort, style, exportCfg, setSort, setLayout, cellAdjust, setCellAdjust } =
    useConfigStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [reorderArmedId, setReorderArmedId] = useState<string | null>(null);
  const [switchedToManual, setSwitchedToManual] = useState(false);
  const lastClickRef = useRef<{ id: string; time: number } | null>(null);
  const repositionDragRef = useRef<RepositionDrag | null>(null);
  const cellResizeRef = useRef<CellResizeDrag | null>(null);
  const canvasResizeRef = useRef<CanvasResizeDrag | null>(null);
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
      setCellAdjust(normalized);
    }
  }, [cellAdjust, solvedLayout.rows, solvedLayout.cols, setCellAdjust]);

  const effectiveCellAdjust = useMemo(
    () =>
      normalizeCellAdjust(cellAdjust, solvedLayout.rows, solvedLayout.cols),
    [cellAdjust, solvedLayout.rows, solvedLayout.cols]
  );

  const layoutResult = useMemo(
    () => computeLayout(sorted, solvedLayout, effectiveCellAdjust),
    [sorted, solvedLayout, effectiveCellAdjust]
  );

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

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.05, Math.min(4, z * (e.deltaY > 0 ? 0.9 : 1.1))));
  }, []);

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
        flushSync(() => setReorderArmedId(img.id));
        const listener = reorderListenersRef.current.get(img.id);
        listener?.(e);
        return true;
      }
      lastClickRef.current = { id: img.id, time: now };

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
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return false;
    },
    []
  );

  const handleColResizeStart = useCallback(
    (e: React.PointerEvent, cell: CellRect) => {
      if (e.button !== 0 || solvedLayout.mode !== 'grid-uniform') return;
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
        kind: 'col',
        rowIndex: row,
        colIndex: cell.colIndex,
        cellCountInRow: cellsInRow,
        pointerId: e.pointerId,
        startClient: e.clientX,
        startWeight: weights[cell.colIndex],
        availPx: availW,
        totalWeight,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [solvedLayout, layoutResult.cells, effectiveCellAdjust]
  );

  const handleRowResizeStart = useCallback(
    (e: React.PointerEvent, cell: CellRect) => {
      if (e.button !== 0 || solvedLayout.mode !== 'grid-uniform') return;
      e.stopPropagation();
      e.preventDefault();

      const rows = solvedLayout.rows;
      const totalWeight = effectiveCellAdjust.rowWeights.reduce((s, w) => s + w, 0);
      const availH =
        solvedLayout.canvasH - 2 * solvedLayout.outerPad - (rows + 1) * solvedLayout.gap;

      cellResizeRef.current = {
        kind: 'row',
        rowIndex: cell.rowIndex,
        colIndex: cell.colIndex,
        cellCountInRow: 0,
        pointerId: e.pointerId,
        startClient: e.clientY,
        startWeight: effectiveCellAdjust.rowWeights[cell.rowIndex],
        availPx: availH,
        totalWeight,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [solvedLayout, effectiveCellAdjust]
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
        const deltaClient =
          cellResize.kind === 'col' ? e.clientX - cellResize.startClient : e.clientY - cellResize.startClient;
        const deltaPx = deltaClient / zoom;
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
        } else {
          setCellAdjust(
            adjustRowWeight(effectiveCellAdjust, cellResize.rowIndex, deltaWeight)
          );
        }
        cellResize.startClient = cellResize.kind === 'col' ? e.clientX : e.clientY;
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
    [zoom, setCropOverride, effectiveCellAdjust, setCellAdjust, applyCanvasSize]
  );

  const onContainerPointerUp = useCallback((e: React.PointerEvent) => {
    if (repositionDragRef.current?.pointerId === e.pointerId) {
      repositionDragRef.current = null;
    }
    if (cellResizeRef.current?.pointerId === e.pointerId) {
      cellResizeRef.current = null;
    }
    if (canvasResizeRef.current?.pointerId === e.pointerId) {
      canvasResizeRef.current = null;
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
                    onCellPointerDown={handleCellPointerDown}
                    onColResizeStart={handleColResizeStart}
                    onRowResizeStart={handleRowResizeStart}
                    registerReorderListener={registerReorderListener}
                  />
                );
              })}
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
          <div className="text-white/25">ลาก = ปรับ crop · ดับเบิลคลิก = สลับลำดับ</div>
        </div>
      )}

      {cropModalId && !activeDragId && (
        <CropOverlayModal imageId={cropModalId} onClose={closeCropModal} />
      )}
    </div>
  );
});

export default PreviewCanvas;
