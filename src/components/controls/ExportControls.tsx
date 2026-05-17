import { useState } from 'react';
import { useConfigStore } from '../../store/config';
import { useImagesStore } from '../../store/images';
import { solveLayout } from '../../lib/constraints/coherentSize';
import type { ExportFormat } from '../../types';

interface ResolutionPreset {
  label: string;
  badge: string;
  targetWidth: number; // 0 = custom scale
}

const RESOLUTION_PRESETS: ResolutionPreset[] = [
  { label: 'Original',   badge: '1×',   targetWidth: 0 },
  { label: 'HD',         badge: '720p',  targetWidth: 1280  },
  { label: 'Full HD',    badge: '1080p', targetWidth: 1920  },
  { label: '2K',         badge: '2K',    targetWidth: 2560  },
  { label: '4K',         badge: '4K',    targetWidth: 3840  },
  { label: 'Custom',     badge: '…',     targetWidth: -1    },
];

interface Props {
  onExport: () => void;
}

export default function ExportControls({ onExport }: Props) {
  const { exportCfg, setExport, layout, presets, savePreset, loadPreset, deletePreset } = useConfigStore();
  const { images, orderedIds } = useImagesStore();
  const [presetName, setPresetName] = useState('');

  const formats: ExportFormat[] = ['png', 'jpeg', 'webp'];

  // Compute solved layout to get actual canvas dimensions
  const imageCount = orderedIds
    .map((id) => images.find((img) => img.id === id))
    .filter((img) => img?.included).length;
  const { layout: solved } = solveLayout(layout, Math.max(1, imageCount), layout.lockMode);
  const canvasW = solved.canvasW;
  const canvasH = solved.canvasH;

  // Determine effective scale and output size for each preset
  const effectiveScale = (preset: ResolutionPreset) => {
    if (preset.targetWidth === 0) return 1;
    if (preset.targetWidth === -1) return exportCfg.scale;
    return preset.targetWidth / canvasW;
  };
  const outW = (preset: ResolutionPreset) => Math.round(canvasW * effectiveScale(preset));
  const outH = (preset: ResolutionPreset) => Math.round(canvasH * effectiveScale(preset));

  const activePreset =
    exportCfg.targetWidth === 0
      ? RESOLUTION_PRESETS[0]
      : exportCfg.targetWidth === -1
      ? RESOLUTION_PRESETS[RESOLUTION_PRESETS.length - 1]
      : RESOLUTION_PRESETS.find((p) => p.targetWidth === exportCfg.targetWidth) ??
        RESOLUTION_PRESETS[RESOLUTION_PRESETS.length - 1];

  // Current output size
  const currentScale =
    exportCfg.targetWidth > 0
      ? exportCfg.targetWidth / canvasW
      : exportCfg.scale;
  const currentOutW = Math.round(canvasW * currentScale);
  const currentOutH = Math.round(canvasH * currentScale);

  return (
    <div className="space-y-3">
      {/* Format */}
      <Section label="Format">
        <div className="flex gap-1">
          {formats.map((f) => (
            <button
              key={f}
              onClick={() => setExport({ format: f })}
              className={`flex-1 text-xs py-1.5 rounded border uppercase transition-colors ${
                exportCfg.format === f
                  ? 'bg-indigo-700 border-indigo-500 text-white'
                  : 'border-white/10 text-white/50 hover:border-white/30'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {exportCfg.format !== 'png' && (
          <div className="mt-1.5">
            <label className="text-xs text-white/50 block mb-0.5">
              Quality: {Math.round(exportCfg.quality * 100)}%
            </label>
            <input
              type="range"
              min={0.5}
              max={1}
              step={0.01}
              value={exportCfg.quality}
              onChange={(e) => setExport({ quality: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        )}
      </Section>

      {/* Resolution */}
      <Section label="Export Resolution">
        <div className="flex flex-col gap-1">
          {RESOLUTION_PRESETS.map((preset) => {
            const isActive = activePreset.label === preset.label;
            const ow = outW(preset);
            const oh = outH(preset);
            const scale = effectiveScale(preset);
            return (
              <button
                key={preset.label}
                onClick={() =>
                  setExport({
                    targetWidth: preset.targetWidth === -1 ? -1 : preset.targetWidth,
                    scale: preset.targetWidth === 0 ? 1 : exportCfg.scale,
                  })
                }
                className={`flex items-center justify-between px-2.5 py-1.5 rounded border text-left transition-colors ${
                  isActive
                    ? 'bg-indigo-700/60 border-indigo-500 text-white'
                    : 'border-white/10 text-white/55 hover:border-white/25 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold w-9 text-center rounded px-1 py-0.5 ${
                    isActive ? 'bg-indigo-500 text-white' : 'bg-white/10 text-white/50'
                  }`}>
                    {preset.badge}
                  </span>
                  <span className="text-xs font-medium">{preset.label}</span>
                </div>
                {preset.targetWidth !== -1 && (
                  <span className="text-[10px] text-white/35 font-mono">
                    {ow.toLocaleString()}×{oh.toLocaleString()}
                    {preset.targetWidth === 0 ? '' : ` (${scale.toFixed(2)}×)`}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Custom scale slider */}
        {exportCfg.targetWidth === -1 && (
          <div className="mt-1 space-y-1 border border-white/10 rounded p-2">
            <div className="flex justify-between text-xs text-white/50">
              <span>Scale</span>
              <span className="font-mono">
                {exportCfg.scale.toFixed(2)}× → {Math.round(canvasW * exportCfg.scale).toLocaleString()}×{Math.round(canvasH * exportCfg.scale).toLocaleString()} px
              </span>
            </div>
            <input
              type="range"
              min={0.25}
              max={8}
              step={0.25}
              value={exportCfg.scale}
              onChange={(e) => setExport({ scale: parseFloat(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>
        )}

        {/* Output summary */}
        <div className="flex items-center justify-between text-[10px] text-white/40 bg-white/5 rounded px-2 py-1.5">
          <span>Output size</span>
          <span className="font-mono text-white/60">
            {currentOutW.toLocaleString()} × {currentOutH.toLocaleString()} px
          </span>
        </div>
      </Section>

      {/* Filename */}
      <Section label="Filename">
        <input
          type="text"
          value={exportCfg.filename}
          onChange={(e) => setExport({ filename: e.target.value })}
          placeholder="collage"
          className="w-full bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
        />
        <p className="text-xs text-white/30">
          → {exportCfg.filename}.{exportCfg.format}
        </p>
      </Section>

      {/* Export button */}
      <button
        onClick={onExport}
        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded transition-colors"
      >
        Export Image
      </button>

      {/* Presets */}
      <Section label="Presets">
        <div className="flex gap-1">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Preset name…"
            className="flex-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-indigo-500"
          />
          <button
            onClick={() => { if (presetName.trim()) { savePreset(presetName.trim()); setPresetName(''); } }}
            disabled={!presetName.trim()}
            className="text-xs bg-white/10 hover:bg-white/20 text-white px-2 py-1 rounded disabled:opacity-30 transition-colors"
          >
            Save
          </button>
        </div>

        {presets.length > 0 && (
          <div className="space-y-1 mt-1">
            {presets.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <button
                  onClick={() => loadPreset(p.id)}
                  className="flex-1 text-left text-xs text-white/60 hover:text-white px-2 py-1 bg-white/5 hover:bg-white/10 rounded transition-colors truncate"
                >
                  {p.name}
                </button>
                <button
                  onClick={() => deletePreset(p.id)}
                  className="text-xs text-white/30 hover:text-red-400 px-1.5 py-1 rounded transition-colors"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}
