import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';
import type { PipelineStage } from '../../types';

interface Props {
  stages: PipelineStage[];
  value: string | null;
  onChange: (stageId: string | null) => void;
  disabled?: boolean;
}

/**
 * Compact pipeline-stage picker: shows the current stage as a colored chip and
 * opens a menu to change or clear it. Stops click propagation so it can live
 * inside clickable conversation/recipient rows.
 */
export default function StagePicker({ stages, value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = stages.find(s => s._id === value) || null;

  // No stages configured yet → don't render a dead control.
  if (!stages.length) return null;

  return (
    <div className="relative" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border hover:bg-elevated disabled:opacity-50"
        style={current ? { color: current.color, borderColor: `${current.color}66` } : { borderColor: 'var(--line, #2a2a2a)' }}
        title="Pipeline stage"
      >
        {current ? (
          <>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: current.color }} />
            {current.name}
          </>
        ) : value ? (
          <span className="text-amber-500">Unknown stage</span>
        ) : (
          <span className="text-dim">Set stage</span>
        )}
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-card shadow-lg py-1">
          {stages.map(s => (
            <button
              key={s._id}
              type="button"
              onClick={() => { onChange(s._id); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-elevated"
            >
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
              <span className="flex-1 text-body">{s.name}</span>
              {value === s._id && <Check className="w-3.5 h-3.5 text-blue-500" />}
            </button>
          ))}
          {value && (
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left text-dim hover:bg-elevated border-t border-line mt-1"
            >
              <X className="w-3.5 h-3.5" /> Clear stage
            </button>
          )}
        </div>
      )}
    </div>
  );
}
