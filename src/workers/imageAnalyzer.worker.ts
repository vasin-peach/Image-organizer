import { analyzeImageData, downsampleImageData, SAMPLE_SIZE } from '../lib/analyze/imageAnalyzer';

interface WorkerRequest {
  id: string;
  bitmap: ImageBitmap;
}

interface WorkerResponse {
  id: string;
  metadata?: import('../types').ImageMetadata;
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, bitmap } = e.data;
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const full = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
    bitmap.close();

    const small = downsampleImageData(full.data, full.width, full.height, SAMPLE_SIZE);
    const metadata = await analyzeImageData(small);

    const response: WorkerResponse = { id, metadata };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = { id, error: String(err) };
    self.postMessage(response);
  }
};
