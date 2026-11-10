import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Pencil, Trash2, RefreshCw, Users, ChevronLeft, ChevronRight,
  Save, X, Loader2, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { segmentApi } from '../api';
import type { SegmentCondition, Subscriber } from '../types';
import { SegmentRulesEditor, emptyCondition } from '../components/segments/SegmentRulesEditor';

export default function SegmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [operator, setOperator] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<SegmentCondition[]>([emptyCondition()]);
  const [page, setPage] = useState(1);

  const { data: segment, isLoading } = useQuery({
    queryKey: ['segment', id],
    queryFn: () => segmentApi.get(id!),
    enabled: !!id,
  });

  useEffect(() => {
    if (segment) {
      setName(segment.name);
      setDescription(segment.description);
      setOperator(segment.rules.operator);
      setConditions(segment.rules.conditions.length ? segment.rules.conditions : [emptyCondition()]);
    }
  }, [segment]);

  const { data: members, isLoading: membersLoading } = useQuery({
    queryKey: ['segment-members', id, page],
    queryFn: () => segmentApi.getSubscribers(id!, { page, limit: 50 }),
    enabled: !!id,
  });

  const updateMut = useMutation({
    mutationFn: () => segmentApi.update(id!, {
      name,
      description,
      rules: {
        operator,
        conditions: conditions.filter(c => c.value !== '' || c.operator === 'exists' || c.operator === 'not_exists'),
      },
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segment', id] });
      qc.invalidateQueries({ queryKey: ['segment-members', id] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.success('Segment updated');
      setEditing(false);
    },
    onError: () => toast.error('Failed to update segment'),
  });

  const refreshMut = useMutation({
    mutationFn: () => segmentApi.refresh(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segment', id] });
      qc.invalidateQueries({ queryKey: ['segment-members', id] });
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.success('Segment refreshed');
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => segmentApi.delete(id!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.success('Segment deleted');
      navigate('/segments');
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  if (!segment) {
    return (
      <div className="text-center py-12">
        <p className="text-red-500">Segment not found.</p>
        <Link to="/segments" className="text-link hover:underline mt-2 inline-block">Back to Segments</Link>
      </div>
    );
  }

  const totalPages = members ? Math.ceil(members.total / members.limit) : 0;

  return (
    <div>
      <Link to="/segments" className="inline-flex items-center text-sm text-subtle hover:text-heading mb-4">
        <ArrowLeft className="w-4 h-4 mr-1" /> Back to Segments
      </Link>

      <div className="bg-card rounded-lg border border-line p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full text-xl font-bold bg-field border border-field-line rounded-md px-3 py-2 text-heading focus:ring-2 focus:ring-blue-500/30 outline-none"
                />
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
                />
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-heading">{segment.name}</h1>
                {segment.description && <p className="text-sm text-subtle mt-1">{segment.description}</p>}
              </>
            )}
            <div className="flex items-center gap-4 mt-3 text-sm text-subtle">
              <span className="inline-flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                <span className="font-semibold text-heading">{segment.subscriber_count.toLocaleString()}</span> subscribers
              </span>
              {segment.last_computed_at && (
                <span>Updated {new Date(segment.last_computed_at).toLocaleString()}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); /* form re-syncs from useEffect */ if (segment) { setName(segment.name); setDescription(segment.description); setOperator(segment.rules.operator); setConditions(segment.rules.conditions.length ? segment.rules.conditions : [emptyCondition()]); } }}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-line rounded-md hover:bg-elevated"
                >
                  <X className="w-4 h-4 mr-1" /> Cancel
                </button>
                <button
                  onClick={() => updateMut.mutate()}
                  disabled={updateMut.isPending || !name.trim()}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {updateMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => refreshMut.mutate()}
                  disabled={refreshMut.isPending}
                  className="inline-flex items-center px-3 py-1.5 text-sm border border-line rounded-md hover:bg-elevated"
                  title="Recompute count"
                >
                  <RefreshCw className={`w-4 h-4 mr-1 ${refreshMut.isPending ? 'animate-spin' : ''}`} /> Refresh
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="inline-flex items-center px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  <Pencil className="w-4 h-4 mr-1" /> Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Delete segment "${segment.name}"?`)) deleteMut.mutate(); }}
                  className="inline-flex items-center px-2 py-1.5 text-sm border border-red-500/30 text-red-500 rounded-md hover:bg-red-500/10"
                  title="Delete segment"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-lg border border-line p-6 mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-dim" />
          <h2 className="text-base font-semibold text-heading">Rules</h2>
        </div>
        {editing ? (
          <SegmentRulesEditor
            operator={operator}
            conditions={conditions}
            onOperatorChange={setOperator}
            onConditionsChange={setConditions}
          />
        ) : (
          <div>
            <p className="text-xs text-dim uppercase tracking-wider mb-2">
              Match {segment.rules.operator === 'AND' ? 'ALL' : 'ANY'} of:
            </p>
            <div className="space-y-1.5">
              {segment.rules.conditions.length === 0 && <p className="text-sm text-subtle">No conditions — matches all active subscribers.</p>}
              {segment.rules.conditions.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-elevated px-3 py-2 rounded-md">
                  <span className="font-mono text-blue-500 text-xs">{c.field}</span>
                  <span className="text-dim text-xs">{c.operator}</span>
                  {c.operator !== 'exists' && c.operator !== 'not_exists' && (
                    <span className="font-mono text-body">{Array.isArray(c.value) ? c.value.join(', ') : String(c.value)}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-card rounded-lg border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <h2 className="text-base font-semibold text-heading">Members ({members?.total.toLocaleString() ?? '...'})</h2>
        </div>
        {membersLoading ? (
          <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-dim" /></div>
        ) : !members?.data?.length ? (
          <div className="p-8 text-center text-sm text-subtle">No subscribers match this segment.</div>
        ) : (
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Email</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Plan</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Tags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {members.data.map((sub: Subscriber) => (
                <tr key={sub._id} className="hover:bg-elevated/50">
                  <td className="px-6 py-3">
                    <Link to={`/subscribers/${sub._id}`} className="text-link hover:underline text-sm font-medium">{sub.email}</Link>
                  </td>
                  <td className="px-6 py-3 text-sm text-body">{sub.name || '-'}</td>
                  <td className="px-6 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-zinc-500/15 text-subtle">{sub.plan_tier}</span></td>
                  <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sub.status === 'active' ? 'bg-green-500/15 text-green-500' : sub.status === 'unsubscribed' ? 'bg-red-500/15 text-red-500' : 'bg-yellow-500/15 text-yellow-500'}`}>{sub.status}</span></td>
                  <td className="px-6 py-3">
                    <div className="flex flex-wrap gap-1">
                      {sub.tags.slice(0, 4).map(t => <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs">{t}</span>)}
                      {sub.tags.length > 4 && <span className="text-xs text-dim">+{sub.tags.length - 4}</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-line">
            <span className="text-sm text-subtle">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-line rounded-md disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-2 border border-line rounded-md disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
