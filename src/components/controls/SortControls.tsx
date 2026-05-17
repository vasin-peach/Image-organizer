import type { ReactElement } from 'react';
import { useConfigStore } from '../../store/config';
import { useImagesStore } from '../../store/images';
import { sortImages } from '../../lib/sort/sorters';
import { includedImages } from '../../store/images';
import type { SortMode, SortWeights } from '../../types';

// ─── SVG Icons ────────────────────────────────────────────────────────────────

function IconNone() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      {[0,1,2,3,4].map((i) => (
        <rect key={i} x={2 + i * 5} y={5} width={3} height={12} rx={1} fill="currentColor" opacity={0.35 + i * 0.08} />
      ))}
    </svg>
  );
}


function IconHueWheel() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <circle cx={14} cy={11} r={8} stroke="currentColor" strokeWidth={1} opacity={0.2} />
      {[
        ['#e74c3c', 0],['#e67e22', 42],['#f1c40f', 84],
        ['#2ecc71', 126],['#3498db', 168],['#9b59b6', 210],
        ['#e74c3c', 252],['#e67e22', 294],['#f1c40f', 336],
      ].map(([color, deg], i) => {
        const rad = (Number(deg) * Math.PI) / 180;
        return (
          <circle key={i} cx={14 + 6 * Math.cos(rad)} cy={11 + 6 * Math.sin(rad)} r={1.8} fill={String(color)} opacity={0.9} />
        );
      })}
      <path d="M14 3 L14 6" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.6} />
    </svg>
  );
}

function IconBrightness() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      {[0,1,2,3,4].map((i) => (
        <rect key={i} x={2 + i * 5} y={17 - i * 2.5} width={3} height={2 + i * 2.5} rx={1}
          fill="currentColor" opacity={0.2 + i * 0.16} />
      ))}
    </svg>
  );
}

function IconSaturation() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      {[0,1,2,3,4].map((i) => (
        <rect key={i} x={2 + i * 5} y={5} width={3} height={12} rx={1}
          fill={`hsl(210,${20 + i * 20}%,50%)`} opacity={0.9} />
      ))}
    </svg>
  );
}

function IconTemperature() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <rect x={1} y={8} width={11} height={6} rx={1} fill="#3498db" opacity={0.7} />
      <rect x={16} y={8} width={11} height={6} rx={1} fill="#e74c3c" opacity={0.7} />
      <path d="M13 11 L15 11 M12 9 L16 13 M12 13 L16 9" stroke="currentColor" strokeWidth={1} opacity={0.5} />
    </svg>
  );
}

function IconThirds() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <rect x={1} y={1} width={26} height={20} rx={1} stroke="currentColor" strokeWidth={1} opacity={0.25} />
      <line x1={10} y1={1} x2={10} y2={21} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1" opacity={0.3} />
      <line x1={18} y1={1} x2={18} y2={21} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1" opacity={0.3} />
      <line x1={1} y1={8} x2={27} y2={8} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1" opacity={0.3} />
      <line x1={1} y1={14} x2={27} y2={14} stroke="currentColor" strokeWidth={0.8} strokeDasharray="2 1" opacity={0.3} />
      <circle cx={10} cy={8} r={2} fill="currentColor" opacity={0.8} />
    </svg>
  );
}

function IconComplexity() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <rect x={1} y={5} width={10} height={12} rx={1} fill="currentColor" opacity={0.1} />
      <rect x={14} y={5} width={13} height={12} rx={1} fill="currentColor" opacity={0.1} />
      {/* simple side */}
      <line x1={3} y1={11} x2={9} y2={11} stroke="currentColor" strokeWidth={1.5} opacity={0.4} />
      {/* complex side - zigzag */}
      {[[14,8],[16,14],[18,7],[20,14],[22,8],[24,14],[26,9]].reduce<[number,number][]>((a,p) => [...a, p as [number,number]], []).map(([x,y], i, arr) => i === 0 ? null : (
        <line key={i} x1={arr[i-1][0]} y1={arr[i-1][1]} x2={x} y2={y} stroke="currentColor" strokeWidth={1} opacity={0.55} />
      ))}
    </svg>
  );
}

function IconSymmetry() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <line x1={14} y1={2} x2={14} y2={20} stroke="currentColor" strokeWidth={1} strokeDasharray="2 1" opacity={0.4} />
      <path d="M3 6 Q7 11 3 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.6} />
      <path d="M25 6 Q21 11 25 16" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" fill="none" opacity={0.6} />
    </svg>
  );
}

function IconSubjectPos() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <rect x={1} y={1} width={26} height={20} rx={1} stroke="currentColor" strokeWidth={1} opacity={0.2} />
      <circle cx={8} cy={11} r={3.5} fill="currentColor" opacity={0.25} stroke="currentColor" strokeWidth={1} />
      <circle cx={20} cy={11} r={3.5} fill="currentColor" opacity={0.7} stroke="currentColor" strokeWidth={1} />
      <path d="M12 11 L16 11" stroke="currentColor" strokeWidth={1} opacity={0.4} markerEnd="url(#arr)" />
    </svg>
  );
}

function IconSimilarity() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      {[
        { cx: 4, cy: 11, fill: '#3498db' },
        { cx: 10, cy: 8,  fill: '#2980b9' },
        { cx: 16, cy: 10, fill: '#8e44ad' },
        { cx: 22, cy: 7,  fill: '#e74c3c' },
        { cx: 26, cy: 13, fill: '#e67e22' },
      ].map((d, i, arr) => (
        <>
          {i < arr.length - 1 && (
            <line key={`l${i}`} x1={d.cx} y1={d.cy} x2={arr[i+1].cx} y2={arr[i+1].cy}
              stroke="currentColor" strokeWidth={0.8} opacity={0.3} strokeDasharray="2 1.5" />
          )}
          <circle key={`c${i}`} cx={d.cx} cy={d.cy} r={2.5} fill={d.fill} opacity={0.85} />
        </>
      ))}
    </svg>
  );
}

function IconTwoAxis() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      <line x1={3} y1={19} x2={3} y2={3} stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <line x1={3} y1={19} x2={26} y2={19} stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <text x={4} y={21} fontSize="5" fill="currentColor" opacity={0.4}>hue</text>
      <text x={1} y={7} fontSize="4.5" fill="currentColor" opacity={0.4} transform="rotate(-90,3,11)">bright</text>
      {[
        { x: 6, y: 15, c: '#3498db' },
        { x: 11, y: 13, c: '#2ecc71' },
        { x: 16, y: 9, c: '#f1c40f' },
        { x: 21, y: 6, c: '#e74c3c' },
      ].map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={2} fill={d.c} opacity={0.85} />
      ))}
    </svg>
  );
}

function IconMultiCriteria() {
  return (
    <svg width="28" height="22" viewBox="0 0 28 22" fill="none">
      {[
        { y: 5,  w: 18, label: 'hue',   op: 0.9 },
        { y: 10, w: 10, label: 'bright', op: 0.6 },
        { y: 15, w: 6,  label: 'edge',  op: 0.4 },
      ].map((d) => (
        <>
          <rect key={`bg-${d.y}`} x={2} y={d.y} width={22} height={3} rx={1} fill="currentColor" opacity={0.1} />
          <rect key={`fg-${d.y}`} x={2} y={d.y} width={d.w} height={3} rx={1} fill="currentColor" opacity={d.op} />
        </>
      ))}
    </svg>
  );
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

interface SortModeEntry {
  value: SortMode;
  label: string;
  desc: string;
  group: string;
  Icon: () => ReactElement;
}

const SORT_MODES: SortModeEntry[] = [
  {
    value: 'none', label: 'Original Order',
    desc: 'ลำดับเดิมตามที่อัปโหลด · ลากภาพ preview เพื่อสลับลำดับ',
    group: 'Basic', Icon: IconNone,
  },
  {
    value: 'hueWheel', label: 'Hue Wheel',
    desc: 'เรียงตามวงล้อสี แดง→ส้ม→เหลือง→เขียว→น้ำเงิน→ม่วง',
    group: 'Color', Icon: IconHueWheel,
  },
  {
    value: 'dominantColor', label: 'Dominant Color',
    desc: 'เรียงตามสีเด่นที่สุดของแต่ละภาพ',
    group: 'Color', Icon: IconHueWheel,
  },
  {
    value: 'brightness', label: 'Brightness',
    desc: 'เรียงจากมืดไปสว่าง หรือกลับกัน',
    group: 'Color', Icon: IconBrightness,
  },
  {
    value: 'saturation', label: 'Saturation',
    desc: 'เรียงจากสีซีดไปสีจัด',
    group: 'Color', Icon: IconSaturation,
  },
  {
    value: 'temperature', label: 'Warm ↔ Cool',
    desc: 'เรียงจากโทนเย็น (ฟ้า) ไปโทนอุ่น (แดง)',
    group: 'Color', Icon: IconTemperature,
  },
  {
    value: 'thirdsScore', label: 'Rule of Thirds',
    desc: 'ภาพที่ subject อยู่บนจุดตัด 1/3 ขึ้นก่อน',
    group: 'Composition', Icon: IconThirds,
  },
  {
    value: 'edgeDensity', label: 'Complexity',
    desc: 'เรียงจากภาพเรียบง่ายไปซับซ้อน (edge density)',
    group: 'Composition', Icon: IconComplexity,
  },
  {
    value: 'symmetry', label: 'Symmetry',
    desc: 'เรียงจากสมมาตรน้อยไปมาก',
    group: 'Composition', Icon: IconSymmetry,
  },
  {
    value: 'subjectPosition', label: 'Subject Position',
    desc: 'เรียงตามตำแหน่ง subject จากซ้ายไปขวา',
    group: 'Composition', Icon: IconSubjectPos,
  },
  {
    value: 'similarityChain', label: 'Similarity Chain',
    desc: 'จัดให้ภาพข้างเคียงคล้ายกันมากที่สุด (gradient ไหล)',
    group: 'Advanced', Icon: IconSimilarity,
  },
  {
    value: 'twoAxis', label: '2-Axis Grid',
    desc: 'จัดเป็น 2 มิติ เช่น แกน X = สี แกน Y = ความสว่าง',
    group: 'Advanced', Icon: IconTwoAxis,
  },
  {
    value: 'multiCriteria', label: 'Multi-Criteria',
    desc: 'ผสมหลายตัวชี้วัดพร้อมกัน ปรับน้ำหนักแต่ละตัวได้',
    group: 'Advanced', Icon: IconMultiCriteria,
  },
];

const WEIGHT_KEYS: (keyof SortWeights)[] = [
  'hue', 'brightness', 'saturation', 'temperature',
  'edgeDensity', 'symmetry', 'thirdsScore',
];

const WEIGHT_LABELS: Record<keyof SortWeights, string> = {
  hue: 'Hue (สี)',
  brightness: 'Brightness (ความสว่าง)',
  saturation: 'Saturation (ความอิ่มสี)',
  temperature: 'Temperature (อุ่น/เย็น)',
  edgeDensity: 'Complexity (ความซับซ้อน)',
  symmetry: 'Symmetry (สมมาตร)',
  thirdsScore: 'Rule of Thirds',
};

const AXIS_OPTIONS: (keyof SortWeights)[] = WEIGHT_KEYS;

export default function SortControls() {
  const { sort, setSort } = useConfigStore();
  const { images, orderedIds, setOrderedIds } = useImagesStore();

  const applySort = (mode: SortMode) => {
    setSort({ mode });
    const ordered = includedImages(images, orderedIds);
    const sorted = sortImages(ordered, { ...sort, mode });
    setOrderedIds(sorted.map((img) => img.id));
  };

  const groups = Array.from(new Set(SORT_MODES.map((m) => m.group)));

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group}>
          <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1.5">{group}</p>
          <div className="flex flex-col gap-1">
            {SORT_MODES.filter((m) => m.group === group).map((m) => {
              const active = sort.mode === m.value;
              return (
                <button
                  key={m.value}
                  onClick={() => applySort(m.value)}
                  className={`flex items-center gap-2.5 px-2 py-1.5 rounded border text-left transition-colors ${
                    active
                      ? 'bg-indigo-700/60 border-indigo-500 text-white'
                      : 'border-white/10 text-white/60 hover:border-white/25 hover:bg-white/5'
                  }`}
                >
                  {/* Icon */}
                  <span className={`flex-shrink-0 ${active ? 'text-indigo-300' : 'text-white/30'}`}>
                    <m.Icon />
                  </span>
                  {/* Text */}
                  <span className="flex flex-col min-w-0">
                    <span className="text-xs font-medium leading-tight">{m.label}</span>
                    <span className={`text-[10px] leading-snug mt-0.5 ${active ? 'text-indigo-200/70' : 'text-white/30'}`}>
                      {m.desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Reverse toggle */}
      <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sort.reversed}
          onChange={(e) => setSort({ reversed: e.target.checked })}
          className="accent-indigo-500"
        />
        Reverse order
      </label>

      {/* 2-Axis config */}
      {sort.mode === 'twoAxis' && (
        <div className="space-y-1.5 border border-white/10 rounded p-2">
          <p className="text-xs text-white/50 font-semibold mb-1">2-Axis Settings</p>
          {(['axisX', 'axisY'] as const).map((axis) => (
            <div key={axis} className="flex items-center gap-2">
              <label className="text-xs text-white/50 w-12">{axis === 'axisX' ? 'X axis' : 'Y axis'}</label>
              <select
                value={sort.twoAxis[axis]}
                onChange={(e) =>
                  setSort({ twoAxis: { ...sort.twoAxis, [axis]: e.target.value as keyof SortWeights } })
                }
                className="flex-1 bg-white/5 border border-white/10 text-white text-xs rounded px-1 py-0.5"
              >
                {AXIS_OPTIONS.map((k) => <option key={k} value={k}>{WEIGHT_LABELS[k]}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}

      {/* Multi-criteria weights */}
      {sort.mode === 'multiCriteria' && (
        <div className="border border-white/10 rounded p-2 space-y-2">
          <p className="text-xs text-white/50 font-semibold">Weight ของแต่ละตัวชี้วัด</p>
          {WEIGHT_KEYS.map((key) => (
            <div key={key} className="space-y-0.5">
              <div className="flex justify-between text-xs text-white/50">
                <span>{WEIGHT_LABELS[key]}</span>
                <span>{sort.weights[key].toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={sort.weights[key]}
                onChange={(e) =>
                  setSort({ weights: { ...sort.weights, [key]: parseFloat(e.target.value) } })
                }
                className="w-full accent-indigo-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
