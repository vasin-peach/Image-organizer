/**
 * Resize an image File to fit within maxSide × maxSide pixels.
 * Returns the original File if it already fits or maxSide === 0.
 * Output is always JPEG at quality 0.92 (smaller than PNG, fast to decode).
 */
export async function resizeImageFile(
  file: File,
  maxSide: number
): Promise<{ file: File; width: number; height: number; resized: boolean }> {
  // Load natural dimensions first
  const { img, width: natW, height: natH } = await loadImg(file);

  // Skip if no resize needed
  if (maxSide === 0 || (natW <= maxSide && natH <= maxSide)) {
    return { file, width: natW, height: natH, resized: false };
  }

  // Compute scale to fit within maxSide
  const scale = maxSide / Math.max(natW, natH);
  const dstW = Math.round(natW * scale);
  const dstH = Math.round(natH * scale);

  const canvas = document.createElement('canvas');
  canvas.width = dstW;
  canvas.height = dstH;

  const ctx = canvas.getContext('2d')!;
  // Use high-quality downscaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, dstW, dstH);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      0.92
    );
  });

  const resizedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  });

  return { file: resizedFile, width: dstW, height: dstH, resized: true };
}

function loadImg(file: File): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ img, width: img.naturalWidth, height: img.naturalHeight });
      // keep URL alive until canvas draw is done — caller revokes separately
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load ${file.name}`));
    };
    img.src = url;
  });
}
