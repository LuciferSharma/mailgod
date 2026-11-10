import { Handle, Position } from '@xyflow/react';
import { Globe, ArrowUpRight } from 'lucide-react';

export default function WebhookNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className={`rounded-xl w-[220px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-teal-500/60 shadow-lg shadow-teal-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-teal-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-teal-500 to-cyan-500 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Globe className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">WEBHOOK</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-3 border-x border-b border-zinc-700/50">
        {data.webhookUrl ? (
          <div className="flex items-center gap-2">
            <ArrowUpRight className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <p className="text-xs font-mono text-zinc-400 truncate">{data.webhookUrl}</p>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">Set webhook URL...</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-teal-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
