import type { ImageEntry, LayoutConfig, StyleConfig, ExportConfig, FitMode } from '../../types';
import type { CellRect, LayoutResult } from '../layout/layouts';
import { computeCoverCropOffset } from './cropMath';

export interface RenderOptions {
  layout: LayoutResult;
  images: ImageEntry[];
  style: StyleConfig;
  layoutCfg: LayoutConfig;
  scale?: number;
}

function drawImageInCell(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  cell: CellRect,
  mode: FitMode,
  offsetX: number,
  offsetY: number,
  zoom: number,
  borderRadius: number,
  scale: number,
  subjectCenter?: { x: number; y: number } | null
): void {
  const { x, y, w, h } = cell;
  const sx = x * scale;
  const sy = y * scale;
  const sw = w * scale;
  const sh = h * scale;

  const imgW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const imgH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;

  if (mode === 'fit') {
    // Letterbox — draw the full image centred with padding
    const fitScale = Math.min(sw / imgW, sh / imgH);
    const drawW = imgW * fitScale;
    const drawH = imgH * fitScale;
    ctx.save();
    ctx.beginPath();
    roundRect(ctx, sx, sy, sw, sh, borderRadius * scale);
    ctx.clip();
    ctx.drawImage(img, sx + (sw - drawW) / 2, sy + (sh - drawH) / 2, drawW, drawH);
    ctx.restore();
    return;
  }

  const { cx, cy } = computeCoverCropOffset(
    sw,
    sh,
    imgW,
    imgH,
    mode,
    offsetX,
    offsetY,
    zoom,
    subjectCenter
  );
  const coverScale = Math.max(sw / imgW, sh / imgH) * zoom;
  const coverW = imgW * coverScale;
  const coverH = imgH * coverScale;

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, sx, sy, sw, sh, borderRadius * scale);
  ctx.clip();
  ctx.drawImage(img, sx + cx, sy + cy, coverW, coverH);
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  imageElements: Map<string, HTMLImageElement>,
  opts: RenderOptions
): Promise<void> {
  const scale = opts.scale ?? 1;
  const { layout, style } = opts;
  const ctx = canvas.getContext('2d')!;

  canvas.width = layout.totalW * scale;
  canvas.height = layout.totalH * scale;

  // Background
  ctx.fillStyle = style.bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, canvas.width, canvas.height);
  ctx.clip();

  for (const cell of layout.cells) {
    const img = opts.images.find((i) => i.id === cell.imageId);
    if (!img) continue;
    const el = imageElements.get(img.id);
    if (!el || !el.complete) continue;

    const { mode, offsetX, offsetY, zoom } = img.cropOverride;

    drawImageInCell(
      ctx,
      el,
      cell,
      mode,
      offsetX,
      offsetY,
      zoom,
      style.borderRadius,
      scale,
      img.metadata?.subjectCenter ?? null
    );

    if (style.showBorder) {
      ctx.strokeStyle = style.borderColor;
      ctx.lineWidth = style.borderWidth * scale;
      ctx.beginPath();
      roundRect(ctx, cell.x * scale, cell.y * scale, cell.w * scale, cell.h * scale, style.borderRadius * scale);
      ctx.stroke();
    }
  }

  ctx.restore();
}

export async function exportImage(
  _canvas: HTMLCanvasElement,
  imageElements: Map<string, HTMLImageElement>,
  images: ImageEntry[],
  layout: LayoutResult,
  layoutCfg: LayoutConfig,
  style: StyleConfig,
  exportCfg: ExportConfig
): Promise<void> {
  // Derive actual scale: if targetWidth > 0, compute from canvas width
  const effectiveScale =
    exportCfg.targetWidth > 0
      ? exportCfg.targetWidth / layout.totalW
      : exportCfg.scale;

  // Render to an offscreen canvas at target scale
  const offscreen = document.createElement('canvas');
  await renderToCanvas(offscreen, imageElements, {
    layout,
    images,
    style,
    layoutCfg: layoutCfg,
    scale: effectiveScale,
  });

  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
  };
  const mime = mimeMap[exportCfg.format] ?? 'image/png';
  const quality = exportCfg.format === 'png' ? undefined : exportCfg.quality;

  offscreen.toBlob(
    (blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportCfg.filename}.${exportCfg.format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    },
    mime,
    quality
  );
}
