import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Loader2, Plus, Trash2, Variable, Activity, AtSign, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { settingsApi, subscriberApi } from '../api';
import type { Setting } from '../types';
import PipelineStagesCard from '../components/settings/PipelineStagesCard';

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

const SETTING_FIELDS = {
  sendgrid: [
    { key: 'sendgrid_api_key', label: 'API Key', type: 'password', placeholder: 'SG.xxxx...' },
    { key: 'from_email', label: 'From Email', type: 'email', placeholder: 'hello@yourdomain.com' },
    { key: 'from_name', label: 'From Name', type: 'text', placeholder: 'Acme' },
  ],
  sending: [
    { key: 'global_rate_limit', label: 'Global Rate Limit (emails/hour)', type: 'number', placeholder: '10000' },
    { key: 'frequency_cap_daily', label: 'Frequency Cap (per subscriber/day)', type: 'number', placeholder: '3' },
    { key: 'batch_size', label: 'Default Batch Size', type: 'number', placeholder: '100' },
  ],
  unsubscribe: [
    { key: 'unsubscribe_url', label: 'Unsubscribe URL', type: 'text', placeholder: 'https://yourdomain.com/unsubscribe' },
  ],
};

const SUBSCRIBER_VARS = ['name', 'first_name', 'email', 'plan_tier', 'unsubscribe_url'];

const DEFAULT_GLOBAL_VARS: { key: string; label: string; placeholder: string }[] = [
  { key: 'product_name', label: 'Product Name', placeholder: 'Acme' },
  { key: 'website_url', label: 'Website URL', placeholder: 'https://yourdomain.com' },
  { key: 'support_email', label: 'Support Email', placeholder: 'support@yourdomain.com' },
  { key: 'company_address', label: 'Postal Address (email footer, CAN-SPAM)', placeholder: 'Acme Inc, 123 Main St, City, Country' },
];

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [originalValues, setOriginalValues] = useState<Record<string, any>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: settingsApi.get,
  });

  useEffect(() => {
    if (settings) {
      const values: Record<string, any> = {};
      settings.forEach((s: Setting) => {
        values[s.key] = s.value;
      });
      setFormValues(values);
      setOriginalValues(values);
    }
  }, [settings]);

  // Deep-equal dirty check — compares form state vs last-loaded server state.
  // Cheap enough for the size of the settings object.
  const isDirty = useMemo(
    () => JSON.stringify(formValues) !== JSON.stringify(originalValues),
    [formValues, originalValues]
  );

  // Warn before unload if there are unsaved changes
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      // Mark form as clean immediately so the dirty indicator clears even
      // before the refetch resolves.
      setOriginalValues(formValues);
      toast.success('Settings saved');
    },
    onError: () => toast.error('Failed to save settings'),
  });

  const handleChange = (key: string, value: any) => {
    setFormValues(prev => ({ ...prev, [key]: value }));
  };

  // Template variables (stored as a single setting key)
  const templateVars: Record<string, string> = formValues.template_variables || {};

  const setTemplateVar = (varKey: string, varValue: string) => {
    setFormValues(prev => ({
      ...prev,
      template_variables: { ...(prev.template_variables || {}), [varKey]: varValue },
    }));
  };

  const deleteTemplateVar = (varKey: string) => {
    setFormValues(prev => {
      const vars = { ...(prev.template_variables || {}) };
      delete vars[varKey];
      return { ...prev, template_variables: vars };
    });
  };

  const ccContacts: string[] = Array.isArray(formValues.cc_contacts) ? formValues.cc_contacts : [];
  const setCcContacts = (next: string[]) => setFormValues((prev: any) => ({ ...prev, cc_contacts: next }));
  const [newCcInput, setNewCcInput] = useState('');
  const addCcContact = () => {
    const v = newCcInput.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { toast.error('Enter a valid email'); return; }
    if (ccContacts.includes(v)) { setNewCcInput(''); return; }
    setCcContacts([...ccContacts, v]);
    setNewCcInput('');
  };
  const removeCcContact = (addr: string) => setCcContacts(ccContacts.filter(c => c !== addr));

  const [newVarKey, setNewVarKey] = useState('');
  const [newVarValue, setNewVarValue] = useState('');

  const addTemplateVar = () => {
    const key = newVarKey.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!key) return;
    if (SUBSCRIBER_VARS.includes(key)) {
      toast.error(`"${key}" is a built-in subscriber variable and can't be overridden`);
      return;
    }
    setTemplateVar(key, newVarValue);
    setNewVarKey('');
    setNewVarValue('');
  };

  const handleSave = () => {
    updateMutation.mutate(formValues);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div>
      {/* Sticky header — stays visible while scrolling so Save is always one click away */}
      <div className="sticky top-0 z-20 -mx-6 px-6 py-4 bg-surface/90 backdrop-blur-sm border-b border-line mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-heading">Settings</h1>
            {isDirty && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Unsaved changes
              </span>
            )}
          </div>
          <p className="text-subtle text-sm mt-0.5">Platform configuration</p>
        </div>
        <button
          onClick={handleSave}
          disabled={updateMutation.isPending || !isDirty}
          title={!isDirty ? 'No unsaved changes' : undefined}
          className={`inline-flex items-center px-4 py-2 text-sm font-semibold rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isDirty
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-900/30 ring-2 ring-blue-500/30'
              : 'bg-elevated text-subtle border border-line'
          }`}
        >
          {updateMutation.isPending ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          {isDirty ? 'Save Settings' : 'Saved'}
        </button>
      </div>

      <div className="space-y-6">
        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-1">SendGrid Configuration</h3>
          <p className="text-sm text-subtle mb-4">Configure your email delivery provider.</p>
          <div className="space-y-4">
            {SETTING_FIELDS.sendgrid.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-body mb-1">{field.label}</label>
                <input
                  type={field.type}
                  value={formValues[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full ${inputClass}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-1">Sending Limits</h3>
          <p className="text-sm text-subtle mb-4">Control email sending rates and frequency caps.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {SETTING_FIELDS.sending.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-body mb-1">{field.label}</label>
                <input
                  type={field.type}
                  value={formValues[field.key] || ''}
                  onChange={(e) => handleChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
                  placeholder={field.placeholder}
                  min={field.type === 'number' ? 0 : undefined}
                  className={`w-full ${inputClass}`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card rounded-lg border border-line p-6">
          <h3 className="text-lg font-semibold text-heading mb-1">Unsubscribe</h3>
          <p className="text-sm text-subtle mb-4">Configure the unsubscribe link included in emails.</p>
          <div className="space-y-4">
            {SETTING_FIELDS.unsubscribe.map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-medium text-body mb-1">{field.label}</label>
                <input
                  type={field.type}
                  value={formValues[field.key] || ''}
                  onChange={(e) => handleChange(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className={`w-full ${inputClass}`}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Template Variables */}
        <div className="bg-card rounded-lg border border-line p-6">
          <div className="flex items-center gap-2 mb-1">
            <Variable className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-heading">Template Variables</h3>
          </div>
          <p className="text-sm text-subtle mb-5">
            Global variables available in every email template as <code className="text-xs bg-elevated px-1.5 py-0.5 rounded">{`{{variable_name}}`}</code>. These are auto-replaced when emails are sent.
          </p>

          {/* Built-in subscriber vars (read-only reference) */}
          <div className="mb-5">
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-2">Built-in (auto-filled from subscriber)</p>
            <div className="flex flex-wrap gap-2">
              {SUBSCRIBER_VARS.map((v) => (
                <span key={v} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
                  {`{{${v}}}`}
                </span>
              ))}
            </div>
          </div>

          {/* Global custom vars */}
          <div>
            <p className="text-xs font-semibold text-subtle uppercase tracking-wider mb-3">Global Variables (set by you)</p>

            {/* Default suggested vars + any custom vars */}
            <div className="space-y-2.5">
              {DEFAULT_GLOBAL_VARS.map((field) => (
                <div key={field.key} className="flex items-center gap-3">
                  <code className="text-xs font-mono text-purple-500 bg-purple-500/10 px-2 py-1.5 rounded min-w-[140px] text-center border border-purple-500/20">
                    {`{{${field.key}}}`}
                  </code>
                  <input
                    type="text"
                    value={templateVars[field.key] || ''}
                    onChange={(e) => setTemplateVar(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    className={`flex-1 ${inputClass}`}
                  />
                </div>
              ))}

              {/* User-added custom vars */}
              {Object.entries(templateVars)
                .filter(([k]) => !DEFAULT_GLOBAL_VARS.some((d) => d.key === k))
                .map(([k, v]) => (
                  <div key={k} className="flex items-center gap-3">
                    <code className="text-xs font-mono text-purple-500 bg-purple-500/10 px-2 py-1.5 rounded min-w-[140px] text-center border border-purple-500/20">
                      {`{{${k}}}`}
                    </code>
                    <input
                      type="text"
                      value={v}
                      onChange={(e) => setTemplateVar(k, e.target.value)}
                      className={`flex-1 ${inputClass}`}
                    />
                    <button
                      type="button"
                      onClick={() => deleteTemplateVar(k)}
                      className="p-2 text-dim hover:text-red-500 rounded transition-colors"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
            </div>

            {/* Add custom variable */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-line">
              <input
                type="text"
                value={newVarKey}
                onChange={(e) => setNewVarKey(e.target.value)}
                placeholder="variable_name"
                className={`w-[140px] font-mono text-xs ${inputClass}`}
                onKeyDown={(e) => e.key === 'Enter' && addTemplateVar()}
              />
              <input
                type="text"
                value={newVarValue}
                onChange={(e) => setNewVarValue(e.target.value)}
                placeholder="Value"
                className={`flex-1 ${inputClass}`}
                onKeyDown={(e) => e.key === 'Enter' && addTemplateVar()}
              />
              <button
                type="button"
                onClick={addTemplateVar}
                disabled={!newVarKey.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-elevated border border-line rounded-md text-body hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        </div>

        <div className="bg-card border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold text-heading mb-1 flex items-center gap-2">
            <AtSign className="w-5 h-5 text-blue-500" /> Cc Contacts
          </h2>
          <p className="text-sm text-subtle mb-3">
            Saved email addresses appear as one-click chips when you compose or reply in the Inbox. Useful for always-CC team members or stakeholders.
          </p>
          <div className="space-y-2">
            {ccContacts.length === 0 && (
              <p className="text-sm text-dim italic">No saved contacts yet. Add one below.</p>
            )}
            {ccContacts.map(c => (
              <div key={c} className="inline-flex items-center gap-1 mr-2 mb-2 px-2.5 py-1 rounded bg-elevated border border-line text-sm text-body">
                <AtSign className="w-3.5 h-3.5 text-dim" />
                <span className="font-mono">{c}</span>
                <button onClick={() => removeCcContact(c)} className="ml-1 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 mt-2">
              <input
                type="email"
                value={newCcInput}
                onChange={e => setNewCcInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCcContact(); } }}
                placeholder="email@example.com"
                className={`flex-1 ${inputClass}`}
              />
              <button
                type="button"
                onClick={addCcContact}
                disabled={!newCcInput.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-elevated border border-line rounded-md text-body hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <p className="text-xs text-dim mt-2">Don't forget to click "Save Settings" at the top to persist changes.</p>
          </div>
        </div>

        <PipelineStagesCard />

        <div className="bg-card border border-line rounded-lg p-6">
          <h2 className="text-lg font-semibold text-heading mb-3 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" /> Engagement
          </h2>
          <p className="text-sm text-subtle mb-3">
            Recompute engagement scores for all subscribers from their full event history. Run this once after enabling the feature, or after a data import. Idempotent — safe to re-run.
          </p>
          <BackfillButton />
        </div>
      </div>
    </div>
  );
}

function BackfillButton() {
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [info, setInfo] = useState<string>('');
  const handleClick = async () => {
    if (status === 'running') return;
    if (!confirm('Recompute engagement scores for all subscribers? This runs in the background and may take 1-2 minutes.')) return;
    setStatus('running');
    try {
      const res = await subscriberApi.backfillEngagement();
      setInfo(`Started — processing ${res.total.toLocaleString()} subscribers in the background`);
      setStatus('done');
      toast.success('Backfill started');
    } catch (e: any) {
      setStatus('error');
      setInfo(e?.response?.data?.error || e?.message || 'Failed');
      toast.error('Backfill failed');
    }
  };
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={status === 'running'}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
      >
        {status === 'running' && <Loader2 className="w-4 h-4 animate-spin" />}
        {status === 'running' ? 'Running...' : 'Recompute all engagement scores'}
      </button>
      {info && <span className="text-xs text-subtle">{info}</span>}
    </div>
  );
}
