import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
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
import type { ImageEntry } from '../types';
import type { CellRect } from '../lib/layout/layouts';
import CropOverlayModal from './CropOverlayModal';

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

// ─── Single sortable cell overlay ─────────────────────────────────────────────
function SortableCell({
  cell,
  img,
  isDragging,
  onCropClick,
}: {
  cell: CellRect;
  img: ImageEntry;
  isDragging: boolean;
  onCropClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition } = useSortable({ id: img.id });

  const cellStyle: React.CSSProperties = {
    position: 'absolute',
    left: cell.x,
    top: cell.y,
    width: cell.w,
    height: cell.h,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0 : 1,
    zIndex: isDragging ? 0 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={cellStyle}
      {...attributes}
      className="group"
    >
      {/* Click to crop — whole cell except the drag handle */}
      <div
        className="absolute inset-0 cursor-crosshair"
        onClick={() => onCropClick(img.id)}
        title="Click to adjust crop"
      />

      {/* Hover border */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/20 transition-colors rounded-sm pointer-events-none" />

      {/* Drag handle — top-center, only this triggers drag */}
      <div
        ref={setActivatorNodeRef}
        {...listeners}
        className="absolute top-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        title="Drag to reorder"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-black/70 border border-white/10 rounded px-2 py-0.5 flex items-center gap-1 shadow-lg">
          <svg className="w-2.5 h-2.5 text-white/60" fill="currentColor" viewBox="0 0 20 20">
            <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm-6 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
          </svg>
          <span className="text-[9px] text-white/50 select-none">drag</span>
        </div>
      </div>

      {/* Crop hint — bottom-center */}
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <div className="bg-black/70 border border-white/10 rounded px-2 py-0.5 flex items-center gap-1 shadow-lg">
          <svg className="w-2.5 h-2.5 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a4 4 0 01-2.828 1.172H7v-2a4 4 0 011.172-2.828z" />
          </svg>
          <span className="text-[9px] text-white/50 select-none">crop</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const PreviewCanvas = forwardRef<{ triggerExport: () => void }>(function PreviewCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { images, orderedIds, setSelectedId, setOrderedIds } = useImagesStore();
  const { layout, sort, style, exportCfg, setSort } = useConfigStore();

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ mx: 0, my: 0, px: 0, py: 0 });
  const [cropImageId, setCropImageId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [switchedToManual, setSwitchedToManual] = useState(false);

  const ordered = includedImages(images, orderedIds);
  const sorted = sortImages(ordered, sort);
  const layoutResult = computeLayout(sorted, layout);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // ─── Render canvas ────────────────────────────────────────────────────────
  const renderFrame = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await Promise.all(sorted.map(loadImage));
    const elMap = new Map<string, HTMLImageElement>();
    sorted.forEach((img) => {
      const el = imageCache.get(img.id);
      if (el) elMap.set(img.id, el);
    });
    await renderToCanvas(canvas, elMap, {
      layout: layoutResult, images: sorted, style, layoutCfg: layout, scale: 1,
    });
  }, [sorted, layoutResult, style, layout]);

  useEffect(() => { renderFrame(); }, [renderFrame]);

  // Auto-fit
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

  // ─── Zoom / Pan ────────────────────────────────────────────────────────────
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

  // ─── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = (e: DragStartEvent) => {
    setActiveDragId(String(e.active.id));
    // If currently sorted by an algorithm, bake the order into orderedIds
    // and switch to 'none' so manual drag order is preserved
    if (sort.mode !== 'none') {
      const sortedIds = sorted.map(i => i.id);
      const excludedIds = images.filter(i => !i.included).map(i => i.id);
      setOrderedIds([...sortedIds, ...excludedIds]);
      setSort({ mode: 'none' });
      setSwitchedToManual(true);
      setTimeout(() => setSwitchedToManual(false), 2500);
    }
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    // Read fresh orderedIds from store — handleDragStart may have just updated them
    const currentIds = useImagesStore.getState().orderedIds;
    const oldIndex = currentIds.indexOf(String(active.id));
    const newIndex = currentIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...currentIds];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    setOrderedIds(next);
  };

  // ─── Export ────────────────────────────────────────────────────────────────
  const triggerExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    await Promise.all(sorted.map(loadImage));
    const elMap = new Map<string, HTMLImageElement>();
    sorted.forEach((img) => {
      const el = imageCache.get(img.id);
      if (el) elMap.set(img.id, el);
    });
    await exportImage(canvas, elMap, sorted, layoutResult, layout, style, exportCfg);
  }, [sorted, layoutResult, layout, style, exportCfg]);

  useImperativeHandle(ref, () => ({ triggerExport }));

  const activeImg = activeDragId ? sorted.find(i => i.id === activeDragId) : null;

  const handleCropClick = (id: string) => {
    setCropImageId(id);
    setSelectedId(id);
  };

  // ─── Canvas+Overlay container style (shared transform) ────────────────────
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
      style={{ cursor: isPanning ? 'grabbing' : 'default' }}
    >
      {sorted.length === 0 ? (
        <div className="flex items-center justify-center h-full text-white/20 text-sm">
          Add images in the Library panel to begin
        </div>
      ) : (
        /* ── DndContext always active — drag works in every sort mode ── */
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={sorted.map(i => i.id)} strategy={rectSortingStrategy}>
            <div style={canvasContainerStyle}>
              <canvas ref={canvasRef} className="block absolute inset-0" />
              {layoutResult.cells.map((cell) => {
                const img = sorted.find(i => i.id === cell.imageId);
                if (!img) return null;
                return (
                  <SortableCell
                    key={img.id}
                    cell={cell}
                    img={img}
                    isDragging={activeDragId === img.id}
                    onCropClick={handleCropClick}
                  />
                );
              })}
            </div>
          </SortableContext>

          {/* Ghost thumbnail while dragging */}
          <DragOverlay dropAnimation={null}>
            {activeImg ? (
              <img
                src={activeImg.url}
                alt=""
                style={{
                  width: (layoutResult.cells.find(c => c.imageId === activeImg.id)?.w ?? 100) * zoom,
                  height: (layoutResult.cells.find(c => c.imageId === activeImg.id)?.h ?? 100) * zoom,
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

      {/* "Switched to Manual" toast */}
      {switchedToManual && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/75 border border-white/10 text-white/70 text-[11px] px-3 py-1.5 rounded-full backdrop-blur-sm pointer-events-none flex items-center gap-1.5 shadow-lg">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
          ล็อกลำดับจาก sort · ลากเพื่อปรับเพิ่มเติม
        </div>
      )}

      {/* Zoom indicator */}
      <div className="absolute bottom-2 right-2 bg-black/60 text-white/60 text-xs px-2 py-1 rounded flex items-center gap-2">
        <span>{Math.round(zoom * 100)}%</span>
        <button className="hover:text-white transition-colors" onClick={() => setZoom(1)}>1:1</button>
        <button className="hover:text-white transition-colors" onClick={() => {
          if (!containerRef.current) return;
          const { clientWidth, clientHeight } = containerRef.current;
          setZoom(Math.min((clientWidth - 32) / layoutResult.totalW, (clientHeight - 32) / layoutResult.totalH, 1));
          setPan({ x: 0, y: 0 });
        }}>Fit</button>
      </div>

      {/* Info badge */}
      {sorted.length > 0 && (
        <div className="absolute top-2 left-2 bg-black/60 text-white/40 text-[10px] px-2 py-1 rounded">
          {sorted.length} images · {layoutResult.totalW}×{layoutResult.totalH}px
        </div>
      )}

      {/* Crop modal */}
      {cropImageId && !activeDragId && (
        <CropOverlayModal imageId={cropImageId} onClose={() => setCropImageId(null)} />
      )}
    </div>
  );
});

export default PreviewCanvas;
