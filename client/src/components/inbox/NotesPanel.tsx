import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, Trash2, Loader2 } from 'lucide-react';
import { inboxApi } from '../../api';
import type { InboxConversation } from '../../types';

export default function NotesPanel({ conv }: { conv: InboxConversation }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const queryKey = ['inbox-notes', conv.type, conv.id, conv.flow_node_id];
  const { data: notes, isLoading } = useQuery({
    queryKey,
    queryFn: () => inboxApi.notes({
      conversation_type: conv.type,
      conversation_id: conv.id,
      flow_node_id: conv.flow_node_id || undefined,
    }),
  });

  const createMut = useMutation({
    mutationFn: () => inboxApi.createNote({
      conversation_type: conv.type,
      conversation_id: conv.id,
      flow_node_id: conv.flow_node_id || null,
      body,
    }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => inboxApi.deleteNote(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <Pin className="w-3.5 h-3.5 text-dim" />
        <h3 className="text-xs font-semibold text-dim uppercase tracking-wider">Internal notes</h3>
      </div>

      {isLoading ? (
        <div className="p-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-dim" /></div>
      ) : (
        <div className="space-y-2 mb-2">
          {(notes || []).map(n => (
            <div key={n._id} className="rounded-md border border-line bg-elevated/40 p-3 group">
              <div className="flex items-center justify-between text-xs text-dim mb-1">
                <span>{n.created_by_name || 'Admin'} · {new Date(n.created_at).toLocaleString()}</span>
                <button
                  onClick={() => { if (confirm('Delete this note?')) deleteMut.mutate(n._id); }}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="text-sm text-body whitespace-pre-wrap">{n.body}</div>
            </div>
          ))}
          {!notes?.length && <p className="text-xs text-subtle">No notes yet.</p>}
        </div>
      )}

      <div className="flex items-start gap-2">
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Add an internal note..."
          rows={2}
          className="flex-1 px-3 py-2 text-sm rounded-md border border-line bg-field resize-y"
        />
        <button
          onClick={() => createMut.mutate()}
          disabled={!body.trim() || createMut.isPending}
          className="px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
        </button>
      </div>
    </div>
  );
}
