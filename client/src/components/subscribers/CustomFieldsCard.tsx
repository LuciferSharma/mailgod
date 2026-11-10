import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, X, ExternalLink, Loader2, Pencil, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriberApi } from '../../api';

interface Props {
  subscriberId: string;
  customAttributes: Record<string, any>;
}

function inferType(value: any): 'text' | 'url' | 'number' | 'date' {
  if (value == null) return 'text';
  if (typeof value === 'number') return 'number';
  const s = String(value).trim();
  if (/^https?:\/\//i.test(s)) return 'url';
  if (/^-?\d+(\.\d+)?$/.test(s)) return 'number';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return 'date';
  return 'text';
}

export default function CustomFieldsCard({ subscriberId, customAttributes }: Props) {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const setMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: any }) =>
      subscriberApi.setCustomField(subscriberId, key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber', subscriberId] });
      qc.invalidateQueries({ queryKey: ['custom-fields-discover'] });
      setAdding(false);
      setNewKey('');
      setNewValue('');
      setEditingKey(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to save'),
  });

  const deleteMut = useMutation({
    mutationFn: (key: string) => subscriberApi.deleteCustomField(subscriberId, key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subscriber', subscriberId] });
      qc.invalidateQueries({ queryKey: ['custom-fields-discover'] });
    },
  });

  const entries = Object.entries(customAttributes || {});

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(key)) {
      toast.error('Use letters, digits, underscores, hyphens');
      return;
    }
    setMut.mutate({ key, value: newValue });
  };

  const handleEdit = (key: string) => {
    setEditingKey(key);
    setEditValue(String(customAttributes[key] ?? ''));
  };

  const handleSaveEdit = (key: string) => {
    setMut.mutate({ key, value: editValue });
  };

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-body">Custom Fields</h3>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs text-blue-500 hover:text-blue-400 inline-flex items-center"
          >
            <Plus className="w-3 h-3 mr-0.5" /> Add field
          </button>
        )}
      </div>

      {entries.length === 0 && !adding && (
        <p className="text-sm text-dim">
          No custom fields. Add one here, or include extra columns in your CSV import.
        </p>
      )}

      {entries.length > 0 && (
        <div className="space-y-2 mb-3">
          {entries.map(([key, value]) => {
            const type = inferType(value);
            const isEditing = editingKey === key;
            return (
              <div key={key} className="group flex items-center gap-2">
                <div className="flex-1 min-w-0 grid grid-cols-3 gap-2 items-center text-sm">
                  <div className="text-dim font-mono text-xs truncate" title={key}>{key}</div>
                  <div className="col-span-2 min-w-0">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(key); }}
                        autoFocus
                        className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1 text-heading focus:ring-2 focus:ring-blue-500/30 outline-none"
                      />
                    ) : type === 'url' ? (
                      <a
                        href={String(value)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline inline-flex items-center gap-1 truncate"
                      >
                        <span className="truncate">{String(value)}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className={`text-body truncate block ${type === 'number' ? 'tabular-nums' : ''}`}>
                        {String(value)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 shrink-0">
                  {isEditing ? (
                    <button
                      onClick={() => handleSaveEdit(key)}
                      className="p-1 text-emerald-500 hover:text-emerald-400"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleEdit(key)}
                      className="p-1 text-dim hover:text-blue-500"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => { if (confirm(`Delete field "${key}"?`)) deleteMut.mutate(key); }}
                    className="p-1 text-dim hover:text-red-500"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="border-t border-line pt-3 space-y-2">
          <input
            type="text"
            value={newKey}
            onChange={e => setNewKey(e.target.value)}
            placeholder="Field name (e.g. channel_link)"
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <input
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
            placeholder="Value"
            className="w-full text-sm bg-field border border-field-line rounded-md px-2 py-1.5 text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAdding(false); setNewKey(''); setNewValue(''); }}
              className="px-3 py-1 text-xs border border-line rounded-md hover:bg-elevated"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!newKey.trim() || setMut.isPending}
              className="inline-flex items-center px-3 py-1 text-xs bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {setMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
