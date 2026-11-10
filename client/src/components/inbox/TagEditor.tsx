import { useState, useRef, useEffect } from 'react';
import { Tag, X, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { inboxApi } from '../../api';
import type { InboxConversation } from '../../types';

export default function TagEditor({ conv, onChanged }: { conv: InboxConversation; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [tags, setTags] = useState<string[]>(conv.inbox_tags || []);
  const ref = useRef<HTMLDivElement>(null);

  const { data: allTags } = useQuery({ queryKey: ['inbox-tags'], queryFn: inboxApi.tags });

  useEffect(() => setTags(conv.inbox_tags || []), [conv.inbox_tags, conv.id]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const addTag = async (t: string) => {
    const tag = t.trim().replace(/^#/, '');
    if (!tag || tags.includes(tag)) return;
    setTags(prev => [...prev, tag]);
    setInput('');
    await inboxApi.updateTags(conv.type, conv.id, { add: [tag] }, conv.flow_node_id);
    onChanged();
  };

  const removeTag = async (tag: string) => {
    setTags(prev => prev.filter(t => t !== tag));
    await inboxApi.updateTags(conv.type, conv.id, { remove: [tag] }, conv.flow_node_id);
    onChanged();
  };

  const suggestions = (allTags || []).filter(
    t => !tags.includes(t) && (!input || t.toLowerCase().includes(input.toLowerCase()))
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="p-1.5 rounded hover:bg-elevated text-dim hover:text-blue-500"
        title="Edit tags"
      >
        <Tag className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-64 bg-card rounded-md shadow-lg border border-line p-3">
          <div className="text-xs font-semibold text-dim uppercase tracking-wider mb-2">Tags</div>
          <div className="flex flex-wrap gap-1 mb-2">
            {tags.length === 0 && <span className="text-xs text-subtle">None yet</span>}
            {tags.map(t => (
              <span key={t} className="group/chip inline-flex items-center gap-0.5 pl-1.5 pr-0.5 py-0.5 rounded bg-blue-500/15 text-blue-500 text-xs">
                #{t}
                <button
                  type="button"
                  onClick={() => removeTag(t)}
                  className="opacity-0 group-hover/chip:opacity-100 p-0.5 rounded hover:bg-black/15 hover:text-red-500 transition-opacity"
                  title="Remove tag"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(input); } }}
              placeholder="Add tag..."
              className="flex-1 px-2 py-1 text-sm rounded border border-line bg-field"
              autoFocus
            />
            <button
              onClick={() => addTag(input)}
              disabled={!input.trim()}
              className="p-1 text-blue-500 disabled:opacity-30"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto">
              {suggestions.slice(0, 8).map(s => (
                <button
                  key={s}
                  onClick={() => addTag(s)}
                  className="block w-full text-left px-2 py-1 rounded text-xs text-subtle hover:bg-elevated"
                >
                  #{s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
