import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Send, Pause, XCircle, Calendar, Megaphone, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { campaignApi, segmentApi, templateApi } from '../api';
import type { Campaign, Segment, Template } from '../types';
import PageHint from '../components/PageHint';

const statusColors: Record<string, string> = {
  draft: 'bg-zinc-500/15 text-subtle',
  scheduled: 'bg-yellow-500/15 text-yellow-500',
  sending: 'bg-blue-500/15 text-blue-500',
  paused: 'bg-yellow-500/15 text-yellow-500',
  sent: 'bg-green-500/15 text-green-500',
  cancelled: 'bg-red-500/15 text-red-500',
};

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

export default function CampaignsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState(1);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [sendingCampaignId, setSendingCampaignId] = useState<string | null>(null);

  const [formName, setFormName] = useState('');
  const [formSubject, setFormSubject] = useState('');
  const [formSegmentId, setFormSegmentId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [formBatchSize, setFormBatchSize] = useState(100);
  const [formEmailsPerHour, setFormEmailsPerHour] = useState(1000);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ['campaigns'],
    queryFn: campaignApi.list,
    refetchInterval: (query) => {
      const data = query.state.data as any[] | undefined;
      const anySending = data?.some((c: any) => c.status === 'sending' || c.status === 'scheduled');
      return anySending ? 3000 : 30000;
    },
  });

  const { data: segments } = useQuery({
    queryKey: ['segments'],
    queryFn: segmentApi.list,
    enabled: showForm,
  });

  const { data: templates } = useQuery({
    queryKey: ['templates'],
    queryFn: templateApi.list,
    enabled: showForm,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Campaign>) => campaignApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created');
      resetForm();
    },
    onError: () => toast.error('Failed to create campaign'),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => {
      setSendingCampaignId(id);
      return campaignApi.send(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign sending started');
      setSendingCampaignId(null);
    },
    onError: () => {
      toast.error('Failed to send campaign');
      setSendingCampaignId(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => campaignApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign paused');
    },
    onError: () => toast.error('Failed to pause campaign'),
  });

  const resumeMutation = useMutation({
    mutationFn: (id: string) => campaignApi.resume(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign resumed');
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to resume campaign'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => campaignApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign cancelled');
    },
    onError: () => toast.error('Failed to cancel campaign'),
  });

  const scheduleMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => campaignApi.schedule(id, date),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign scheduled');
    },
    onError: () => toast.error('Failed to schedule campaign'),
  });

  const resetForm = () => {
    setShowForm(false);
    setStep(1);
    setFormName('');
    setFormSubject('');
    setFormSegmentId('');
    setFormTemplateId('');
    setFormBatchSize(100);
    setFormEmailsPerHour(1000);
  };

  const handleCreate = () => {
    createMutation.mutate({
      name: formName,
      subject: formSubject,
      segment_id: formSegmentId,
      template_id: formTemplateId,
      send_config: {
        batch_size: formBatchSize,
        emails_per_hour: formEmailsPerHour,
      },
    });
  };

  const canNext = () => {
    switch (step) {
      case 1: return formName.trim() && formSubject.trim();
      case 2: return !!formSegmentId;
      case 3: return !!formTemplateId;
      case 4: return formBatchSize > 0 && formEmailsPerHour > 0;
      default: return false;
    }
  };

  const segmentMap = (segments || []).reduce((acc: Record<string, string>, s: Segment) => {
    acc[s._id] = s.name;
    return acc;
  }, {});

  const templateMap = (templates || []).reduce((acc: Record<string, string>, t: Template) => {
    acc[t._id] = t.name;
    return acc;
  }, {});

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Campaigns</h1>
          <p className="text-subtle mt-1">Email campaigns</p>
        </div>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          {showForm ? 'Cancel' : 'Create Campaign'}
        </button>
      </div>

      <PageHint storageKey="campaigns" lines={[
        'A campaign sends a one-time email to a segment. Pick a segment (who) and a template (what).',
        'Campaigns must be "scheduled" before they can be sent. Use "Send Now" or schedule a date.',
        'Track real-time progress on the campaign detail page — click the campaign name after sending.',
      ]} />

      {showForm && (
        <div className="bg-card rounded-lg border border-line p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-heading">New Campaign</h3>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4].map(s => (
                <div
                  key={s}
                  className={`w-8 h-1.5 rounded-full ${s <= step ? 'bg-blue-600' : 'bg-elevated'}`}
                />
              ))}
            </div>
          </div>

          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-subtle">Step 1: Name & Subject</p>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Campaign Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., April Newsletter"
                  className={`w-full ${inputClass}`}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-body mb-1">Subject Line</label>
                <input
                  type="text"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Email subject..."
                  className={`w-full ${inputClass}`}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-subtle">Step 2: Select Segment</p>
              <select
                value={formSegmentId}
                onChange={(e) => setFormSegmentId(e.target.value)}
                className={`w-full ${inputClass}`}
              >
                <option value="">Choose a segment...</option>
                {(segments || []).map((s: Segment) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.subscriber_count} subscribers)
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-subtle">Step 3: Select Template</p>
              <select
                value={formTemplateId}
                onChange={(e) => setFormTemplateId(e.target.value)}
                className={`w-full ${inputClass}`}
              >
                <option value="">Choose a template...</option>
                {(templates || []).map((t: Template) => (
                  <option key={t._id} value={t._id}>
                    {t.name} - {t.subject}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-subtle">Step 4: Send Configuration</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-body mb-1">Batch Size</label>
                  <input
                    type="number"
                    value={formBatchSize}
                    onChange={(e) => setFormBatchSize(Number(e.target.value))}
                    min={1}
                    className={`w-full ${inputClass}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-body mb-1">Emails per Hour</label>
                  <input
                    type="number"
                    value={formEmailsPerHour}
                    onChange={(e) => setFormEmailsPerHour(Number(e.target.value))}
                    min={1}
                    className={`w-full ${inputClass}`}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-between mt-6 pt-4 border-t border-line">
            <button
              onClick={() => step > 1 ? setStep(step - 1) : resetForm()}
              className="px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated"
            >
              {step === 1 ? 'Cancel' : 'Back'}
            </button>
            {step < 4 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canNext()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create Campaign'}
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : !campaigns || campaigns.length === 0 ? (
        <div className="bg-card rounded-lg border border-line p-12 text-center">
          <Megaphone className="w-12 h-12 text-dim mx-auto mb-3" />
          <p className="text-subtle">No campaigns created yet.</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-line overflow-hidden">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-elevated">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Campaign</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Segment</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Stats</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Scheduled</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-subtle uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {campaigns.map((campaign: Campaign) => (
                <tr key={campaign._id} className="hover:bg-elevated/50">
                  <td className="px-6 py-4">
                    <button
                      onClick={() => navigate(`/campaigns/${campaign._id}`)}
                      className="text-sm font-medium text-link hover:underline"
                    >
                      {campaign.name}
                    </button>
                    <div className="text-xs text-subtle mt-0.5">{campaign.subject}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[campaign.status] || 'bg-zinc-500/15 text-subtle'}`}>
                      {campaign.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-subtle">
                    {typeof campaign.segment_id === 'object' ? (campaign.segment_id as any)?.name : (segmentMap[campaign.segment_id] || campaign.segment_id)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-xs text-subtle space-x-2">
                      <span>{campaign.stats.sent} sent</span>
                      <span>{campaign.stats.opened} opened</span>
                      <span>{campaign.stats.clicked} clicked</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-subtle">
                    {campaign.scheduled_at
                      ? new Date(campaign.scheduled_at).toLocaleString()
                      : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {(campaign.status === 'draft' || campaign.status === 'scheduled') && (
                        <button
                          onClick={() => sendMutation.mutate(campaign._id)}
                          disabled={sendMutation.isPending}
                          className="inline-flex items-center px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Send Now"
                        >
                          {sendingCampaignId === campaign._id ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending...</>
                          ) : (
                            <><Send className="w-3 h-3 mr-1" /> Send</>
                          )}
                        </button>
                      )}
                      {campaign.status === 'draft' && schedulingId !== campaign._id && (
                        <button
                          onClick={() => {
                            setSchedulingId(campaign._id);
                            const d = new Date();
                            d.setHours(d.getHours() + 1, 0, 0, 0);
                            setScheduleDate(d.toISOString().slice(0, 16));
                          }}
                          className="inline-flex items-center px-2 py-1 text-xs border border-yellow-500/30 text-yellow-500 rounded hover:bg-yellow-500/10"
                          title="Schedule"
                        >
                          <Calendar className="w-3 h-3 mr-1" /> Schedule
                        </button>
                      )}
                      {campaign.status === 'draft' && schedulingId === campaign._id && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            className={`text-xs w-[180px] ${inputClass}`}
                          />
                          <button
                            onClick={() => {
                              if (scheduleDate) {
                                scheduleMutation.mutate({ id: campaign._id, date: new Date(scheduleDate).toISOString() });
                                setSchedulingId(null);
                              }
                            }}
                            disabled={!scheduleDate || scheduleMutation.isPending}
                            className="px-2 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setSchedulingId(null)}
                            className="px-2 py-1 text-xs border border-line text-subtle rounded hover:bg-elevated"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {campaign.status === 'sending' && (
                        <button
                          onClick={() => pauseMutation.mutate(campaign._id)}
                          disabled={pauseMutation.isPending}
                          className="inline-flex items-center px-2 py-1 text-xs border border-yellow-500/30 text-yellow-500 rounded hover:bg-yellow-500/10"
                          title="Pause"
                        >
                          <Pause className="w-3 h-3 mr-1" /> Pause
                        </button>
                      )}
                      {campaign.status === 'paused' && (
                        <button
                          onClick={() => resumeMutation.mutate(campaign._id)}
                          disabled={resumeMutation.isPending}
                          className="inline-flex items-center px-2 py-1 text-xs border border-blue-500/30 text-blue-500 rounded hover:bg-blue-500/10"
                          title="Resume"
                        >
                          <Send className="w-3 h-3 mr-1" /> Resume
                        </button>
                      )}
                      {(campaign.status === 'sending' || campaign.status === 'scheduled' || campaign.status === 'paused') && (
                        <button
                          onClick={() => {
                            if (confirm('Cancel this campaign?')) cancelMutation.mutate(campaign._id);
                          }}
                          disabled={cancelMutation.isPending}
                          className="inline-flex items-center px-2 py-1 text-xs border border-red-500/30 text-red-500 rounded hover:bg-red-500/10"
                          title="Cancel"
                        >
                          <XCircle className="w-3 h-3 mr-1" /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
