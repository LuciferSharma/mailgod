import type { Mailbox } from '../../types';

export type SenderChoice = { mode: 'default' | 'pool' | 'mailbox'; mailbox_ids: string[] };

/**
 * "Send via" control shared by the compose modal and draft detail.
 * default = the SendGrid sender immediately (max 50 recipients).
 * pool    = queued and paced across every active sender in the pool.
 * mailbox = queued and paced across the ticked senders only.
 */
export default function SenderPicker({ value, onChange, mailboxes }: { value: SenderChoice; onChange: (v: SenderChoice) => void; mailboxes: Mailbox[] }) {
  const active = mailboxes.filter(m => m.status === 'active');
  const allowance = active.filter(m => value.mode === 'pool' ? m.include_in_pool : value.mailbox_ids.includes(m._id))
    .reduce((s, m) => s + Math.max(0, m.allowance_today - m.sent_today), 0);
  return (
    <div>
      <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">Send via</label>
      <div className="flex flex-wrap gap-2">
        {([
          ['pool', 'Whole pool (SendGrid + mailboxes, paced)'],
          ['default', 'SendGrid now (max 50)'],
          ['mailbox', 'Pick senders'],
        ] as const).map(([mode, label]) => (
          <button key={mode} type="button" onClick={() => onChange({ mode, mailbox_ids: mode === 'mailbox' ? value.mailbox_ids : [] })}
            className={`px-3 py-1.5 rounded-md border text-xs ${value.mode === mode ? 'bg-blue-600 text-white border-blue-600' : 'border-line text-subtle hover:bg-elevated'}`}>
            {label}
          </button>
        ))}
      </div>
      {value.mode === 'mailbox' && (
        <div className="mt-2 flex flex-wrap gap-2">
          {mailboxes.map(m => (
            <label key={m._id} className={`flex items-center gap-1.5 px-2 py-1 rounded border text-xs cursor-pointer ${m.status !== 'active' ? 'opacity-50' : ''} ${value.mailbox_ids.includes(m._id) ? 'border-blue-500 bg-blue-500/10' : 'border-line'}`}>
              <input type="checkbox" checked={value.mailbox_ids.includes(m._id)}
                onChange={e => onChange({ mode: 'mailbox', mailbox_ids: e.target.checked ? [...value.mailbox_ids, m._id] : value.mailbox_ids.filter(x => x !== m._id) })} />
              {m.email} <span className="text-dim">({m.sent_today}/{m.allowance_today} today)</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-dim mt-1.5">
        {value.mode === 'default'
          ? 'Sent immediately from the SendGrid sender.'
          : `Queued and sent one at a time inside each sender's window and warmup limit. Remaining allowance today across chosen senders: ${allowance}.`}
      </p>
    </div>
  );
}
