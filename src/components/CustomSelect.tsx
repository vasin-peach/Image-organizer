import { useState, useRef, useEffect } from 'react';

interface Option<T> {
  value: T;
  label: string;
}

interface Props<T> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
}

export default function CustomSelect<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const activeLabel = options.find((o) => o.value === value)?.label ?? String(value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-1 bg-[#1e2130] border border-white/10 rounded px-2 py-1 text-[10px] text-white/70 hover:border-white/25 transition-colors cursor-pointer"
      >
        <span className="truncate">{activeLabel}</span>
        <svg
          className={`w-2.5 h-2.5 text-white/40 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 10 6"
        >
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[#1e2130] border border-white/15 rounded shadow-xl overflow-hidden">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-2.5 py-1.5 text-[10px] transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
