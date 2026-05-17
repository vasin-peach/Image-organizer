import { kMeans, rgbToHsl, type RGB } from './kmeans';
import type { ImageMetadata } from '../../types';

const SAMPLE_SIZE = 64;
const K_COLORS = 5;

function samplePixels(data: Uint8ClampedArray, _w: number, _h: number): RGB[] {
  const pixels: RGB[] = [];
  for (let i = 0; i < data.length; i += 4) {
    pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  return pixels;
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function sobelEdgeDensity(data: Uint8ClampedArray, w: number, h: number): number {
  let total = 0;
  let count = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      const getGray = (dy: number, dx: number) => {
        const ii = ((y + dy) * w + (x + dx)) * 4;
        return luminance(data[ii], data[ii + 1], data[ii + 2]);
      };
      const gx =
        -getGray(-1, -1) + getGray(-1, 1) +
        -2 * getGray(0, -1) + 2 * getGray(0, 1) +
        -getGray(1, -1) + getGray(1, 1);
      const gy =
        -getGray(-1, -1) - 2 * getGray(-1, 0) - getGray(-1, 1) +
        getGray(1, -1) + 2 * getGray(1, 0) + getGray(1, 1);
      void idx; // suppress unused
      total += Math.sqrt(gx * gx + gy * gy);
      count++;
    }
  }
  return count > 0 ? Math.min(1, total / count / 255) : 0;
}

function computeSymmetry(
  data: Uint8ClampedArray,
  w: number,
  h: number
): { h: number; v: number } {
  let sumH = 0, sumV = 0;
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < Math.floor(w / 2); x++) {
      const leftIdx = (y * w + x) * 4;
      const rightIdx = (y * w + (w - 1 - x)) * 4;
      const diff =
        Math.abs(data[leftIdx] - data[rightIdx]) +
        Math.abs(data[leftIdx + 1] - data[rightIdx + 1]) +
        Math.abs(data[leftIdx + 2] - data[rightIdx + 2]);
      sumH += diff / (3 * 255);
      count++;
    }
  }
  const symH = count > 0 ? 1 - sumH / count : 0;
  count = 0;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < Math.floor(h / 2); y++) {
      const topIdx = (y * w + x) * 4;
      const botIdx = ((h - 1 - y) * w + x) * 4;
      const diff =
        Math.abs(data[topIdx] - data[botIdx]) +
        Math.abs(data[topIdx + 1] - data[botIdx + 1]) +
        Math.abs(data[topIdx + 2] - data[botIdx + 2]);
      sumV += diff / (3 * 255);
      count++;
    }
  }
  const symV = count > 0 ? 1 - sumV / count : 0;
  return { h: symH, v: symV };
}

function saliencyCenter(data: Uint8ClampedArray, w: number, h: number): { x: number; y: number } {
  // Edge-weighted centroid as saliency proxy
  let totalWeight = 0;
  let cx = 0;
  let cy = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const getGray = (dy: number, dx: number) => {
        const ii = ((y + dy) * w + (x + dx)) * 4;
        return luminance(data[ii], data[ii + 1], data[ii + 2]);
      };
      const gx =
        -getGray(-1, -1) + getGray(-1, 1) +
        -2 * getGray(0, -1) + 2 * getGray(0, 1) +
        -getGray(1, -1) + getGray(1, 1);
      const gy =
        -getGray(-1, -1) - 2 * getGray(-1, 0) - getGray(-1, 1) +
        getGray(1, -1) + 2 * getGray(1, 0) + getGray(1, 1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      cx += (x / w) * mag;
      cy += (y / h) * mag;
      totalWeight += mag;
    }
  }
  return totalWeight > 0
    ? { x: cx / totalWeight, y: cy / totalWeight }
    : { x: 0.5, y: 0.5 };
}

function thirdsScore(center: { x: number; y: number }): number {
  const points = [
    { x: 1 / 3, y: 1 / 3 },
    { x: 2 / 3, y: 1 / 3 },
    { x: 1 / 3, y: 2 / 3 },
    { x: 2 / 3, y: 2 / 3 },
  ];
  const minDist = Math.min(
    ...points.map((p) =>
      Math.sqrt((center.x - p.x) ** 2 + (center.y - p.y) ** 2)
    )
  );
  return Math.max(0, 1 - minDist / 0.5);
}

export async function analyzeImageData(
  imageData: ImageData
): Promise<ImageMetadata> {
  const { data, width, height } = imageData;

  const pixels = samplePixels(data, width, height);

  // --- dominant colors
  const dominantColors = kMeans(pixels, K_COLORS);

  // Sort by "vibrancy" (saturation * brightness) descending
  const sorted = [...dominantColors].sort((a, b) => {
    const [, sa, la] = rgbToHsl(a.r, a.g, a.b);
    const [, sb, lb] = rgbToHsl(b.r, b.g, b.b);
    return sb * lb - sa * la;
  });

  const [hue, saturation, lightness] = rgbToHsl(sorted[0].r, sorted[0].g, sorted[0].b);

  // --- brightness (average luminance)
  let lumSum = 0;
  for (const px of pixels) lumSum += luminance(px.r, px.g, px.b);
  const brightness = lumSum / (pixels.length * 255);

  // --- temperature: warm if R > B
  let tempSum = 0;
  for (const px of pixels) tempSum += px.r - px.b;
  const temperature = Math.max(-1, Math.min(1, tempSum / (pixels.length * 255)));

  // --- edge density via Sobel
  const edgeDensity = sobelEdgeDensity(data, width, height);

  // --- symmetry
  const symmetry = computeSymmetry(data, width, height);

  // --- subject center (saliency fallback — face-api requires DOM, not used in worker)
  const subjectCenter = saliencyCenter(data, width, height);

  // --- rule of thirds score
  const score = thirdsScore(subjectCenter);

  return {
    dominantColors: sorted,
    hue,
    saturation,
    lightness,
    brightness,
    temperature,
    edgeDensity,
    symmetryH: symmetry.h,
    symmetryV: symmetry.v,
    subjectCenter,
    thirdsScore: score,
  };
}

export function downsampleImageData(
  data: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  targetSize: number
): ImageData {
  const scale = Math.min(targetSize / srcW, targetSize / srcH, 1);
  const dstW = Math.max(1, Math.round(srcW * scale));
  const dstH = Math.max(1, Math.round(srcH * scale));
  const dst = new Uint8ClampedArray(dstW * dstH * 4);

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor(x / scale);
      const sy = Math.floor(y / scale);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = data[si];
      dst[di + 1] = data[si + 1];
      dst[di + 2] = data[si + 2];
      dst[di + 3] = data[si + 3];
    }
  }
  return new ImageData(dst, dstW, dstH);
}

export { SAMPLE_SIZE };
