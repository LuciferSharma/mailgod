import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { subscriberApi } from '../../api';
import type { Subscriber } from '../../types';
import { EMAIL_RE, normalizeEmail } from '../../lib/email';

export interface RecipientChip {
  email: string;
  subscriberId?: string;
  name?: string;
}

interface Props {
  recipients: RecipientChip[];
  onChange: (recipients: RecipientChip[]) => void;
  limit?: number;
}

export default function RecipientField({ recipients, onChange, limit = 50 }: Props) {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const emailSet = useMemo(
    () => new Set(recipients.map(r => normalizeEmail(r.email))),
    [recipients],
  );

  const { data: searchResults } = useQuery({
    queryKey: ['compose-search', debouncedSearch],
    queryFn: () => subscriberApi.list({ search: debouncedSearch, limit: 10, page: 1 }),
    enabled: debouncedSearch.length >= 1 && !EMAIL_RE.test(debouncedSearch.trim()),
  });

  const filteredResults = useMemo(() => {
    if (!searchResults?.data) return [];
    return searchResults.data.filter(s => !emailSet.has(normalizeEmail(s.email)));
  }, [searchResults, emailSet]);

  const addChip = (chip: RecipientChip) => {
    const norm = normalizeEmail(chip.email);
    if (!EMAIL_RE.test(norm) || emailSet.has(norm)) return;
    onChange([...recipients, { ...chip, email: norm }]);
    setSearch('');
    setShowResults(false);
  };

  const addEmail = (raw: string) => {
    const norm = normalizeEmail(raw);
    if (!EMAIL_RE.test(norm)) return;
    addChip({ email: norm });
  };

  const commitInput = () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    if (EMAIL_RE.test(trimmed)) {
      addEmail(trimmed);
      return;
    }
    const parts = trimmed.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
    if (parts.length > 1) {
      for (const part of parts) addEmail(part);
    }
  };

  const trimmedSearch = search.trim();
  const canAddTypedEmail = EMAIL_RE.test(trimmedSearch) && !emailSet.has(normalizeEmail(trimmedSearch));
  const overLimit = recipients.length >= limit;

  return (
    <div>
      <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">To</label>
      <div className="rounded-md border border-line bg-field p-2 flex flex-wrap items-center gap-1.5">
        {recipients.map(r => (
          <span
            key={r.subscriberId || r.email}
            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-500/15 text-blue-500 text-xs"
          >
            {r.email}
            {r.name && <span className="text-dim">({r.name})</span>}
            <button type="button" onClick={() => onChange(recipients.filter(x => x.email !== r.email))}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <div className="flex-1 min-w-32 relative">
          <input
            type="text"
            value={search}
            disabled={overLimit}
            onChange={e => { setSearch(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                commitInput();
              }
              if (e.key === 'Backspace' && !search && recipients.length > 0) {
                onChange(recipients.slice(0, -1));
              }
            }}
            onBlur={() => {
              setTimeout(() => {
                commitInput();
                setShowResults(false);
              }, 150);
            }}
            placeholder={recipients.length === 0 ? 'Search subscribers or type an email address...' : ''}
            className="w-full bg-transparent text-sm focus:outline-none px-1 py-1 disabled:opacity-50"
          />
          {showResults && (canAddTypedEmail || filteredResults.length > 0) && (
            <div className="absolute left-0 right-0 top-9 bg-card border border-line rounded-md shadow-lg z-10 max-h-64 overflow-y-auto">
              {canAddTypedEmail && (
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addEmail(trimmedSearch)}
                  className="w-full text-left px-3 py-2 hover:bg-elevated border-b border-line text-sm text-blue-500"
                >
                  Add {normalizeEmail(trimmedSearch)}
                </button>
              )}
              {filteredResults.map((s: Subscriber) => (
                <button
                  key={s._id}
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => addChip({ email: s.email, subscriberId: s._id, name: s.name })}
                  className="w-full text-left px-3 py-2 hover:bg-elevated border-b border-line last:border-b-0"
                >
                  <div className="text-sm font-medium text-heading">{s.email}</div>
                  <div className="text-xs text-subtle">{s.name} · {s.plan_tier}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between text-xs mt-1">
        <span className={overLimit ? 'text-red-500' : 'text-dim'}>
          {recipients.length} / {limit} recipients
        </span>
        {overLimit && (
          <span className="text-red-500">Over limit — use a Campaign for larger lists</span>
        )}
      </div>
      <p className="text-[11px] text-dim mt-1">
        Type any email and press Enter, or pick a subscriber. New addresses are added as subscribers automatically.
      </p>
    </div>
  );
}

export function chipsToPayload(recipients: RecipientChip[]) {
  return {
    recipient_ids: recipients.filter(r => r.subscriberId).map(r => r.subscriberId!),
    recipient_emails: recipients.filter(r => !r.subscriberId).map(r => r.email),
  };
}

export function subscribersToChips(subs: Subscriber[]): RecipientChip[] {
  return subs.map(s => ({ email: s.email, subscriberId: s._id, name: s.name }));
}
