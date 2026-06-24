import type { CellAdjust } from '../../types';

const MIN_WEIGHT = 0.12;

export function createUniformCellAdjust(rows: number, cols: number): CellAdjust {
  return {
    rows,
    cols,
    rowWeights: Array.from({ length: rows }, () => 1),
    colWeights: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1)),
  };
}

export function normalizeCellAdjust(
  current: CellAdjust | null,
  rows: number,
  cols: number
): CellAdjust {
  if (!current || current.rows !== rows || current.cols !== cols) {
    return createUniformCellAdjust(rows, cols);
  }
  return {
    rows,
    cols,
    rowWeights: [...current.rowWeights],
    colWeights: current.colWeights.map((row) => [...row]),
  };
}

function clampWeight(w: number): number {
  return Math.max(MIN_WEIGHT, w);
}

/** Redistribute weight within a row after resizing column `colIndex`. */
export function adjustColWeight(
  adjust: CellAdjust,
  rowIndex: number,
  colIndex: number,
  deltaWeight: number,
  cellCountInRow: number
): CellAdjust {
  const colWeights = adjust.colWeights.map((row) => [...row]);
  const weights = colWeights[rowIndex].slice(0, cellCountInRow);
  const total = weights.reduce((s, w) => s + w, 0);
  if (total <= 0 || cellCountInRow < 2) return adjust;

  const next = [...weights];
  next[colIndex] = clampWeight(next[colIndex] + deltaWeight);

  const othersSum = weights.reduce((s, w, i) => (i === colIndex ? s : s + w), 0);
  if (othersSum <= 0) return adjust;

  const appliedDelta = next[colIndex] - weights[colIndex];
  for (let i = 0; i < cellCountInRow; i++) {
    if (i === colIndex) continue;
    next[i] = clampWeight(next[i] - appliedDelta * (weights[i] / othersSum));
  }

  const nextTotal = next.reduce((s, w) => s + w, 0);
  const scale = total / nextTotal;
  for (let i = 0; i < cellCountInRow; i++) {
    colWeights[rowIndex][i] = next[i] * scale;
  }

  return { ...adjust, colWeights };
}

/** Redistribute row height weights after resizing row `rowIndex`. */
export function adjustRowWeight(
  adjust: CellAdjust,
  rowIndex: number,
  deltaWeight: number
): CellAdjust {
  const rowWeights = [...adjust.rowWeights];
  const total = rowWeights.reduce((s, w) => s + w, 0);
  if (total <= 0 || rowWeights.length < 2) return adjust;

  rowWeights[rowIndex] = clampWeight(rowWeights[rowIndex] + deltaWeight);

  const othersSum = adjust.rowWeights.reduce(
    (s, w, i) => (i === rowIndex ? s : s + w),
    0
  );
  if (othersSum <= 0) return adjust;

  const appliedDelta = rowWeights[rowIndex] - adjust.rowWeights[rowIndex];
  for (let i = 0; i < rowWeights.length; i++) {
    if (i === rowIndex) continue;
    rowWeights[i] = clampWeight(rowWeights[i] - appliedDelta * (adjust.rowWeights[i] / othersSum));
  }

  const nextTotal = rowWeights.reduce((s, w) => s + w, 0);
  const scale = total / nextTotal;
  for (let i = 0; i < rowWeights.length; i++) {
    rowWeights[i] *= scale;
  }

  return { ...adjust, rowWeights };
}
