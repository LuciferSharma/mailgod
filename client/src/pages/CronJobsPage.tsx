import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Trash2, Play, Pause, Clock, ChevronUp, ChevronDown, Timer, Pencil, History,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { cronJobApi, flowApi, campaignApi } from '../api';
import type { CronJob, CronJobRun, Flow, Campaign } from '../types';
import PageHint from '../components/PageHint';

const statusColors: Record<string, string> = {
  active: 'bg-green-500/15 text-green-500',
  paused: 'bg-yellow-500/15 text-yellow-500',
};

const FREQUENCIES = [
  { value: 'hourly', label: 'Every Hour' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function buildCron(freq: string, time: string, dayOfWeek: string, dayOfMonth: string): string {
  const [h, m] = time.split(':');
  switch (freq) {
    case 'hourly': return `0 * * * *`;
    case 'daily': return `${m} ${h} * * *`;
    case 'weekly': return `${m} ${h} * * ${dayOfWeek}`;
    case 'monthly': return `${m} ${h} ${dayOfMonth} * *`;
    default: return '0 * * * *';
  }
}

function parseCron(cron: string): { freq: string; time: string; dayOfWeek: string; dayOfMonth: string } {
  const parts = cron.split(' ');
  if (parts.length !== 5) return { freq: 'hourly', time: '09:00', dayOfWeek: '1', dayOfMonth: '1' };
  const [min, hour, dom, , dow] = parts;
  const time = `${(hour === '*' ? '0' : hour).padStart(2, '0')}:${(min === '*' ? '0' : min).padStart(2, '0')}`;
  if (hour === '*') return { freq: 'hourly', time: '09:00', dayOfWeek: '1', dayOfMonth: '1' };
  if (dow !== '*') return { freq: 'weekly', time, dayOfWeek: dow, dayOfMonth: '1' };
  if (dom !== '*') return { freq: 'monthly', time, dayOfWeek: '1', dayOfMonth: dom };
  return { freq: 'daily', time, dayOfWeek: '1', dayOfMonth: '1' };
}

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

function humanReadableSchedule(cron: string): string {
  const parsed = parseCron(cron);
  switch (parsed.freq) {
    case 'hourly': return 'Every hour';
    case 'daily': return `Daily at ${parsed.time}`;
    case 'weekly': return `${DAYS_OF_WEEK[parseInt(parsed.dayOfWeek)] || parsed.dayOfWeek} at ${parsed.time}`;
    case 'monthly': return `Monthly on day ${parsed.dayOfMonth} at ${parsed.time}`;
    default: return cron;
  }
}

function isWarningResult(result: any): boolean {
  if (!result) return false;
  const summary = (result.summary || '').toLowerCase();
  const warningPhrases = [
    'not found', 'not active', 'not configured', 'no flowid', 'no campaignid',
    'unknown job type', 'is draft', 'is paused', 'is cancelled', 'is sent',
  ];
  return warningPhrases.some(p => summary.includes(p));
}

export default function CronJobsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formType, setFormType] = useState<CronJob['type']>('segment_refresh');
  const [formSchedule, setFormSchedule] = useState('0 * * * *');
  const [schedFreq, setSchedFreq] = useState('hourly');
  const [schedTime, setSchedTime] = useState('09:00');
  const [schedDow, setSchedDow] = useState('1');
  const [schedDom, setSchedDom] = useState('1');
  const [formFlowId, setFormFlowId] = useState('');
  const [formCampaignId, setFormCampaignId] = useState('');
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [runningJobId, setRunningJobId] = useState<string | null>(null);

  const { data: cronJobs, isLoading } = useQuery({
    queryKey: ['cron-jobs'],
    queryFn: cronJobApi.list,
  });

  const { data: flows } = useQuery({
    queryKey: ['flows'],
    queryFn: flowApi.list,
  });

  const { data: campaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignApi.list,
  });

  const { data: jobRuns } = useQuery({
    queryKey: ['cron-job-runs', expandedJobId],
    queryFn: () => cronJobApi.getRuns(expandedJobId!),
    enabled: !!expandedJobId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<CronJob>) => cronJobApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs'] });
      toast.success('Cron job created');
      resetForm();
    },
    onError: () => toast.error('Failed to create cron job'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CronJob> }) => cronJobApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs'] });
      toast.success('Cron job updated');
      resetForm();
    },
    onError: () => toast.error('Failed to update cron job'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => cronJobApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs'] });
      toast.success('Cron job deleted');
    },
    onError: () => toast.error('Failed to delete cron job'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => cronJobApi.toggle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cron-jobs'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Failed to toggle status'),
  });

  const runMutation = useMutation({
    mutationFn: (id: string) => { setRunningJobId(id); return cronJobApi.run(id); },
    onSuccess: (data: any) => {
      setRunningJobId(null);
      queryClient.invalidateQueries({ queryKey: ['cron-jobs'] });
      queryClient.invalidateQueries({ queryKey: ['cron-job-runs'] });
      const summary = data.result?.summary || 'Job executed';
      if (isWarningResult(data.result)) {
        toast(summary, { icon: '⚠️', duration: 5000 });
      } else {
        toast.success(summary, { duration: 5000 });
      }
    },
    onError: () => { setRunningJobId(null); toast.error('Failed to run job'); },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormName('');
    setFormDescription('');
    setFormType('segment_refresh');
    setFormSchedule('0 * * * *');
    setSchedFreq('hourly');
    setSchedTime('09:00');
    setSchedDow('1');
    setSchedDom('1');
    setFormFlowId('');
    setFormCampaignId('');
  };

  const populateForm = (job: CronJob) => {
    setEditingId(job._id);
    setShowForm(true);
    setFormName(job.name);
    setFormDescription(job.description || '');
    setFormType(job.type);
    setFormSchedule(job.schedule);
    const parsed = parseCron(job.schedule);
    setSchedFreq(parsed.freq);
    setSchedTime(parsed.time);
    setSchedDow(parsed.dayOfWeek);
    setSchedDom(parsed.dayOfMonth);
    setFormFlowId(job.config?.flowId || '');
    setFormCampaignId(job.config?.campaignId || '');
  };

  const updateSchedule = (freq: string, time: string, dow: string, dom: string) => {
    setSchedFreq(freq);
    setSchedTime(time);
    setSchedDow(dow);
    setSchedDom(dom);
    setFormSchedule(buildCron(freq, time, dow, dom));
  };

  const buildConfig = (): Record<string, any> => {
    switch (formType) {
      case 'flow_trigger': return { flowId: formFlowId };
      case 'campaign_send': return { campaignId: formCampaignId };
      default: return {};
    }
  };

  const handleSubmit = () => {
    if (!formName.trim()) {
      toast.error('Job name is required');
      return;
    }
    if (formType === 'flow_trigger' && !formFlowId) {
      toast.error('Please select a flow');
      return;
    }
    if (formType === 'campaign_send' && !formCampaignId) {
      toast.error('Please select a campaign');
      return;
    }

    const payload: Partial<CronJob> = {
      name: formName,
      description: formDescription,
      type: formType,
      schedule: formSchedule,
      config: buildConfig(),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  const configSummary = (job: CronJob): string => {
    if (job.type === 'flow_trigger' && job.config?.flowId) {
      const flow = flows?.find((f: Flow) => f._id === job.config.flowId);
      return flow ? flow.name : job.config.flowId;
    }
    if (job.type === 'campaign_send' && job.config?.campaignId) {
      const campaign = campaigns?.find((c: Campaign) => c._id === job.config.campaignId);
      return campaign ? campaign.name : job.config.campaignId;
    }
    return '';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Scheduled Jobs</h1>
          <p className="text-subtle mt-1">Automated and manually scheduled tasks</p>
        </div>
        <button
          onClick={() => { if (showForm) resetForm(); else setShowForm(true); }}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? 'Cancel' : 'Create Job'}
        </button>
      </div>

      <PageHint storageKey="scheduled-jobs" lines={[
        'Jobs marked "Auto" are created and managed by their parent flow or campaign. They sync automatically when you activate, pause, or delete the source.',
        'Manual jobs can be created for advanced use cases like segment refresh.',
        'Expand any row to see its run history \u2014 every execution is logged with status, result, and duration.',
      ]} />

      {showForm && (
        <div className="bg-card rounded-lg border border-line p-6 mb-6">
          <h3 className="text-lg font-semibold text-heading mb-4">
            {editingId ? 'Edit Cron Job' : 'New Cron Job'}
          </h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-body mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Refresh Active Users"
                  className={`w-full ${inputClass}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Type</label>
                <select
                  value={formType}
                  onChange={(e) => {
                    setFormType(e.target.value as CronJob['type']);
                    setFormFlowId('');
                    setFormCampaignId('');
                  }}
                  className={`w-full ${inputClass}`}
                >
                  <option value="segment_refresh">Segment Refresh</option>
                  <option value="flow_trigger">Flow Trigger</option>
                  <option value="campaign_send">Campaign Send</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What does this job do?"
                className={`w-full ${inputClass}`}
              />
            </div>

            {formType === 'flow_trigger' && (
              <div>
                <label className="block text-sm font-medium text-body mb-1">Flow</label>
                <select
                  value={formFlowId}
                  onChange={(e) => setFormFlowId(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  <option value="">Select a flow...</option>
                  {flows?.map((f: Flow) => (
                    <option key={f._id} value={f._id}>
                      {f.name} ({f.status})
                    </option>
                  ))}
                </select>
                {formFlowId && flows?.find((f: Flow) => f._id === formFlowId)?.status !== 'active' && (
                  <p className="text-xs text-yellow-500 mt-1">This flow is not active — it won't execute until activated.</p>
                )}
              </div>
            )}

            {formType === 'campaign_send' && (
              <div>
                <label className="block text-sm font-medium text-body mb-1">Campaign</label>
                <select
                  value={formCampaignId}
                  onChange={(e) => setFormCampaignId(e.target.value)}
                  className={`w-full ${inputClass}`}
                >
                  <option value="">Select a campaign...</option>
                  {campaigns?.map((c: Campaign) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.status})
                    </option>
                  ))}
                </select>
                {formCampaignId && campaigns?.find((c: Campaign) => c._id === formCampaignId)?.status !== 'scheduled' && (
                  <p className="text-xs text-yellow-500 mt-1">This campaign is not scheduled — it must be in "scheduled" status to send.</p>
                )}
              </div>
            )}

            {formType === 'segment_refresh' && (
              <p className="text-sm text-subtle bg-elevated rounded-md px-3 py-2">
                Refreshes subscriber counts for all segments. No additional configuration needed.
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-body mb-2">Schedule</label>
              <div className="flex items-center gap-3 flex-wrap">
                <select value={schedFreq} onChange={e => updateSchedule(e.target.value, schedTime, schedDow, schedDom)} className={inputClass}>
                  {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                {schedFreq !== 'hourly' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-subtle">at</span>
                    <input type="time" value={schedTime} onChange={e => updateSchedule(schedFreq, e.target.value, schedDow, schedDom)} className={inputClass} />
                  </div>
                )}
                {schedFreq === 'weekly' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-subtle">on</span>
                    <select value={schedDow} onChange={e => updateSchedule(schedFreq, schedTime, e.target.value, schedDom)} className={inputClass}>
                      {DAYS_OF_WEEK.map((d, i) => <option key={i} value={String(i)}>{d}</option>)}
                    </select>
                  </div>
                )}
                {schedFreq === 'monthly' && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-subtle">on day</span>
                    <select value={schedDom} onChange={e => updateSchedule(schedFreq, schedTime, schedDow, e.target.value)} className={inputClass}>
                      {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={String(i + 1)}>{i + 1}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <p className="text-xs text-dim font-mono mt-2">{formSchedule}</p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={resetForm} className="px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated">
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isSaving}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : editingId ? 'Update Job' : 'Create Job'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : !cronJobs || cronJobs.length === 0 ? (
        <div className="bg-card rounded-lg border border-line p-12 text-center">
          <Timer className="w-12 h-12 text-dim mx-auto mb-3" />
          <p className="text-subtle">No cron jobs created yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Target</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Schedule</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Last Run</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-subtle uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cronJobs.map((job: CronJob) => (
                <React.Fragment key={job._id}>
                  <tr className="hover:bg-elevated/50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setExpandedJobId(expandedJobId === job._id ? null : job._id)}
                          className="p-0.5 text-dim hover:text-heading rounded"
                        >
                          {expandedJobId === job._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-heading">{job.name}</span>
                            {(job as any).auto_managed && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/15 text-blue-500">Auto</span>
                            )}
                          </div>
                          {job.description && (
                            <div className="text-xs text-subtle mt-0.5">{job.description}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-zinc-500/15 text-subtle">
                        {job.type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-body">
                        {configSummary(job) || <span className="text-dim">—</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-body">
                        <Clock className="w-3.5 h-3.5 mr-1.5 text-dim" />
                        {humanReadableSchedule(job.schedule)}
                      </div>
                      <div className="text-xs text-dim font-mono mt-0.5">{job.schedule}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[job.status] || 'bg-zinc-500/15 text-subtle'}`}>
                        {job.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-subtle">
                      {job.last_run_at ? new Date(job.last_run_at).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => populateForm(job)}
                          className="p-1.5 text-dim hover:text-blue-500 rounded"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleMutation.mutate(job._id)}
                          disabled={toggleMutation.isPending}
                          className={`p-1.5 rounded ${job.status === 'active' ? 'text-yellow-500 hover:text-yellow-400' : 'text-green-500 hover:text-green-400'}`}
                          title={job.status === 'active' ? 'Pause' : 'Activate'}
                        >
                          {job.status === 'active' ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => runMutation.mutate(job._id)}
                          disabled={runningJobId !== null}
                          className="inline-flex items-center px-2 py-1 text-xs border border-blue-500/30 text-blue-500 rounded hover:bg-blue-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Run Now"
                        >
                          {runningJobId === job._id ? (
                            <>
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500 mr-1" />
                              Running...
                            </>
                          ) : 'Run'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this cron job?')) deleteMutation.mutate(job._id);
                          }}
                          className="p-1.5 text-dim hover:text-red-500 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedJobId === job._id && (
                    <tr>
                      <td colSpan={7} className="px-6 py-4 bg-elevated/30">
                        <div className="flex items-center gap-2 mb-3">
                          <History className="w-4 h-4 text-subtle" />
                          <span className="text-sm font-semibold text-heading">Run History</span>
                        </div>
                        {!jobRuns || jobRuns.length === 0 ? (
                          <p className="text-sm text-subtle py-2">No runs recorded yet. Click "Run" to execute this job.</p>
                        ) : (
                          <div className="space-y-1.5">
                            {(jobRuns as CronJobRun[]).map((run) => {
                              const runStatusColors: Record<string, string> = {
                                success: 'bg-green-500/15 text-green-500',
                                warning: 'bg-yellow-500/15 text-yellow-500',
                                error: 'bg-red-500/15 text-red-500',
                              };
                              return (
                                <div key={run._id} className="flex items-center gap-3 px-3 py-2 rounded-md bg-card border border-line">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${runStatusColors[run.status] || ''}`}>
                                    {run.status}
                                  </span>
                                  <span className="text-sm text-body flex-1">{run.summary}</span>
                                  <span className="text-xs text-dim">{run.duration_ms}ms</span>
                                  <span className="text-xs text-subtle">
                                    {new Date(run.ran_at).toLocaleString()}
                                  </span>
                                  {run.details?.flowId && (
                                    <Link
                                      to={`/flows/${run.details.flowId}`}
                                      className="text-xs text-blue-500 hover:underline"
                                    >
                                      View Flow
                                    </Link>
                                  )}
                                  {run.details?.campaignId && (
                                    <Link
                                      to={`/campaigns/${run.details.campaignId}`}
                                      className="text-xs text-blue-500 hover:underline"
                                    >
                                      View Campaign
                                    </Link>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
