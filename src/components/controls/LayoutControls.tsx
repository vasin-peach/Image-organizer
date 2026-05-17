import { useState, useEffect, type ReactElement } from 'react';
import { useConfigStore } from '../../store/config';
import { useImagesStore } from '../../store/images';
import { solveLayout } from '../../lib/constraints/coherentSize';
import type { LayoutMode, LockMode } from '../../types';

// ─── Aspect presets ───────────────────────────────────────────────────────────
const ASPECT_PRESETS = [
  { label: '1:1',  w: 1,   h: 1   },
  { label: '4:3',  w: 4,   h: 3   },
  { label: '3:2',  w: 3,   h: 2   },
  { label: '16:9', w: 16,  h: 9   },
  { label: '9:16', w: 9,   h: 16  },
  { label: '2:3',  w: 2,   h: 3   },
  { label: '3:4',  w: 3,   h: 4   },
  { label: 'A4',   w: 210, h: 297 },
  { label: 'A4 L', w: 297, h: 210 },
];

// ─── Icons ────────────────────────────────────────────────────────────────────
function IconGridUniform() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      {[0,1,2].flatMap(c => [0,1].map(r => (
        <rect key={`${c}${r}`} x={2+c*12} y={2+r*13} width={10} height={11} rx={1.5}
          fill="currentColor" opacity={0.5} />
      )))}
    </svg>
  );
}
function IconGridAspect() {
  const cells: [number,number,number][] = [
    [2,2,7],[11,2,14],[27,2,8],
    [2,16,13],[17,16,7],[26,16,9],
  ];
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      {cells.map(([x,y,w],i) => (
        <rect key={i} x={x} y={y} width={w} height={10} rx={1.5} fill="currentColor" opacity={0.5} />
      ))}
    </svg>
  );
}
function IconMosaic() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x={2}  y={2}  width={14} height={13} rx={1.5} fill="currentColor" opacity={0.5}/>
      <rect x={2}  y={17} width={14} height={9}  rx={1.5} fill="currentColor" opacity={0.5}/>
      <rect x={18} y={2}  width={14} height={8}  rx={1.5} fill="currentColor" opacity={0.5}/>
      <rect x={18} y={12} width={14} height={14} rx={1.5} fill="currentColor" opacity={0.5}/>
    </svg>
  );
}
function IconLockCanvas() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x={1} y={1} width={34} height={26} rx={2} stroke="currentColor" strokeWidth={1.8} opacity={0.85}/>
      {[0,1,2].flatMap(c=>[0,1].map(r=>(
        <rect key={`${c}${r}`} x={4+c*10} y={4+r*10} width={8} height={8} rx={1}
          fill="currentColor" opacity={0.22}/>
      )))}
    </svg>
  );
}
function IconLockCell() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x={1} y={1} width={34} height={26} rx={2} stroke="currentColor" strokeWidth={1} opacity={0.2}/>
      <rect x={4} y={4} width={12} height={10} rx={1.5} fill="currentColor" opacity={0.85}/>
      {[[18,4],[4,16],[18,16]].map(([x,y])=>(
        <rect key={`${x}${y}`} x={x} y={y} width={12} height={10} rx={1.5} fill="currentColor" opacity={0.2}/>
      ))}
    </svg>
  );
}
function IconLockAspect() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x={1} y={1} width={34} height={26} rx={2} stroke="currentColor" strokeWidth={1} opacity={0.2}/>
      <rect x={3} y={4} width={16} height={11} rx={1.5} fill="currentColor" opacity={0.45}/>
      <line x1={3} y1={18} x2={19} y2={18} stroke="currentColor" strokeWidth={1.2} opacity={0.7}/>
      <line x1={22} y1={4} x2={22} y2={15} stroke="currentColor" strokeWidth={1.2} opacity={0.7}/>
      <text x={9} y={25} fontSize="6" fill="currentColor" opacity={0.7} fontFamily="monospace">W:H</text>
    </svg>
  );
}
function IconAutoCols() {
  return (
    <svg width="36" height="28" viewBox="0 0 36 28" fill="none">
      <rect x={1} y={1} width={34} height={26} rx={2} stroke="currentColor" strokeWidth={1} opacity={0.25}/>
      {[0,1,2,3].map(c=>(
        <rect key={c} x={3+c*8} y={4} width={6} height={20} rx={1} fill="currentColor" opacity={0.3+c*0.08}/>
      ))}
      <path d="M4 14h28M28 11l4 3-4 3" stroke="currentColor" strokeWidth={0.8} opacity={0.5}/>
    </svg>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const LAYOUT_MODES: { value: LayoutMode; label: string; desc: string; detail: string; Icon: ()=>ReactElement }[] = [
  { value:'grid-uniform', label:'Grid Uniform', desc:'ทุกช่องขนาดเท่ากัน',
    detail:'Crop ภาพให้พอดีกับ cell เดียวกันทุกช่อง เหมาะกับ Instagram grid', Icon:IconGridUniform },
  { value:'grid-aspect',  label:'Grid Aspect',  desc:'กว้างตามสัดส่วนต้นฉบับ ทุกแถวสูงเท่ากัน',
    detail:'รักษา aspect ratio ต้นฉบับ ความกว้างของแต่ละช่องปรับตามภาพ', Icon:IconGridAspect },
  { value:'mosaic',       label:'Mosaic',        desc:'จัดแบบ Pinterest / Masonry',
    detail:'วางในคอลัมน์ที่สั้นที่สุดก่อน ความสูงของแต่ละภาพตาม aspect ratio', Icon:IconMosaic },
];

const LOCK_MODES: { value: LockMode; label: string; desc: string; detail: string; Icon: ()=>ReactElement }[] = [
  { value:'canvas',   label:'Lock Canvas', desc:'ล็อกขนาด output คงที่',
    detail:'ระบุขนาด canvas แล้วระบบหา cell size ให้พอดี', Icon:IconLockCanvas },
  { value:'cell',     label:'Lock Cell',   desc:'ล็อกขนาด cell คงที่',
    detail:'ระบุขนาด cell แล้วระบบคำนวณขนาด canvas ให้อัตโนมัติ', Icon:IconLockCell },
  { value:'aspect',   label:'Lock Aspect', desc:'ล็อก aspect ratio ของ cell',
    detail:'ระบุ W:H ratio ของ cell แล้วระบบคำนวณ cell size ให้ fit canvas', Icon:IconLockAspect },
  { value:'auto-cols',label:'Auto Cols',   desc:'คำนวณจำนวนคอลัมน์อัตโนมัติ',
    detail:'ระบุ canvas + cell height แล้วระบบหาจำนวนคอลัมน์ที่เหมาะสม', Icon:IconAutoCols },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function gcd(a: number, b: number): number { return b===0?a:gcd(b,a%b); }
function toSimpleRatio(w: number, h: number): [number,number] {
  if(w<=0||h<=0) return [1,1];
  const d=gcd(Math.round(w),Math.round(h));
  return [Math.round(w)/d, Math.round(h)/d];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function Divider() {
  return <div className="border-t border-white/[0.06] my-1" />;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-white/35 uppercase tracking-widest mb-2">
      {children}
    </p>
  );
}

/** Editable number row */
function Row({
  label, value, min, max, step=1, onChange, disabled=false, unit,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v:number)=>void; disabled?: boolean; unit?: string;
}) {
  return (
    <div className="flex items-center justify-between h-7">
      <span className={`text-xs ${disabled?'text-white/25':'text-white/55'}`}>{label}</span>
      <div className="flex items-center gap-1">
        {disabled ? (
          <span className="text-xs font-mono text-white/30 w-16 text-right">{Math.round(value)}</span>
        ) : (
          <input
            type="number" value={Math.round(value*100)/100} min={min} max={max} step={step}
            onChange={e=>onChange(parseFloat(e.target.value)||0)}
            className="w-16 bg-[#1a1c26] border border-white/10 rounded-md px-2 py-0.5 text-xs text-right text-white outline-none focus:border-indigo-500/80 transition-colors"
          />
        )}
        {unit && <span className="text-[10px] text-white/25 w-5">{unit}</span>}
      </div>
    </div>
  );
}

/** Inline toggle switch */
function Toggle({ label, value, onChange }: { label:string; value:boolean; onChange:(v:boolean)=>void }) {
  return (
    <div className="flex items-center justify-between h-7">
      <span className="text-xs text-white/55">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors duration-200 focus:outline-none ${value ? 'bg-indigo-600' : 'bg-white/15'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-4' : 'translate-x-0'}`}
        />
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LayoutControls() {
  const { layout, setLayout } = useConfigStore();
  const { images, orderedIds } = useImagesStore();
  const imageCount = orderedIds
    .map(id=>images.find(img=>img.id===id))
    .filter(img=>img?.included).length;

  const [canvasSizeMode, setCanvasSizeMode] = useState<'ratio'|'px'>('ratio');
  const [ratioW, setRatioW] = useState(()=>toSimpleRatio(layout.canvasW,layout.canvasH)[0]);
  const [ratioH, setRatioH] = useState(()=>toSimpleRatio(layout.canvasW,layout.canvasH)[1]);

  const applyRatio=(rw:number,rh:number,canvasW:number)=>{
    if(rw<=0||rh<=0) return;
    solve({canvasW, canvasH:Math.round(canvasW*(rh/rw))});
  };

  useEffect(()=>{
    const [rw,rh]=toSimpleRatio(layout.canvasW,layout.canvasH);
    setRatioW(rw); setRatioH(rh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const solve=(patch:Partial<typeof layout>)=>{
    const merged={...layout,...patch};
    const {layout:solved}=solveLayout(merged,Math.max(1,imageCount),merged.lockMode);
    setLayout(solved);
  };

  const {layout:solved, valid, warnings}=solveLayout(layout,Math.max(1,imageCount),layout.lockMode);

  return (
    <div className="space-y-4 text-white">

      {/* ── Layout Mode ─────────────────────────────────── */}
      <div>
        <SectionLabel>Layout Mode</SectionLabel>
        <div className="flex flex-col gap-1">
          {LAYOUT_MODES.map(m=>{
            const active=layout.mode===m.value;
            return (
              <button key={m.value} onClick={()=>solve({mode:m.value})}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border text-left transition-all ${
                  active?'bg-indigo-600/20 border-indigo-500/60':'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <span className={`flex-shrink-0 ${active?'text-indigo-400':'text-white/25'}`}><m.Icon/></span>
                <span className="flex flex-col min-w-0">
                  <span className={`text-xs font-medium ${active?'text-white':'text-white/60'}`}>{m.label}</span>
                  <span className={`text-[10px] leading-snug mt-0.5 ${active?'text-indigo-300/70':'text-white/30'}`}>{m.desc}</span>
                  {active&&<span className="text-[10px] text-indigo-300/50 mt-1 leading-snug">{m.detail}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <Divider/>

      {/* ── Constraint Mode ──────────────────────────────── */}
      <div>
        <SectionLabel>Constraint Mode</SectionLabel>
        <div className="flex flex-col gap-1">
          {LOCK_MODES.map(lm=>{
            const active=layout.lockMode===lm.value;
            return (
              <button key={lm.value} onClick={()=>solve({lockMode:lm.value})}
                className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border text-left transition-all ${
                  active?'bg-indigo-600/20 border-indigo-500/60':'border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]'
                }`}
              >
                <span className={`flex-shrink-0 ${active?'text-indigo-400':'text-white/25'}`}><lm.Icon/></span>
                <span className="flex flex-col min-w-0">
                  <span className={`text-xs font-medium ${active?'text-white':'text-white/60'}`}>{lm.label}</span>
                  <span className={`text-[10px] leading-snug mt-0.5 ${active?'text-indigo-300/70':'text-white/30'}`}>{lm.desc}</span>
                  {active&&<span className="text-[10px] text-indigo-300/50 mt-1 leading-snug">{lm.detail}</span>}
                </span>
              </button>
            );
          })}
        </div>

        {/* Constraint status — only when invalid */}
        {!valid && (
          <div className="mt-2 flex items-center gap-2 text-[10px] text-amber-400 bg-amber-900/20 border border-amber-500/20 rounded-lg px-2.5 py-1.5">
            <span className="flex-1">⚠ {warnings[0] ?? 'Constraint conflict'}</span>
            <button onClick={()=>setLayout(solved)} className="underline whitespace-nowrap">Auto-fix</button>
          </div>
        )}
      </div>

      <Divider/>

      {/* ── Grid ─────────────────────────────────────────── */}
      <div>
        <SectionLabel>Grid</SectionLabel>
        <div className="space-y-0.5">
          <Toggle label="Manual Rows" value={layout.rowsManual} onChange={v=>solve({rowsManual:v})}/>
          {layout.rowsManual ? (
            <>
              <Row label="Rows"             value={layout.rows}   min={1} max={200} onChange={v=>solve({rows:v,rowsManual:true})}/>
              <Row label="Columns"          value={solved.cols}   min={1} max={200} onChange={()=>{}} disabled/>
            </>
          ) : (
            <>
              <Row label="Columns"          value={layout.cols}   min={1} max={50}  onChange={v=>solve({cols:v})}/>
              <Row label="Rows"             value={solved.rows}   min={1} max={200} onChange={()=>{}} disabled/>
            </>
          )}
        </div>
      </div>

      <Divider/>

      {/* ── Cell Size ────────────────────────────────────── */}
      <div>
        <SectionLabel>Cell Size</SectionLabel>
        <div className="space-y-0.5">
          <Row label="Width"  value={layout.cellW} min={10} max={4000} unit="px"
            disabled={layout.lockMode==='canvas'||layout.lockMode==='aspect'}
            onChange={v=>solve({cellW:v})}/>
          <Row label="Height" value={layout.cellH} min={10} max={4000} unit="px"
            disabled={layout.lockMode==='canvas'}
            onChange={v=>solve({cellH:v})}/>
          {layout.lockMode==='aspect'&&(
            <Row label="Aspect W/H" value={layout.cellAspect} min={0.1} max={10} step={0.01}
              onChange={v=>solve({cellAspect:v})}/>
          )}
        </div>
      </div>

      <Divider/>

      {/* ── Canvas Size ───────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <SectionLabel>Canvas Size</SectionLabel>
          {/* px / ratio pill toggle */}
          <div className="flex bg-white/[0.06] rounded-md p-0.5 gap-0.5 -mt-1">
            {(['px','ratio'] as const).map(m=>(
              <button key={m} onClick={()=>setCanvasSizeMode(m)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  canvasSizeMode===m?'bg-indigo-600 text-white':'text-white/40 hover:text-white/70'
                }`}
              >{m}</button>
            ))}
          </div>
        </div>

        {canvasSizeMode==='px' ? (
          <div className="space-y-0.5">
            <Row label="Width"  value={solved.canvasW} min={100} max={20000} unit="px"
              disabled={layout.lockMode==='cell'}
              onChange={v=>{solve({canvasW:v});const[rw,rh]=toSimpleRatio(v,solved.canvasH);setRatioW(rw);setRatioH(rh);}}/>
            <Row label="Height" value={solved.canvasH} min={100} max={20000} unit="px"
              disabled={layout.lockMode==='cell'||layout.lockMode==='aspect'}
              onChange={v=>{solve({canvasH:v});const[rw,rh]=toSimpleRatio(solved.canvasW,v);setRatioW(rw);setRatioH(rh);}}/>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Preset chips */}
            <div className="flex flex-wrap gap-1">
              {ASPECT_PRESETS.map(p=>{
                const active=ratioW===p.w&&ratioH===p.h;
                return (
                  <button key={p.label}
                    onClick={()=>{setRatioW(p.w);setRatioH(p.h);applyRatio(p.w,p.h,solved.canvasW);}}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      active?'bg-indigo-600 border-indigo-500 text-white':'border-white/10 text-white/45 hover:border-white/25 hover:text-white/70'
                    }`}
                  >{p.label}</button>
                );
              })}
            </div>

            {/* Custom W:H */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/45 w-8">W:H</span>
              <input type="number" min={1} max={999} value={ratioW}
                onChange={e=>{const v=Math.max(1,parseInt(e.target.value)||1);setRatioW(v);applyRatio(v,ratioH,solved.canvasW);}}
                className="w-14 bg-[#1a1c26] border border-white/10 rounded-md px-2 py-0.5 text-xs text-center text-white outline-none focus:border-indigo-500/80"
              />
              <span className="text-white/30 text-sm font-light">:</span>
              <input type="number" min={1} max={999} value={ratioH}
                onChange={e=>{const v=Math.max(1,parseInt(e.target.value)||1);setRatioH(v);applyRatio(ratioW,v,solved.canvasW);}}
                className="w-14 bg-[#1a1c26] border border-white/10 rounded-md px-2 py-0.5 text-xs text-center text-white outline-none focus:border-indigo-500/80"
              />
            </div>

            {/* Width input + computed height */}
            <div className="space-y-0.5">
              <Row label="Width" value={solved.canvasW} min={100} max={20000} unit="px"
                disabled={layout.lockMode==='cell'}
                onChange={v=>applyRatio(ratioW,ratioH,v)}/>
              <div className="flex items-center justify-between h-7">
                <span className="text-xs text-white/25">Height</span>
                <span className="text-xs font-mono text-white/30">{solved.canvasH} px</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <Divider/>

      {/* ── Spacing ───────────────────────────────────────── */}
      <div>
        <SectionLabel>Spacing</SectionLabel>
        <div className="space-y-0.5">
          <Row label="Gap"          value={layout.gap}      min={0} max={100} unit="px" onChange={v=>solve({gap:v})}/>
          <Row label="Outer Padding" value={layout.outerPad} min={0} max={200} unit="px" onChange={v=>solve({outerPad:v})}/>
        </div>
      </div>

      {/* ── Summary ───────────────────────────────────────── */}
      <div className="flex items-center justify-between text-[10px] text-white/25 bg-white/[0.03] rounded-lg px-3 py-2">
        <span>{imageCount} images</span>
        <span className="font-mono">{solved.canvasW} × {solved.canvasH} px</span>
      </div>
    </div>
  );
}
