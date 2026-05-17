import type { ImageEntry, SortConfig, SortWeights } from '../../types';

type Extractor = (img: ImageEntry) => number;

const safe = (img: ImageEntry, fn: Extractor): number => {
  if (!img.metadata) return 0;
  return fn(img);
};

const extractors: Record<string, Extractor> = {
  hue: (img) => safe(img, (i) => i.metadata!.hue / 360),
  brightness: (img) => safe(img, (i) => i.metadata!.brightness),
  saturation: (img) => safe(img, (i) => i.metadata!.saturation),
  temperature: (img) => safe(img, (i) => (i.metadata!.temperature + 1) / 2),
  edgeDensity: (img) => safe(img, (i) => i.metadata!.edgeDensity),
  symmetry: (img) => safe(img, (i) => (i.metadata!.symmetryH + i.metadata!.symmetryV) / 2),
  thirdsScore: (img) => safe(img, (i) => i.metadata!.thirdsScore),
  subjectPosition: (img) => safe(img, (i) => i.metadata!.subjectCenter.x),
  dominantColor: (img) => safe(img, (i) => i.metadata!.hue / 360),
};

function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export function sortImages(
  images: ImageEntry[],
  config: SortConfig
): ImageEntry[] {
  const { mode, reversed, weights, twoAxis } = config;
  const imgs = [...images];

  let sorted: ImageEntry[];

  switch (mode) {
    case 'none':
      sorted = imgs;
      break;

    case 'dominantColor':
    case 'hueWheel':
      sorted = imgs.sort((a, b) => extractors.hue(a) - extractors.hue(b));
      break;

    case 'brightness':
      sorted = imgs.sort((a, b) => extractors.brightness(a) - extractors.brightness(b));
      break;

    case 'saturation':
      sorted = imgs.sort((a, b) => extractors.saturation(a) - extractors.saturation(b));
      break;

    case 'temperature':
      sorted = imgs.sort((a, b) => extractors.temperature(a) - extractors.temperature(b));
      break;

    case 'thirdsScore':
      sorted = imgs.sort((a, b) => extractors.thirdsScore(b) - extractors.thirdsScore(a));
      break;

    case 'edgeDensity':
      sorted = imgs.sort((a, b) => extractors.edgeDensity(a) - extractors.edgeDensity(b));
      break;

    case 'symmetry':
      sorted = imgs.sort((a, b) => extractors.symmetry(b) - extractors.symmetry(a));
      break;

    case 'subjectPosition':
      sorted = imgs.sort(
        (a, b) => extractors.subjectPosition(a) - extractors.subjectPosition(b)
      );
      break;

    case 'similarityChain':
      sorted = similarityChain(imgs);
      break;

    case 'twoAxis':
      sorted = sortTwoAxis(imgs, twoAxis.axisX, twoAxis.axisY);
      break;

    case 'multiCriteria':
      sorted = sortMultiCriteria(imgs, weights);
      break;

    default:
      sorted = imgs;
  }

  if (reversed) sorted.reverse();
  return sorted;
}

export function sortTwoAxis(
  images: ImageEntry[],
  axisX: keyof SortWeights,
  axisY: keyof SortWeights,
): ImageEntry[] {
  const exX = extractors[axisX] ?? extractors.hue;
  const exY = extractors[axisY] ?? extractors.brightness;
  return [...images].sort((a, b) => {
    const yDiff = exY(a) - exY(b);
    if (Math.abs(yDiff) > 0.05) return yDiff; // primarily by Y
    return exX(a) - exX(b); // then by X within Y band
  });
}

export function sortMultiCriteria(
  images: ImageEntry[],
  weights: SortWeights
): ImageEntry[] {
  const keys = Object.keys(weights) as (keyof SortWeights)[];
  const totalWeight = keys.reduce((s, k) => s + weights[k], 0);
  if (totalWeight === 0) return images;

  const rawValues = keys.map((k) => images.map((img) => extractors[k]?.(img) ?? 0));
  const normalizedValues = rawValues.map(normalize);

  const scores = images.map((_, i) => {
    let score = 0;
    keys.forEach((k, ki) => {
      score += (weights[k] / totalWeight) * normalizedValues[ki][i];
    });
    return score;
  });

  return [...images].sort((a, b) => {
    const ai = images.indexOf(a);
    const bi = images.indexOf(b);
    return scores[ai] - scores[bi];
  });
}

function featureVector(img: ImageEntry): number[] {
  if (!img.metadata) return [0, 0, 0, 0, 0];
  const m = img.metadata;
  return [
    m.hue / 360,
    m.brightness,
    m.saturation,
    m.edgeDensity,
    (m.temperature + 1) / 2,
  ];
}

function euclidean(a: number[], b: number[]): number {
  return Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
}

export function similarityChain(images: ImageEntry[]): ImageEntry[] {
  if (images.length <= 1) return images;
  const remaining = new Set<number>(images.map((_, i) => i));
  const result: number[] = [];

  // Start from darkest image
  let startIdx = 0;
  let minBrightness = Infinity;
  for (const i of remaining) {
    const b = images[i].metadata?.brightness ?? 0.5;
    if (b < minBrightness) { minBrightness = b; startIdx = i; }
  }

  result.push(startIdx);
  remaining.delete(startIdx);

  while (remaining.size > 0) {
    const last = result[result.length - 1];
    const lastVec = featureVector(images[last]);
    let nearest = -1;
    let minDist = Infinity;
    for (const i of remaining) {
      const d = euclidean(lastVec, featureVector(images[i]));
      if (d < minDist) { minDist = d; nearest = i; }
    }
    result.push(nearest);
    remaining.delete(nearest);
  }

  return result.map((i) => images[i]);
}
