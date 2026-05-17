import type { ImageEntry, LayoutConfig } from '../../types';

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
  imageId: string;
  imageIndex: number;
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
      });
      xCursor += w + gap;
    });
  }

  const rowCount = Math.ceil(images.length / cols);
  const totalH = outerPad + rowCount * (cellH + gap) + outerPad;
  return { cells, totalW: cfg.canvasW, totalH };
}

/** Mosaic / Masonry: shortest-column-first packing */
export function layoutMosaic(
  images: ImageEntry[],
  cfg: LayoutConfig
): LayoutResult {
  const { cols, cellW, gap, outerPad } = cfg;
  const colHeights: number[] = Array(cols).fill(outerPad + gap);
  const cells: CellRect[] = [];

  images.forEach((img, i) => {
    const minH = Math.min(...colHeights);
    const col = colHeights.indexOf(minH);
    const aspect = img.width > 0 ? img.width / img.height : 1;
    const cellH = Math.round(cellW / aspect);

    cells.push({
      x: outerPad + col * (cellW + gap) + gap,
      y: colHeights[col],
      w: cellW,
      h: cellH,
      imageId: img.id,
      imageIndex: i,
    });

    colHeights[col] += cellH + gap;
  });

  const totalH = Math.max(...colHeights) + outerPad;
  const totalW = outerPad + cols * (cellW + gap) + outerPad;
  return { cells, totalW, totalH };
}

export function computeLayout(
  images: ImageEntry[],
  cfg: LayoutConfig
): LayoutResult {
  if (images.length === 0) {
    return { cells: [], totalW: cfg.canvasW, totalH: cfg.canvasH };
  }
  switch (cfg.mode) {
    case 'grid-uniform':
      return layoutGridUniform(images, cfg);
    case 'grid-aspect':
      return layoutGridAspect(images, cfg);
    case 'mosaic':
      return layoutMosaic(images, cfg);
    default:
      return layoutGridUniform(images, cfg);
  }
}
