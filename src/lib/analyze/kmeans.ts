export interface RGB { r: number; g: number; b: number }

function distance(a: RGB, b: RGB): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function randomCentroids(pixels: RGB[], k: number): RGB[] {
  const chosen: number[] = [];
  while (chosen.length < k) {
    const idx = Math.floor(Math.random() * pixels.length);
    if (!chosen.includes(idx)) chosen.push(idx);
  }
  return chosen.map((i) => ({ ...pixels[i] }));
}

export function kMeans(pixels: RGB[], k: number, iters = 10): RGB[] {
  if (pixels.length === 0) return Array(k).fill({ r: 128, g: 128, b: 128 });
  let centroids = randomCentroids(pixels, Math.min(k, pixels.length));

  for (let iter = 0; iter < iters; iter++) {
    const sums: { r: number; g: number; b: number; count: number }[] = centroids.map(
      () => ({ r: 0, g: 0, b: 0, count: 0 })
    );

    for (const px of pixels) {
      let best = 0;
      let bestDist = Infinity;
      for (let ci = 0; ci < centroids.length; ci++) {
        const d = distance(px, centroids[ci]);
        if (d < bestDist) { bestDist = d; best = ci; }
      }
      sums[best].r += px.r;
      sums[best].g += px.g;
      sums[best].b += px.b;
      sums[best].count++;
    }

    centroids = sums.map((s, i) =>
      s.count > 0
        ? { r: s.r / s.count, g: s.g / s.count, b: s.b / s.count }
        : centroids[i]
    );
  }

  return centroids.map((c) => ({
    r: Math.round(c.r),
    g: Math.round(c.g),
    b: Math.round(c.b),
  }));
}

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = d / (l > 0.5 ? 2 - max - min : max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s, l];
}
