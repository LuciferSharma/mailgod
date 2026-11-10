import { Handle, Position } from '@xyflow/react';
import { Shuffle } from 'lucide-react';

export default function ABSplitNode({ data, selected }: { data: any; selected?: boolean }) {
  const pct = data.splitPercentage || 50;

  return (
    <div className={`rounded-xl w-[240px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-violet-500/60 shadow-lg shadow-violet-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-violet-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-violet-500 to-purple-600 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Shuffle className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">A/B SPLIT</span>
      </div>
      <div className="bg-zinc-900 border-x border-zinc-700/50 px-4 py-3">
        <div className="flex gap-2">
          <div className="flex-1 bg-violet-500/10 border border-violet-500/20 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-violet-300 tabular-nums">{pct}%</p>
            <p className="text-[10px] font-semibold text-violet-500 uppercase">Path A</p>
          </div>
          <div className="flex-1 bg-purple-500/10 border border-purple-500/20 rounded-lg p-2 text-center">
            <p className="text-lg font-bold text-purple-300 tabular-nums">{100 - pct}%</p>
            <p className="text-[10px] font-semibold text-purple-500 uppercase">Path B</p>
          </div>
        </div>
      </div>
      <div className="bg-zinc-800/50 rounded-b-xl border-x border-b border-zinc-700/50 px-4 py-2 flex justify-between">
        <span className="text-xs font-bold text-violet-400">A</span>
        <span className="text-xs font-bold text-purple-400">B</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="a" style={{ left: '25%' }} className="!bg-violet-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
      <Handle type="source" position={Position.Bottom} id="b" style={{ left: '75%' }} className="!bg-purple-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
