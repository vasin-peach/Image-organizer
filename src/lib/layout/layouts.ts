import type { ImageEntry, LayoutConfig, CellAdjust, MosaicAdjust } from '../../types';
import { createUniformCellAdjust } from './cellAdjust';
import { createUniformMosaicAdjust, mosaicColX } from './mosaicAdjust';

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
  imageIndex: number;
  rowIndex: number;
  colIndex: number;
}

export interface LayoutResult {
  cells: CellRect[];
  totalW: number;
  totalH: number;
}

/** Grid Uniform: every cell is the same size */
export function layoutGridUniform(
  images: ImageEntry[],
  cfg: LayoutConfig
): LayoutResult {
  const { cols, cellW, cellH, gap, outerPad } = cfg;
  const cells: CellRect[] = [];

  images.forEach((img, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    cells.push({
      x: outerPad + col * (cellW + gap) + gap,
      y: outerPad + row * (cellH + gap) + gap,
      w: cellW,
      h: cellH,
      imageId: img.id,
      imageIndex: i,
      rowIndex: row,
      colIndex: col,
    });
  });

  return { cells, totalW: cfg.canvasW, totalH: cfg.canvasH };
}

/** Grid Aspect: each row has equal height but width proportional to image aspect */
export function layoutGridAspect(
  images: ImageEntry[],
  cfg: LayoutConfig
): LayoutResult {
  const { cols, cellH, gap, outerPad } = cfg;
  const availW = cfg.canvasW - 2 * outerPad - (cols + 1) * gap;
  const cells: CellRect[] = [];

  // Slice images into rows of `cols`
  for (let rowStart = 0; rowStart < images.length; rowStart += cols) {
    const row = images.slice(rowStart, rowStart + cols);
    const rowIdx = Math.floor(rowStart / cols);

    // Sum of aspect ratios in this row
    const totalAspect = row.reduce((s, img) => {
      const aspect = img.width > 0 ? img.width / img.height : 1;
      return s + aspect;
    }, 0);

    let xCursor = outerPad + gap;
    const y = outerPad + rowIdx * (cellH + gap) + gap;

    row.forEach((img, colIdx) => {
      const aspect = img.width > 0 ? img.width / img.height : 1;
      const w = Math.floor((aspect / totalAspect) * availW);
      cells.push({
        x: xCursor,
        y,
        w,
        h: cellH,
        imageId: img.id,
        imageIndex: rowStart + colIdx,
        rowIndex: rowIdx,
        colIndex: colIdx,
      });
      xCursor += w + gap;
    });
  }

  const rowCount = Math.ceil(images.length / cols);
  const totalH = outerPad + rowCount * (cellH + gap) + outerPad;
  return { cells, totalW: cfg.canvasW, totalH };
}

/** Fit mosaic cells to cfg canvas when lockMode is canvas; otherwise use natural bounds. */
function finalizeMosaicFrame(cells: CellRect[], cfg: LayoutConfig): LayoutResult {
  const naturalW = cells.length
    ? Math.max(...cells.map((c) => c.x + c.w)) + cfg.outerPad
    : cfg.canvasW;
  const naturalH = cells.length
    ? Math.max(...cells.map((c) => c.y + c.h)) + cfg.outerPad
    : cfg.canvasH;

  if (cfg.lockMode !== 'canvas' || cells.length === 0) {
    return { cells, totalW: naturalW, totalH: naturalH };
  }

  const targetW = cfg.canvasW;
  const targetH = cfg.canvasH;
  const scaleX = naturalW > 0 ? targetW / naturalW : 1;
  const scaleY = naturalH > 0 ? targetH / naturalH : 1;

  const scaled = cells.map((c) => ({
    ...c,
    x: cfg.outerPad + (c.x - cfg.outerPad) * scaleX,
    y: cfg.outerPad + (c.y - cfg.outerPad) * scaleY,
    w: c.w * scaleX,
    h: c.h * scaleY,
  }));

  return { cells: scaled, totalW: targetW, totalH: targetH };
}

/** Mosaic / Masonry: shortest-column-first packing */
export function layoutMosaic(
  images: ImageEntry[],
  cfg: LayoutConfig
): LayoutResult {
  const { cols, gap, outerPad } = cfg;
  const availW = cfg.canvasW - 2 * outerPad - (cols + 1) * gap;
  const cellW = cols > 0 ? availW / cols : availW;
  const colHeights: number[] = Array(cols).fill(outerPad + gap);
  const cells: CellRect[] = [];

  images.forEach((img, i) => {
    const minH = Math.min(...colHeights);
    const col = colHeights.indexOf(minH);
    const aspect = img.width > 0 ? img.width / img.height : 1;
    const cellH = Math.round(cellW / aspect);

    cells.push({
      x: mosaicColX(col, Array(cols).fill(cellW), gap, outerPad),
      y: colHeights[col],
      w: cellW,
      h: cellH,
      imageId: img.id,
      imageIndex: i,
      rowIndex: 0,
      colIndex: col,
    });

    colHeights[col] += cellH + gap;
  });

  return finalizeMosaicFrame(cells, cfg);
}

/** Mosaic with per-column width weights and per-image height scales */
export function layoutMosaicAdjustable(
  images: ImageEntry[],
  cfg: LayoutConfig,
  mosaicAdjust: MosaicAdjust
): LayoutResult {
  const { cols, gap, outerPad } = cfg;
  const adjust =
    mosaicAdjust.cols === cols ? mosaicAdjust : createUniformMosaicAdjust(cols);

  const colWeightSum = adjust.colWeights.reduce((s, w) => s + w, 0) || cols;
  const availW = cfg.canvasW - 2 * outerPad - (cols + 1) * gap;
  const colWidths = adjust.colWeights.map((w) => (w / colWeightSum) * availW);

  const colHeights: number[] = Array(cols).fill(outerPad + gap);
  const cells: CellRect[] = [];

  images.forEach((img, i) => {
    const minH = Math.min(...colHeights);
    const col = colHeights.indexOf(minH);
    const aspect = img.width > 0 ? img.width / img.height : 1;
    const cellW = colWidths[col];
    const heightScale = adjust.heightScales[img.id] ?? 1;
    const cellH = Math.round((cellW / aspect) * heightScale);

    cells.push({
      x: mosaicColX(col, colWidths, gap, outerPad),
      y: colHeights[col],
      w: cellW,
      h: cellH,
      imageId: img.id,
      imageIndex: i,
      rowIndex: 0,
      colIndex: col,
    });

    colHeights[col] += cellH + gap;
  });

  return finalizeMosaicFrame(cells, cfg);
}

/** Grid Uniform with per-row column weights and per-row height weights */
export function layoutGridAdjustable(
  images: ImageEntry[],
  cfg: LayoutConfig,
  cellAdjust: CellAdjust
): LayoutResult {
  const { cols, gap, outerPad, canvasW, canvasH } = cfg;
  const rows = Math.ceil(images.length / cols);
  const adjust =
    cellAdjust.rows === rows && cellAdjust.cols === cols
      ? cellAdjust
      : createUniformCellAdjust(rows, cols);

  const rowWeightSum = adjust.rowWeights.reduce((s, w) => s + w, 0) || rows;
  const availH = canvasH - 2 * outerPad - (rows + 1) * gap;
  const cells: CellRect[] = [];
  let y = outerPad + gap;

  for (let row = 0; row < rows; row++) {
    const rowStart = row * cols;
    const cellsInRow = Math.min(cols, images.length - rowStart);
    const rowH = (adjust.rowWeights[row] / rowWeightSum) * availH;
    const weights = adjust.colWeights[row].slice(0, cellsInRow);
    const colWeightSum = weights.reduce((s, w) => s + w, 0) || cellsInRow;
    const availW = canvasW - 2 * outerPad - (cellsInRow + 1) * gap;
    let x = outerPad + gap;

    for (let col = 0; col < cellsInRow; col++) {
      const img = images[rowStart + col];
      const w = (weights[col] / colWeightSum) * availW;
      cells.push({
        x,
        y,
        w,
        h: rowH,
        imageId: img.id,
        imageIndex: rowStart + col,
        rowIndex: row,
        colIndex: col,
      });
      x += w + gap;
    }

    y += rowH + gap;
  }

  return { cells, totalW: cfg.canvasW, totalH: cfg.canvasH };
}

export function computeLayout(
  images: ImageEntry[],
  cfg: LayoutConfig,
  cellAdjust?: CellAdjust | null,
  mosaicAdjust?: MosaicAdjust | null
): LayoutResult {
  if (images.length === 0) {
    return { cells: [], totalW: cfg.canvasW, totalH: cfg.canvasH };
  }
  switch (cfg.mode) {
    case 'grid-uniform':
      if (cellAdjust) {
        return layoutGridAdjustable(images, cfg, cellAdjust);
      }
      return layoutGridUniform(images, cfg);
    case 'grid-aspect':
      return layoutGridAspect(images, cfg);
    case 'mosaic':
      if (mosaicAdjust) {
        return layoutMosaicAdjustable(images, cfg, mosaicAdjust);
      }
      return layoutMosaic(images, cfg);
    default:
      return layoutGridUniform(images, cfg);
  }
}
