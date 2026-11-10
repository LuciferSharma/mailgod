import { Handle, Position } from '@xyflow/react';
import { GitBranch, Check, X } from 'lucide-react';

export default function ConditionNode({ data, selected }: { data: any; selected?: boolean }) {
  const cond = data.condition || {};
  const hasCondition = !!cond.field;

  return (
    <div className={`rounded-xl w-[240px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-amber-500/60 shadow-lg shadow-amber-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <GitBranch className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">CONDITION</span>
      </div>
      <div className="bg-zinc-900 border-x border-zinc-700/50 px-4 py-3">
        {hasCondition ? (
          <p className="text-xs text-zinc-300 font-mono">
            <span className="text-amber-400">{cond.field}</span>
            <span className="text-zinc-600 mx-1">{cond.operator}</span>
            <span className="text-zinc-200">{String(cond.value)}</span>
          </p>
        ) : (
          <p className="text-xs text-zinc-600 italic">Set up condition...</p>
        )}
      </div>
      <div className="bg-zinc-800/50 rounded-b-xl border-x border-b border-zinc-700/50 px-4 py-2 flex justify-between">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <Check className="w-3 h-3 text-emerald-400" />
          </div>
          <span className="text-[11px] font-semibold text-emerald-400">Yes</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-red-400">No</span>
          <div className="w-5 h-5 rounded-full bg-red-500/15 flex items-center justify-center">
            <X className="w-3 h-3 text-red-400" />
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" style={{ left: '25%' }} className="!bg-emerald-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
      <Handle type="source" position={Position.Bottom} id="false" style={{ left: '75%' }} className="!bg-red-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
