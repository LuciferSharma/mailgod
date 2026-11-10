import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Plus } from 'lucide-react';
import { subscriberApi } from '../../api';
import type { SegmentCondition } from '../../types';

export type FieldType = 'string' | 'number' | 'date' | 'enum' | 'boolean';
export interface FieldMeta { value: string; label: string; type: FieldType; options?: string[]; isCustom?: boolean }

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

export const OPERATORS_BY_TYPE: Record<FieldType, { value: string; label: string }[]> = {
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
  boolean: [{ value: 'equals', label: 'Is' }],
};

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

export function emptyCondition(): SegmentCondition {
  return { field: 'email', operator: 'equals', value: '' };
}

export function useSegmentFields() {
  const { data: customFields } = useQuery({
    queryKey: ['custom-fields-discover'],
    queryFn: subscriberApi.discoverCustomFields,
  });

  const allFields = useMemo<FieldMeta[]>(() => {
    const customMeta: FieldMeta[] = (customFields || []).map(cf => ({
      value: `custom_attributes.${cf.key}`,
      label: cf.key,
      type: cf.type === 'url' ? 'string' : (cf.type as FieldType),
      isCustom: true,
    }));
    return [...BUILTIN_FIELDS, ...customMeta];
  }, [customFields]);

  const fieldMap = useMemo(() => new Map(allFields.map(f => [f.value, f])), [allFields]);

  const getOperators = (field: string) =>
    OPERATORS_BY_TYPE[fieldMap.get(field)?.type || 'string'];

  return { allFields, fieldMap, getOperators };
}

export function ConditionValueInput({ condition, onChange, fieldMap }: {
  condition: SegmentCondition;
  onChange: (v: any) => void;
  fieldMap: Map<string, FieldMeta>;
}) {
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

interface RulesEditorProps {
  operator: 'AND' | 'OR';
  conditions: SegmentCondition[];
  onOperatorChange: (op: 'AND' | 'OR') => void;
  onConditionsChange: (conds: SegmentCondition[]) => void;
}

export function SegmentRulesEditor({ operator, conditions, onOperatorChange, onConditionsChange }: RulesEditorProps) {
  const { allFields, fieldMap, getOperators } = useSegmentFields();

  const updateCondition = (index: number, field: keyof SegmentCondition, value: any) => {
    onConditionsChange(conditions.map((c, i) => {
      if (i !== index) return c;
      const updated = { ...c, [field]: value };
      if (field === 'field') {
        const ops = getOperators(value);
        if (!ops.find(o => o.value === updated.operator)) {
          updated.operator = ops[0].value as SegmentCondition['operator'];
        }
        updated.value = '';
      }
      return updated;
    }));
  };

  return (
    <div>
      <div className="flex items-center gap-3 mb-3">
        <label className="text-sm font-medium text-body">Match</label>
        <select value={operator} onChange={(e) => onOperatorChange(e.target.value as 'AND' | 'OR')} className={inputClass}>
          <option value="AND">ALL conditions (AND)</option>
          <option value="OR">ANY condition (OR)</option>
        </select>
      </div>
      <div className="space-y-3">
        {conditions.map((condition, idx) => {
          const operators = getOperators(condition.field);
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
              {conditions.length > 1 && (
                <button onClick={() => onConditionsChange(conditions.filter((_, i) => i !== idx))} className="text-red-500 hover:text-red-400 p-1">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={() => onConditionsChange([...conditions, emptyCondition()])}
        className="mt-3 inline-flex items-center text-sm text-blue-500 hover:text-blue-400"
      >
        <Plus className="w-3 h-3 mr-1" /> Add condition
      </button>
    </div>
  );
}
