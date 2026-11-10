import { Handle, Position } from '@xyflow/react';
import { Clock } from 'lucide-react';

export default function DelayNode({ data, selected }: { data: any; selected?: boolean }) {
  const delay = data.delay || { value: 1, unit: 'days' };

  return (
    <div className={`rounded-xl w-[200px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-slate-400/60 shadow-lg shadow-slate-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-slate-600 to-zinc-700 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Clock className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">DELAY</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-3 border-x border-b border-zinc-700/50">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-bold text-zinc-100 tabular-nums">{delay.value}</span>
          <span className="text-xs font-medium text-zinc-500 uppercase">{delay.unit}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
