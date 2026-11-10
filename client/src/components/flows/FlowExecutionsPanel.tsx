import { useQuery } from '@tanstack/react-query';
import { Users, X, RefreshCw } from 'lucide-react';
import { flowApi } from '../../api';
import type { FlowExecution } from '../../types';

interface FlowExecutionsPanelProps {
  flowId: string;
  onClose: () => void;
}

const statusBadge: Record<string, string> = {
  running: 'bg-blue-500/15 text-blue-400',
  completed: 'bg-emerald-500/15 text-emerald-400',
  failed: 'bg-red-500/15 text-red-400',
  exited: 'bg-zinc-600/20 text-zinc-400',
};

export default function FlowExecutionsPanel({ flowId, onClose }: FlowExecutionsPanelProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['flow-executions', flowId],
    queryFn: () => flowApi.getExecutions(flowId),
    refetchInterval: 10000,
  });

  const executions: FlowExecution[] = data?.data || [];

  return (
    <div className="bg-zinc-900 border-t border-zinc-800 h-64 flex flex-col shrink-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-300">
            Executions {data?.total != null && <span className="text-zinc-500">({data.total})</span>}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => refetch()}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
          </div>
        ) : executions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-600 text-sm">
            <Users className="w-8 h-8 mb-2" />
            <p>No executions yet</p>
            <p className="text-xs text-zinc-700 mt-1">Enroll subscribers to see their journeys</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-800/50 sticky top-0">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Subscriber</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Current Node</th>
                <th className="px-4 py-2 text-left text-xs font-medium text-zinc-500 uppercase">Entered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {executions.map((exec) => (
                <tr key={exec._id} className="hover:bg-zinc-800/30">
                  <td className="px-4 py-2">
                    <div className="text-zinc-300">{exec.subscriber_id?.email || 'Unknown'}</div>
                    {exec.subscriber_id?.name && (
                      <div className="text-xs text-zinc-600">{exec.subscriber_id.name}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge[exec.status] || statusBadge.exited}`}>
                      {exec.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-zinc-500 text-xs font-mono">
                    {exec.current_node_id || '—'}
                  </td>
                  <td className="px-4 py-2 text-zinc-500 text-xs">
                    {new Date(exec.entered_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
