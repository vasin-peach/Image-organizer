import type { MosaicAdjust } from '../../types';

const MIN_WEIGHT = 0.12;
const MIN_HEIGHT_SCALE = 0.25;
const MAX_HEIGHT_SCALE = 4;

export function createUniformMosaicAdjust(cols: number): MosaicAdjust {
  return {
    cols,
    colWeights: Array.from({ length: cols }, () => 1),
    heightScales: {},
  };
}

export function normalizeMosaicAdjust(
  current: MosaicAdjust | null,
  cols: number
): MosaicAdjust {
  if (!current || current.cols !== cols) {
    return createUniformMosaicAdjust(cols);
  }
  return {
    cols,
    colWeights: [...current.colWeights],
    heightScales: { ...current.heightScales },
  };
}

function clampWeight(w: number): number {
  return Math.max(MIN_WEIGHT, w);
}

/** Redistribute column width weights for mosaic layout. */
export function adjustMosaicColWeight(
  adjust: MosaicAdjust,
  colIndex: number,
  deltaWeight: number
): MosaicAdjust {
  const colWeights = [...adjust.colWeights];
  const total = colWeights.reduce((s, w) => s + w, 0);
  if (total <= 0 || colWeights.length < 2) return adjust;

  colWeights[colIndex] = clampWeight(colWeights[colIndex] + deltaWeight);

  const othersSum = adjust.colWeights.reduce(
    (s, w, i) => (i === colIndex ? s : s + w),
    0
  );
  if (othersSum <= 0) return adjust;

  const appliedDelta = colWeights[colIndex] - adjust.colWeights[colIndex];
  for (let i = 0; i < colWeights.length; i++) {
    if (i === colIndex) continue;
    colWeights[i] = clampWeight(colWeights[i] - appliedDelta * (adjust.colWeights[i] / othersSum));
  }

  const nextTotal = colWeights.reduce((s, w) => s + w, 0);
  const scale = total / nextTotal;
  for (let i = 0; i < colWeights.length; i++) {
    colWeights[i] *= scale;
  }

  return { ...adjust, colWeights };
}

/** Adjust per-image height scale in mosaic layout. */
export function adjustMosaicHeightScale(
  adjust: MosaicAdjust,
  imageId: string,
  deltaScale: number
): MosaicAdjust {
  const current = adjust.heightScales[imageId] ?? 1;
  const next = Math.max(
    MIN_HEIGHT_SCALE,
    Math.min(MAX_HEIGHT_SCALE, current + deltaScale)
  );
  return {
    ...adjust,
    heightScales: { ...adjust.heightScales, [imageId]: next },
  };
}

/** Set absolute per-image height scale in mosaic layout. */
export function setMosaicHeightScale(
  adjust: MosaicAdjust,
  imageId: string,
  scale: number
): MosaicAdjust {
  const next = Math.max(MIN_HEIGHT_SCALE, Math.min(MAX_HEIGHT_SCALE, scale));
  return {
    ...adjust,
    heightScales: { ...adjust.heightScales, [imageId]: next },
  };
}

export function mosaicColX(
  col: number,
  colWidths: number[],
  gap: number,
  outerPad: number
): number {
  let x = outerPad + gap;
  for (let c = 0; c < col; c++) {
    x += colWidths[c] + gap;
  }
  return x;
}
