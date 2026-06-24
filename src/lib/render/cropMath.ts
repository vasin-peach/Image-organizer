import type { FitMode } from '../../types';

export function computeCoverCropOffset(
  sw: number,
  sh: number,
  imgW: number,
  imgH: number,
  mode: FitMode,
  offsetX: number,
  offsetY: number,
  zoom: number,
  subjectCenter?: { x: number; y: number } | null
): { cx: number; cy: number } {
  const coverScale = Math.max(sw / imgW, sh / imgH) * zoom;
  const coverW = imgW * coverScale;
  const coverH = imgH * coverScale;

  let cx: number;
  let cy: number;

  if (mode === 'smart' && subjectCenter) {
    cx = sw / 2 - subjectCenter.x * coverW;
    cy = sh / 2 - subjectCenter.y * coverH;
  } else {
    cx = (sw - coverW) / 2;
    cy = (sh - coverH) / 2;
  }

  cx += offsetX * (coverW - sw);
  cy += offsetY * (coverH - sh);

  cx = Math.min(0, Math.max(sw - coverW, cx));
  cy = Math.min(0, Math.max(sh - coverH, cy));

  return { cx, cy };
}
