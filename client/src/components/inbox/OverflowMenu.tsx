import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface OverflowAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  danger?: boolean;
}

/**
 * Kebab (•••) overflow menu: opens a right-aligned dropdown of actions and
 * closes on outside click or after any action fires. Stops click propagation
 * so it can live inside clickable conversation rows / thread headers.
 */
export default function OverflowMenu({ actions }: { actions: OverflowAction[] }) {
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

  if (!actions.length) return null;

  return (
    <div className="relative" ref={ref} onClick={e => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center justify-center w-6 h-6 rounded text-subtle hover:bg-elevated hover:text-body"
        title="More actions"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-44 rounded-md border border-line bg-card shadow-lg py-1">
          {actions.map((action, i) => {
            const Icon = action.icon;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { action.onClick(); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-elevated ${action.danger ? 'text-red-500' : 'text-body'}`}
              >
                {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
                <span className="flex-1">{action.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only colored stage chip used in the thread header. The whole chip is a
 * button that opens the prospect panel. Mirrors StagePicker's chip look:
 * shows a colored dot + stage name, or a muted "Set stage" when null.
 */
export function StageChip({ stage, onClick }: { stage: { name: string; color: string } | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border hover:bg-elevated"
      style={stage ? { color: stage.color, borderColor: `${stage.color}66` } : { borderColor: 'var(--line, #2a2a2a)' }}
      title="Pipeline stage"
    >
      {stage ? (
        <>
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color }} />
          {stage.name}
        </>
      ) : (
        <span className="text-dim">Set stage</span>
      )}
    </button>
  );
}
