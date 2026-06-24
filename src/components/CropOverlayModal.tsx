import { useEffect, useRef } from 'react';
import { useImagesStore } from '../store/images';
import { beginHistoryGesture, endHistoryGesture } from '../store/history';
import type { FitMode, CropOverride } from '../types';

interface Props {
  imageId: string;
  onClose: () => void;
}

const FIT_MODES: { label: string; value: FitMode; desc: string }[] = [
  { label: 'Smart Crop', value: 'smart',  desc: 'crop ตามจุด subject' },
  { label: 'Center Crop', value: 'center', desc: 'crop กลางภาพ' },
  { label: 'Fit + Padding', value: 'fit',  desc: 'แสดงทั้งภาพ + padding' },
];

// ─── Canvas Crop Preview ──────────────────────────────────────────────────────
const PREVIEW_W = 272;
const PREVIEW_H = 180;

function drawCropPreview(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  override: CropOverride
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const sw = PREVIEW_W;
  const sh = PREVIEW_H;
  const imgW = img.naturalWidth;
  const imgH = img.naturalHeight;

  ctx.clearRect(0, 0, sw, sh);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, sw, sh);

  if (override.mode === 'fit') {
    // Letterbox
    const fitScale = Math.min(sw / imgW, sh / imgH);
    const drawW = imgW * fitScale;
    const drawH = imgH * fitScale;
    ctx.drawImage(img, (sw - drawW) / 2, (sh - drawH) / 2, drawW, drawH);
  } else {
    // Cover crop (same formula as renderer.ts)
    const { zoom, offsetX, offsetY } = override;
    const coverScale = Math.max(sw / imgW, sh / imgH) * zoom;
    const coverW = imgW * coverScale;
    const coverH = imgH * coverScale;

    let cx = (sw - coverW) / 2 + offsetX * (coverW - sw);
    let cy = (sh - coverH) / 2 + offsetY * (coverH - sh);

    cx = Math.min(0, Math.max(sw - coverW, cx));
    cy = Math.min(0, Math.max(sh - coverH, cy));

    ctx.drawImage(img, cx, cy, coverW, coverH);
  }

  // Grid overlay (rule-of-thirds)
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 0.5;
  for (const f of [1/3, 2/3]) {
    ctx.beginPath(); ctx.moveTo(sw * f, 0); ctx.lineTo(sw * f, sh); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, sh * f); ctx.lineTo(sw, sh * f); ctx.stroke();
  }
}

function CropPreviewCanvas({
  imgUrl,
  override,
}: {
  imgUrl: string;
  override: CropOverride;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const el = new Image();
    el.onload = () => {
      imgRef.current = el;
      if (canvasRef.current) drawCropPreview(canvasRef.current, el, override);
    };
    el.src = imgUrl;
  }, [imgUrl]);

  // Redraw when override changes
  useEffect(() => {
    if (canvasRef.current && imgRef.current) {
      drawCropPreview(canvasRef.current, imgRef.current, override);
    }
  }, [override]);

  return (
    <canvas
      ref={canvasRef}
      width={PREVIEW_W}
      height={PREVIEW_H}
      className="w-full rounded"
      style={{ display: 'block', background: '#000' }}
    />
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
export default function CropOverlayModal({ imageId, onClose }: Props) {
  const { images, setCropOverride } = useImagesStore();
  const img = images.find((i) => i.id === imageId);

  useEffect(() => {
    beginHistoryGesture();
    return () => endHistoryGesture();
  }, [imageId]);

  if (!img) return null;

  const { mode, offsetX, offsetY, zoom } = img.cropOverride;
  const reset = () => setCropOverride(imageId, { mode: 'smart', offsetX: 0, offsetY: 0, zoom: 1 });

  return (
    <div
      className="absolute inset-0 bg-black/70 flex items-center justify-center z-20"
      onClick={onClose}
    >
      <div
        className="bg-[#1a1d27] rounded-xl p-4 w-80 shadow-2xl border border-white/10 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-white">Crop Override</span>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">×</button>
        </div>

        {/* Live canvas preview */}
        <div className="rounded overflow-hidden border border-white/10">
          <CropPreviewCanvas imgUrl={img.url} override={img.cropOverride} />
        </div>

        {/* Fit mode */}
        <div>
          <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1 block">Fit Mode</label>
          <div className="flex gap-1">
            {FIT_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setCropOverride(imageId, { mode: m.value })}
                title={m.desc}
                className={`flex-1 text-xs py-1.5 rounded border transition-colors ${
                  mode === m.value
                    ? 'bg-indigo-600 border-indigo-500 text-white'
                    : 'border-white/10 text-white/50 hover:border-white/30'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders — only for crop modes */}
        {mode !== 'fit' && (
          <div className="space-y-2">
            <SliderField
              label="Offset X"
              valueLabel={`${offsetX > 0 ? '+' : ''}${(offsetX * 100).toFixed(0)}%`}
              value={offsetX}
              min={-0.5} max={0.5} step={0.01}
              onChange={(v) => setCropOverride(imageId, { offsetX: v })}
            />
            <SliderField
              label="Offset Y"
              valueLabel={`${offsetY > 0 ? '+' : ''}${(offsetY * 100).toFixed(0)}%`}
              value={offsetY}
              min={-0.5} max={0.5} step={0.01}
              onChange={(v) => setCropOverride(imageId, { offsetY: v })}
            />
            <SliderField
              label="Zoom"
              valueLabel={`${zoom.toFixed(2)}×`}
              value={zoom}
              min={1} max={2} step={0.01}
              onChange={(v) => setCropOverride(imageId, { zoom: v })}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-2 pt-1">
          <button
            onClick={reset}
            className="flex-1 text-xs py-1.5 rounded border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
          >
            Reset
          </button>
          <button
            onClick={onClose}
            className="flex-1 text-xs py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function SliderField({
  label,
  valueLabel,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  valueLabel: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[10px] text-white/50 mb-0.5">
        <span>{label}</span>
        <span className="font-mono">{valueLabel}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}
