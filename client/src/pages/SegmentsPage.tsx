import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Trash2, RefreshCw, Users, ChevronUp, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { segmentApi, subscriberApi } from '../api';
import type { Segment, SegmentCondition } from '../types';

type FieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean';
interface FieldMeta { value: string; label: string; type: FieldType; options?: string[]; isCustom?: boolean }

const BUILTIN_FIELDS: FieldMeta[] = [
  { value: 'email', label: 'Email', type: 'string' },
  { value: 'name', label: 'Name', type: 'string' },
  { value: 'country', label: 'Country', type: 'string' },
  { value: 'plan_tier', label: 'Plan Tier', type: 'enum', options: ['free', '$9', '$29', '$49', '$99'] },
  { value: 'status', label: 'Status', type: 'enum', options: ['active', 'unsubscribed', 'bounced'] },
  { value: 'paid', label: 'Paid', type: 'boolean' },
  { value: 'cancelled', label: 'Cancelled', type: 'boolean' },
  { value: 'usage_count', label: 'Usage Count', type: 'number' },
  { value: 'tags', label: 'Tags', type: 'string' },
  { value: 'signup_source', label: 'Signup Source', type: 'string' },
  { value: 'last_login', label: 'Last Login', type: 'date' },
  { value: 'engagement.emails_sent', label: 'Emails Sent', type: 'number' },
  { value: 'engagement.emails_opened', label: 'Emails Opened', type: 'number' },
  { value: 'engagement_score', label: 'Engagement Score', type: 'number' },
  { value: 'engagement_last_event_at', label: 'Last Engaged', type: 'date' },
];

const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
  string: [
    { value: 'equals', label: 'Equals' }, { value: 'not_equals', label: 'Not Equals' },
    { value: 'contains', label: 'Contains' }, { value: 'not_contains', label: 'Not Contains' },
    { value: 'exists', label: 'Exists' }, { value: 'not_exists', label: 'Not Exists' },
  ],
  number: [
    { value: 'equals', label: 'Equals' }, { value: 'not_equals', label: 'Not Equals' },
    { value: 'gt', label: 'Greater Than' }, { value: 'gte', label: '>= (At Least)' },
    { value: 'lt', label: 'Less Than' }, { value: 'lte', label: '<= (At Most)' },
    { value: 'exists', label: 'Exists' },
  ],
  date: [
    { value: 'before', label: 'Before' }, { value: 'after', label: 'After' },
    { value: 'exists', label: 'Exists' }, { value: 'not_exists', label: 'Not Exists' },
  ],
  enum: [
    { value: 'equals', label: 'Is' }, { value: 'not_equals', label: 'Is Not' },
    { value: 'in', label: 'In' },
  ],
  boolean: [
    { value: 'equals', label: 'Is' },
  ],
};

function getFieldType(field: string, fieldMap: Map<string, FieldMeta>): FieldType {
  return fieldMap.get(field)?.type || 'string';
}

function getOperators(field: string, fieldMap: Map<string, FieldMeta>) {
  return OPERATORS_BY_TYPE[getFieldType(field, fieldMap)];
}

const emptyCondition = (): SegmentCondition => ({ field: 'email', operator: 'equals', value: '' });
const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

function ConditionValueInput({ condition, onChange, fieldMap }: { condition: SegmentCondition; onChange: (v: any) => void; fieldMap: Map<string, FieldMeta> }) {
  const meta = fieldMap.get(condition.field);
  const type = meta?.type || 'string';

  if (condition.operator === 'exists' || condition.operator === 'not_exists') return null;

  if (type === 'boolean') {
    return (
      <select value={String(condition.value)} onChange={e => onChange(e.target.value === 'true')} className={`flex-1 ${inputClass}`}>
        <option value="true">True</option>
        <option value="false">False</option>
      </select>
    );
  }

  if (type === 'enum' && meta?.options) {
    return (
      <select value={condition.value as string} onChange={e => onChange(e.target.value)} className={`flex-1 ${inputClass}`}>
        <option value="">Select...</option>
        {meta.options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }

  if (type === 'number') {
    return <input type="number" value={condition.value as string} onChange={e => onChange(e.target.value)} placeholder="0" className={`flex-1 ${inputClass}`} />;
  }

  if (type === 'date') {
    return <input type="date" value={condition.value as string} onChange={e => onChange(e.target.value)} className={`flex-1 ${inputClass}`} />;
  }

  return <input type="text" value={condition.value as string} onChange={e => onChange(e.target.value)} placeholder="Value" className={`flex-1 ${inputClass}`} />;
}

export default function SegmentsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [rulesOperator, setRulesOperator] = useState<'AND' | 'OR'>('AND');
  const [conditions, setConditions] = useState<SegmentCondition[]>([emptyCondition()]);
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const { data: segments, isLoading } = useQuery({ queryKey: ['segments'], queryFn: segmentApi.list });
  const { data: customFields } = useQuery({ queryKey: ['custom-fields-discover'], queryFn: subscriberApi.discoverCustomFields });

  const allFields: FieldMeta[] = useMemo(() => {
    const customMeta: FieldMeta[] = (customFields || []).map(cf => ({
      value: `custom_attributes.${cf.key}`,
      label: cf.key,
      type: cf.type === 'url' ? 'string' : cf.type as FieldType,
      isCustom: true,
    }));
    return [...BUILTIN_FIELDS, ...customMeta];
  }, [customFields]);

  const fieldMap = useMemo(() => new Map(allFields.map(f => [f.value, f])), [allFields]);
  const createMutation = useMutation({ mutationFn: (data: Partial<Segment>) => segmentApi.create(data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['segments'] }); toast.success('Segment created'); resetForm(); } });
  const deleteMutation = useMutation({ mutationFn: (id: string) => segmentApi.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['segments'] }); toast.success('Segment deleted'); } });
  const refreshMutation = useMutation({ mutationFn: (id: string) => segmentApi.refresh(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['segments'] }); toast.success('Segment refreshed'); } });

  const resetForm = () => { setShowForm(false); setFormName(''); setFormDescription(''); setRulesOperator('AND'); setConditions([emptyCondition()]); setPreviewCount(null); };
  const handleCreate = () => { if (!formName.trim()) { toast.error('Segment name is required'); return; } createMutation.mutate({ name: formName, description: formDescription, rules: { operator: rulesOperator, conditions: conditions.filter(c => c.value !== '' || c.operator === 'exists' || c.operator === 'not_exists') } }); };

  const updateCondition = (index: number, field: keyof SegmentCondition, value: any) => {
    setConditions(prev => prev.map((c, i) => {
      if (i !== index) return c;
      const updated = { ...c, [field]: value };
      if (field === 'field') {
        const ops = getOperators(value, fieldMap);
        if (!ops.find(o => o.value === updated.operator)) {
          updated.operator = ops[0].value as SegmentCondition['operator'];
        }
        updated.value = '';
      }
      return updated;
    }));
  };

  useEffect(() => {
    if (!showForm) return;
    const validConditions = conditions.filter(c => c.value !== '' || c.operator === 'exists' || c.operator === 'not_exists');
    if (validConditions.length === 0) { setPreviewCount(null); return; }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await segmentApi.previewCount(rulesOperator, validConditions);
        setPreviewCount(res.count);
      } catch { setPreviewCount(null); }
      setPreviewLoading(false);
    }, 600);

    return () => clearTimeout(debounceRef.current);
  }, [conditions, rulesOperator, showForm]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-heading">Segments</h1><p className="text-subtle mt-1">Create and manage audience segments</p></div>
        <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700">
          {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}{showForm ? 'Cancel' : 'Create Segment'}
        </button>
      </div>

      {showForm && (
        <div className="bg-card rounded-lg border border-line p-6 mb-6">
          <h3 className="text-lg font-semibold text-heading mb-4">New Segment</h3>
          <div className="space-y-4">
            <div><label className="block text-sm font-medium text-body mb-1">Name</label><input type="text" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g., Active Paid Users" className={`w-full ${inputClass}`} /></div>
            <div><label className="block text-sm font-medium text-body mb-1">Description</label><input type="text" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="Describe this segment..." className={`w-full ${inputClass}`} /></div>
            <div>
              <div className="flex items-center gap-3 mb-3">
                <label className="text-sm font-medium text-body">Match</label>
                <select value={rulesOperator} onChange={(e) => setRulesOperator(e.target.value as 'AND' | 'OR')} className={inputClass}><option value="AND">ALL conditions (AND)</option><option value="OR">ANY condition (OR)</option></select>
                {previewCount !== null && (
                  <div className="ml-auto flex items-center gap-2">
                    {previewLoading ? (
                      <span className="text-xs text-subtle animate-pulse">Counting...</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-500/15 text-blue-500 border border-blue-500/20">
                        <Users className="w-3 h-3" />{previewCount.toLocaleString()} subscriber{previewCount !== 1 ? 's' : ''} match
                      </span>
                    )}
                  </div>
                )}
              </div>
              <div className="space-y-3">
                {conditions.map((condition, idx) => {
                  const operators = getOperators(condition.field, fieldMap);
                  return (
                    <div key={idx} className="flex items-center gap-2 bg-elevated p-3 rounded-md">
                      <select value={condition.field} onChange={(e) => updateCondition(idx, 'field', e.target.value)} className={`flex-1 ${inputClass}`}>
                        <optgroup label="Subscriber">
                          {allFields.filter(f => !f.value.startsWith('engagement') && !f.isCustom).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </optgroup>
                        <optgroup label="Engagement">
                          {allFields.filter(f => f.value.startsWith('engagement')).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </optgroup>
                        {allFields.some(f => f.isCustom) && (
                          <optgroup label="Custom fields">
                            {allFields.filter(f => f.isCustom).map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </optgroup>
                        )}
                      </select>
                      <select value={condition.operator} onChange={(e) => updateCondition(idx, 'operator', e.target.value)} className={`flex-1 ${inputClass}`}>
                        {operators.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <ConditionValueInput condition={condition} onChange={(v) => updateCondition(idx, 'value', v)} fieldMap={fieldMap} />
                      {conditions.length > 1 && <button onClick={() => setConditions(prev => prev.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-400 p-1"><X className="w-4 h-4" /></button>}
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setConditions(prev => [...prev, emptyCondition()])} className="mt-3 inline-flex items-center text-sm text-link hover:underline"><Plus className="w-4 h-4 mr-1" /> Add Condition</button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={resetForm} className="px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated">Cancel</button>
              <button onClick={handleCreate} disabled={createMutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">{createMutation.isPending ? 'Creating...' : 'Create Segment'}</button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? <div className="flex items-center justify-center h-40"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" /></div> :
       !segments || segments.length === 0 ? <div className="bg-card rounded-lg border border-line p-12 text-center"><Users className="w-12 h-12 text-dim mx-auto mb-3" /><p className="text-subtle">No segments created yet.</p></div> : (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated"><tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Subscribers</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Conditions</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Last Computed</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-subtle uppercase tracking-wider">Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-line">
              {segments.map((seg: Segment) => (
                <tr key={seg._id} className="hover:bg-elevated/50">
                  <td className="px-6 py-4"><Link to={`/segments/${seg._id}`} className="text-sm font-medium text-heading hover:text-blue-500">{seg.name}</Link>{seg.description && <div className="text-xs text-subtle mt-0.5">{seg.description}</div>}</td>
                  <td className="px-6 py-4"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-500">{seg.subscriber_count} subscribers</span></td>
                  <td className="px-6 py-4 text-sm text-subtle">{seg.rules.conditions.length} rule{seg.rules.conditions.length !== 1 ? 's' : ''} ({seg.rules.operator})</td>
                  <td className="px-6 py-4 text-sm text-subtle">{seg.last_computed_at ? new Date(seg.last_computed_at).toLocaleString() : 'Never'}</td>
                  <td className="px-6 py-4 text-right"><div className="flex items-center justify-end gap-2">
                    <button onClick={() => refreshMutation.mutate(seg._id)} className="p-1.5 text-dim hover:text-blue-500 rounded" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm('Delete this segment?')) deleteMutation.mutate(seg._id); }} className="p-1.5 text-dim hover:text-red-500 rounded" title="Delete"><Trash2 className="w-4 h-4" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
