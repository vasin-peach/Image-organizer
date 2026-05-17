import { useConfigStore } from '../../store/config';

export default function StyleControls() {
  const { style, setStyle } = useConfigStore();

  return (
    <div className="space-y-3">
      <Section label="Background">
        <ColorField
          label="Color"
          value={style.bgColor}
          onChange={(v) => setStyle({ bgColor: v })}
        />
      </Section>

      <Section label="Cell Style">
        <SliderField
          label={`Border Radius: ${style.borderRadius}px`}
          value={style.borderRadius}
          min={0}
          max={60}
          step={1}
          onChange={(v) => setStyle({ borderRadius: v })}
        />
      </Section>

      <Section label="Border">
        <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer">
          <input
            type="checkbox"
            checked={style.showBorder}
            onChange={(e) => setStyle({ showBorder: e.target.checked })}
            className="accent-indigo-500"
          />
          Show border
        </label>
        {style.showBorder && (
          <>
            <ColorField
              label="Border Color"
              value={style.borderColor}
              onChange={(v) => setStyle({ borderColor: v })}
            />
            <SliderField
              label={`Border Width: ${style.borderWidth}px`}
              value={style.borderWidth}
              min={1}
              max={10}
              step={1}
              onChange={(v) => setStyle({ borderWidth: v })}
            />
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">{label}</p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-white/55">{label}</label>
      <div className="flex items-center gap-2">
        <span className="text-xs text-white/40">{value}</span>
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-6 rounded cursor-pointer border border-white/10 bg-transparent"
        />
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-white/50 mb-0.5">
        <span>{label}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-indigo-500"
      />
    </div>
  );
}
