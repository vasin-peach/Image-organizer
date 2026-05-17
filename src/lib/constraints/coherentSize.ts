import type { LayoutConfig, LockMode } from '../../types';

/**
 * canvasW = cols * cellW + (cols + 1) * gap + 2 * outerPad
 * canvasH = rows * cellH + (rows + 1) * gap + 2 * outerPad
 * rows * cols >= imageCount
 */

export function computeRows(cols: number, imageCount: number): number {
  return Math.ceil(imageCount / cols);
}

export function computeCanvasW(
  cols: number,
  cellW: number,
  gap: number,
  outerPad: number
): number {
  return cols * cellW + (cols + 1) * gap + 2 * outerPad;
}

export function computeCanvasH(
  rows: number,
  cellH: number,
  gap: number,
  outerPad: number
): number {
  return rows * cellH + (rows + 1) * gap + 2 * outerPad;
}

export function computeCellW(
  canvasW: number,
  cols: number,
  gap: number,
  outerPad: number
): number {
  return Math.floor((canvasW - (cols + 1) * gap - 2 * outerPad) / cols);
}

export function computeCellH(
  canvasH: number,
  rows: number,
  gap: number,
  outerPad: number
): number {
  return Math.floor((canvasH - (rows + 1) * gap - 2 * outerPad) / rows);
}

export interface SolverResult {
  layout: LayoutConfig;
  valid: boolean;
  warnings: string[];
}

export function solveLayout(
  cfg: LayoutConfig,
  imageCount: number,
  lockMode: LockMode
): SolverResult {
  const warnings: string[] = [];
  let { cols, cellW, cellH, gap, outerPad, cellAspect } = cfg;

  const n = Math.max(1, imageCount);

  // Rows/cols resolution
  let rows: number;
  if (cfg.rowsManual) {
    // User fixed rows → compute cols to fit all images
    rows = Math.max(1, Math.round(cfg.rows));
    cols = Math.max(1, Math.ceil(n / rows));
  } else {
    cols = Math.max(1, Math.round(cols));
    rows = computeRows(cols, n);
  }

  if (rows * cols < n) {
    warnings.push(`Grid has ${rows * cols} cells but ${n} images — increase rows or cols`);
  }

  let canvasW = cfg.canvasW;
  let canvasH = cfg.canvasH;

  if (lockMode === 'canvas') {
    cellW = computeCellW(canvasW, cols, gap, outerPad);
    cellH = computeCellH(canvasH, rows, gap, outerPad);
    if (cellW < 10) warnings.push('Cell width too small for current canvas/cols/gap');
    if (cellH < 10) warnings.push('Cell height too small for current canvas/rows/gap');
  } else if (lockMode === 'cell') {
    canvasW = computeCanvasW(cols, cellW, gap, outerPad);
    canvasH = computeCanvasH(rows, cellH, gap, outerPad);
  } else if (lockMode === 'aspect') {
    cellW = computeCellW(canvasW, cols, gap, outerPad);
    cellH = Math.round(cellW / cellAspect);
    canvasH = computeCanvasH(rows, cellH, gap, outerPad);
    if (cellW < 10) warnings.push('Cell width too small');
  } else if (lockMode === 'auto-cols') {
    const availableW = canvasW - 2 * outerPad + gap;
    cols = Math.max(1, Math.floor(availableW / (cellW + gap)));
    if (cfg.rowsManual) {
      rows = Math.max(1, Math.round(cfg.rows));
    } else {
      rows = computeRows(cols, n);
    }
    canvasH = computeCanvasH(rows, cellH, gap, outerPad);
    cellW = computeCellW(canvasW, cols, gap, outerPad);
  }

  const valid = cellW >= 10 && cellH >= 10 && cols >= 1 && rows >= 1 && warnings.length === 0;

  return {
    layout: {
      ...cfg,
      cols,
      rows,
      cellW: Math.max(1, cellW),
      cellH: Math.max(1, cellH),
      canvasW: Math.max(1, canvasW),
      canvasH: Math.max(1, canvasH),
      lockMode,
    },
    valid,
    warnings,
  };
}
