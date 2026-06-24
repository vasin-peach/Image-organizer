import type { CellRect } from './layouts';

export const SNAP_THRESHOLD_PX = 16;

export type SnapAxis = 'x' | 'y';

export interface SnapGuide {
  axis: SnapAxis;
  position: number;
}

/** Collect vertical (x) or horizontal (y) snap lines from canvas frame and cell edges. */
export function collectSnapTargets(
  cells: CellRect[],
  canvasW: number,
  canvasH: number,
  outerPad: number,
  axis: SnapAxis,
  excludeNear?: number | number[]
): number[] {
  const targets = new Set<number>();
  const excludes = excludeNear === undefined
    ? []
    : Array.isArray(excludeNear)
      ? excludeNear
      : [excludeNear];

  if (axis === 'x') {
    targets.add(outerPad);
    targets.add(canvasW - outerPad);
    for (const cell of cells) {
      targets.add(cell.x);
      targets.add(cell.x + cell.w);
    }
  } else {
    targets.add(outerPad);
    targets.add(canvasH - outerPad);
    for (const cell of cells) {
      targets.add(cell.y);
      targets.add(cell.y + cell.h);
    }
  }

  for (const exclude of excludes) {
    for (const t of [...targets]) {
      if (Math.abs(t - exclude) < 0.5) {
        targets.delete(t);
      }
    }
  }

  return [...targets].sort((a, b) => a - b);
}

export function snapToNearest(
  proposed: number,
  targets: number[],
  threshold: number,
  axis: SnapAxis
): { snapped: number; guide: SnapGuide } | null {
  let best: { dist: number; target: number } | null = null;

  for (const target of targets) {
    const dist = Math.abs(proposed - target);
    if (dist <= threshold && (!best || dist < best.dist)) {
      best = { dist, target };
    }
  }

  if (!best) return null;
  return {
    snapped: best.target,
    guide: { axis, position: best.target },
  };
}

export function applyEdgeSnap(
  rawDeltaPx: number,
  currentEdge: number,
  axis: SnapAxis,
  cells: CellRect[],
  canvasW: number,
  canvasH: number,
  outerPad: number,
  zoom: number,
  excludeEdges?: number[]
): { deltaPx: number; guide: SnapGuide | null } {
  const threshold = SNAP_THRESHOLD_PX / zoom;
  const proposedEdge = currentEdge + rawDeltaPx;
  const excludes = excludeEdges ?? [currentEdge];
  const targets = collectSnapTargets(
    cells,
    canvasW,
    canvasH,
    outerPad,
    axis,
    excludes
  );
  const snap = snapToNearest(proposedEdge, targets, threshold, axis);

  if (snap) {
    return { deltaPx: snap.snapped - currentEdge, guide: snap.guide };
  }
  return { deltaPx: rawDeltaPx, guide: null };
}
