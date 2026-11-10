import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, RefreshCw, Users, ChevronDown, ChevronRight } from 'lucide-react';
import { flowApi } from '../../api';
import type { FlowExecution } from '../../types';
import ExecutionHistoryTimeline from './ExecutionHistoryTimeline';

interface ExecutionsModalProps {
  flowId: string;
  flowName: string;
  onClose: () => void;
}

const statusBadge: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  exited: 'bg-zinc-600/20 text-zinc-400',
};

export default function ExecutionsModal({ flowId, flowName, onClose }: ExecutionsModalProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['flow-executions', flowId],
    queryFn: () => flowApi.getExecutions(flowId),
    refetchInterval: 10000,
  });

  const executions: FlowExecution[] = data?.data || [];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-card rounded-lg border border-line w-full max-w-4xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-line shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-heading">Flow Executions</h2>
            <p className="text-sm text-subtle">{flowName} — {data?.total || 0} total</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => refetch()}
              className="p-1.5 rounded text-subtle hover:text-heading hover:bg-elevated"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 rounded text-subtle hover:text-heading hover:bg-elevated">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
            </div>
          ) : executions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-subtle">
              <Users className="w-10 h-10 mb-2 text-dim" />
              <p>No executions yet</p>
              <p className="text-xs text-dim mt-1">Enroll subscribers to see their journeys</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-elevated sticky top-0">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider w-8" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Subscriber</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Current Node</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Entered</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-subtle uppercase tracking-wider">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {executions.map((exec) => (
                  <tr key={exec._id} className="group">
                    <td colSpan={6} className="p-0">
                      <div
                        className="flex items-center cursor-pointer hover:bg-elevated/50 px-6 py-3"
                        onClick={() => setExpandedId(expandedId === exec._id ? null : exec._id)}
                      >
                        <div className="w-8 shrink-0">
                          {expandedId === exec._id
                            ? <ChevronDown className="w-4 h-4 text-dim" />
                            : <ChevronRight className="w-4 h-4 text-dim" />
                          }
                        </div>
                        <div className="flex-1 min-w-0 px-4">
                          <div className="text-sm text-heading">{exec.subscriber_id?.email || 'Unknown'}</div>
                          {exec.subscriber_id?.name && (
                            <div className="text-xs text-subtle">{exec.subscriber_id.name}</div>
                          )}
                        </div>
                        <div className="px-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[exec.status] || statusBadge.exited}`}>
                            {exec.status}
                          </span>
                        </div>
                        <div className="px-4 text-xs text-subtle font-mono w-32 truncate">
                          {exec.current_node_id || '—'}
                        </div>
                        <div className="px-4 text-xs text-subtle w-40">
                          {new Date(exec.entered_at).toLocaleString()}
                        </div>
                        <div className="px-4 text-xs text-subtle w-40">
                          {exec.completed_at ? new Date(exec.completed_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      {expandedId === exec._id && (
                        <div className="px-6 pb-4 bg-elevated/30">
                          <ExecutionHistoryTimeline history={exec.history} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
