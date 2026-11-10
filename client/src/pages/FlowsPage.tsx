import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, Edit, Play, Pause, GitBranch, ChevronUp, Users, Copy,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { flowApi } from '../api';
import type { Flow } from '../types';
import ExecutionsModal from '../components/flows/ExecutionsModal';
import PageHint from '../components/PageHint';

const statusColors: Record<string, string> = {
  draft: 'bg-zinc-500/15 text-subtle',
  active: 'bg-green-500/15 text-green-500',
  paused: 'bg-yellow-500/15 text-yellow-500',
};

const inputClass = 'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

function formatTriggerSchedule(config: Record<string, any>): string {
  const freq = config?.frequency || 'daily';
  const time = config?.time || '09:00';
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  switch (freq) {
    case 'hourly': return 'Every hour';
    case 'weekly': return `${dow[parseInt(config?.dayOfWeek || '1')]} at ${time}`;
    case 'monthly': return `Day ${config?.dayOfMonth || '1'} at ${time}`;
    default: return `Daily at ${time}`;
  }
}

export default function FlowsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [execModalFlow, setExecModalFlow] = useState<Flow | null>(null);

  const { data: flows, isLoading } = useQuery({
    queryKey: ['flows'],
    queryFn: flowApi.list,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Flow>) => flowApi.create(data),
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow created');
      setShowForm(false);
      setFormName('');
      setFormDescription('');
      navigate(`/flows/${flow._id}`);
    },
    onError: () => toast.error('Failed to create flow'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => flowApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow deleted');
    },
    onError: () => toast.error('Failed to delete flow'),
  });

  const activateMutation = useMutation({
    mutationFn: (id: string) => flowApi.activate(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow activated');
    },
    onError: () => toast.error('Failed to activate flow'),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => flowApi.pause(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow paused');
    },
    onError: () => toast.error('Failed to pause flow'),
  });

  const duplicateMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => flowApi.duplicate(id, name),
    onSuccess: (flow) => {
      queryClient.invalidateQueries({ queryKey: ['flows'] });
      toast.success('Flow duplicated');
      navigate(`/flows/${flow._id}`);
    },
    onError: () => toast.error('Failed to duplicate flow'),
  });

  const handleDuplicate = (flow: Flow) => {
    const suggested = `${flow.name} (copy)`;
    const name = window.prompt('Name for the duplicated flow:', suggested);
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    duplicateMutation.mutate({ id: flow._id, name: trimmed });
  };

  const handleCreate = () => {
    if (!formName.trim()) {
      toast.error('Flow name is required');
      return;
    }
    createMutation.mutate({
      name: formName,
      description: formDescription,
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Flows</h1>
          <p className="text-subtle mt-1">Automation flows</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
        >
          {showForm ? <ChevronUp className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
          {showForm ? 'Cancel' : 'Create Flow'}
        </button>
      </div>

      <PageHint storageKey="flows-v2" lines={[
        'Set trigger to "Scheduled" with a segment and frequency, then activate \u2014 the platform will automatically check for new subscribers on your schedule.',
        'Use "Manual" trigger if you only want to enroll subscribers by hand via the "Enroll Segment" button.',
        'Check the "Executions" button on each flow card to see who entered, where they are, and what happened.',
      ]} />

      {showForm && (
        <div className="bg-card rounded-lg border border-line p-6 mb-6">
          <h3 className="text-lg font-semibold text-heading mb-4">New Flow</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Name</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g., Welcome Onboarding"
                className={`w-full ${inputClass}`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Description</label>
              <input
                type="text"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Describe this automation..."
                className={`w-full ${inputClass}`}
              />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setShowForm(false); setFormName(''); setFormDescription(''); }}
                className="px-4 py-2 text-sm border border-line rounded-md text-body hover:bg-elevated"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {createMutation.isPending ? 'Creating...' : 'Create & Open Builder'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="bg-card rounded-lg border border-line p-12 text-center">
          <GitBranch className="w-12 h-12 text-dim mx-auto mb-3" />
          <p className="text-subtle">No flows created yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow: Flow) => (
            <div key={flow._id} className="bg-card rounded-lg border border-line p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-heading truncate">{flow.name}</h3>
                  {flow.description && (
                    <p className="text-xs text-subtle mt-0.5 truncate">{flow.description}</p>
                  )}
                </div>
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[flow.status] || 'bg-zinc-500/15 text-subtle'}`}>
                  {flow.status}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-4 text-center">
                <div className="bg-elevated rounded p-2">
                  <p className="text-sm font-bold text-heading tabular-nums">{flow.stats.enrolled}</p>
                  <p className="text-[10px] text-subtle uppercase tracking-wider">Enrolled</p>
                </div>
                <div className="bg-elevated rounded p-2">
                  <p className="text-sm font-bold text-emerald-500 tabular-nums">{flow.stats.active}</p>
                  <p className="text-[10px] text-subtle uppercase tracking-wider">Active</p>
                </div>
                <div
                  className="bg-elevated rounded p-2"
                  title="Subscribers removed by exit-on-reply (they replied) or exit conditions"
                >
                  <p className="text-sm font-bold text-blue-500 tabular-nums">{flow.stats.exited ?? 0}</p>
                  <p className="text-[10px] text-subtle uppercase tracking-wider">Exited</p>
                </div>
                <div className="bg-elevated rounded p-2">
                  <p className="text-sm font-bold text-heading tabular-nums">{flow.stats.completed}</p>
                  <p className="text-[10px] text-subtle uppercase tracking-wider">Done</p>
                </div>
              </div>

              <div className="text-xs text-dim mb-4">
                {flow.trigger.type === 'scheduled' ? (
                  <span className="text-blue-500 font-medium">
                    Scheduled: {formatTriggerSchedule(flow.trigger.config)}
                  </span>
                ) : (
                  <span>Manual trigger</span>
                )}
                <span className="mx-1">|</span>
                Created {new Date(flow.created_at).toLocaleDateString()}
              </div>

              <div className="flex items-center gap-2 border-t border-line pt-3">
                <button
                  onClick={() => navigate(`/flows/${flow._id}`)}
                  className="inline-flex items-center px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  <Edit className="w-3 h-3 mr-1" /> Edit
                </button>
                <button
                  onClick={() => setExecModalFlow(flow)}
                  className="inline-flex items-center px-3 py-1.5 text-xs border border-zinc-500/30 text-subtle rounded hover:bg-elevated"
                >
                  <Users className="w-3 h-3 mr-1" /> Executions
                </button>
                <button
                  onClick={() => handleDuplicate(flow)}
                  disabled={duplicateMutation.isPending}
                  className="inline-flex items-center px-3 py-1.5 text-xs border border-zinc-500/30 text-subtle rounded hover:bg-elevated disabled:opacity-50"
                  title="Duplicate this flow as a draft"
                >
                  <Copy className="w-3 h-3 mr-1" /> Duplicate
                </button>
                {flow.status === 'active' ? (
                  <button
                    onClick={() => pauseMutation.mutate(flow._id)}
                    disabled={pauseMutation.isPending}
                    className="inline-flex items-center px-3 py-1.5 text-xs border border-yellow-500/30 text-yellow-500 rounded hover:bg-yellow-500/10"
                  >
                    <Pause className="w-3 h-3 mr-1" /> Pause
                  </button>
                ) : (
                  <button
                    onClick={() => activateMutation.mutate(flow._id)}
                    disabled={activateMutation.isPending}
                    className="inline-flex items-center px-3 py-1.5 text-xs border border-green-500/30 text-green-500 rounded hover:bg-green-500/10"
                  >
                    <Play className="w-3 h-3 mr-1" /> Activate
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm('Delete this flow?')) deleteMutation.mutate(flow._id);
                  }}
                  className="ml-auto p-1.5 text-dim hover:text-red-500 rounded"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {execModalFlow && (
        <ExecutionsModal
          flowId={execModalFlow._id}
          flowName={execModalFlow.name}
          onClose={() => setExecModalFlow(null)}
        />
      )}
    </div>
  );
}
