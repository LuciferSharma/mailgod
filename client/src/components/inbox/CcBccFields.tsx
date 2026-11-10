import { useState, useMemo } from 'react';
import { X, Plus } from 'lucide-react';

interface Props {
  cc: string[];
  bcc: string[];
  onChange: (next: { cc: string[]; bcc: string[] }) => void;
  savedContacts: string[];
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CcBccFields({ cc, bcc, onChange, savedContacts }: Props) {
  const [open, setOpen] = useState(cc.length > 0 || bcc.length > 0);
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');

  const ccSet = useMemo(() => new Set(cc.map(s => s.toLowerCase())), [cc]);
  const bccSet = useMemo(() => new Set(bcc.map(s => s.toLowerCase())), [bcc]);
  const availableChips = savedContacts.filter(s => !ccSet.has(s.toLowerCase()) && !bccSet.has(s.toLowerCase()));

  const commit = (kind: 'cc' | 'bcc', input: string, setInput: (v: string) => void) => {
    const v = input.trim().toLowerCase();
    if (!v) return;
    if (!EMAIL_RE.test(v)) return;
    const set = kind === 'cc' ? ccSet : bccSet;
    if (set.has(v)) { setInput(''); return; }
    if (kind === 'cc') onChange({ cc: [...cc, v], bcc });
    else onChange({ cc, bcc: [...bcc, v] });
    setInput('');
  };

  const remove = (kind: 'cc' | 'bcc', addr: string) => {
    if (kind === 'cc') onChange({ cc: cc.filter(x => x !== addr), bcc });
    else onChange({ cc, bcc: bcc.filter(x => x !== addr) });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-blue-500 hover:text-blue-400 self-start"
      >
        + Add Cc / Bcc
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <Row
        label="Cc"
        addresses={cc}
        input={ccInput}
        onInputChange={setCcInput}
        onCommit={() => commit('cc', ccInput, setCcInput)}
        onRemove={addr => remove('cc', addr)}
      />
      <Row
        label="Bcc"
        addresses={bcc}
        input={bccInput}
        onInputChange={setBccInput}
        onCommit={() => commit('bcc', bccInput, setBccInput)}
        onRemove={addr => remove('bcc', addr)}
      />
      {availableChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-10">
          <span className="text-[11px] text-dim">Quick add to Cc:</span>
          {availableChips.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => onChange({ cc: [...cc, c.toLowerCase()], bcc })}
              className="inline-flex items-center gap-1 text-[11px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-500 hover:bg-blue-500/20"
            >
              <Plus className="w-2.5 h-2.5" /> {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({
  label, addresses, input, onInputChange, onCommit, onRemove,
}: {
  label: string;
  addresses: string[];
  input: string;
  onInputChange: (v: string) => void;
  onCommit: () => void;
  onRemove: (addr: string) => void;
}) {
  return (
    <div className="flex items-start gap-2">
      <label className="text-xs font-semibold text-dim uppercase tracking-wider w-8 mt-1.5">{label}</label>
      <div className="flex-1 rounded-md border border-line bg-field p-1.5 flex flex-wrap items-center gap-1">
        {addresses.map(a => (
          <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/15 text-blue-500 text-xs">
            {a}
            <button type="button" onClick={() => onRemove(a)} className="hover:text-red-500">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          type="email"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); onCommit(); }
            if (e.key === 'Backspace' && !input && addresses.length > 0) {
              onRemove(addresses[addresses.length - 1]);
            }
          }}
          onBlur={onCommit}
          placeholder={addresses.length === 0 ? 'email@example.com' : ''}
          className="flex-1 min-w-32 bg-transparent text-sm focus:outline-none px-1"
        />
      </div>
    </div>
  );
}
