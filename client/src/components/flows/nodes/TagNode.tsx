import { Handle, Position } from '@xyflow/react';
import { Tag, Plus, Minus } from 'lucide-react';

export default function TagNode({ data, selected }: { data: any; selected?: boolean }) {
  const isAdd = data.action !== 'remove';
  const ActionIcon = isAdd ? Plus : Minus;

  return (
    <div className={`rounded-xl w-[220px] transition-all duration-200 ${
      selected
        ? `ring-2 ${isAdd ? 'ring-orange-500/60 shadow-orange-500/10' : 'ring-rose-500/60 shadow-rose-500/10'} shadow-lg`
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className={`!w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px] ${isAdd ? '!bg-orange-500' : '!bg-rose-500'}`} />
      <div className={`bg-gradient-to-r ${isAdd ? 'from-orange-500 to-amber-500' : 'from-rose-500 to-orange-500'} rounded-t-xl px-4 py-2.5 flex items-center gap-2.5`}>
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Tag className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">{isAdd ? 'ADD' : 'REMOVE'} TAG</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-3 border-x border-b border-zinc-700/50">
        {data.tag ? (
          <div className="flex items-center gap-2">
            <div className={`p-1 rounded ${isAdd ? 'bg-orange-500/15' : 'bg-rose-500/15'}`}>
              <ActionIcon className={`w-3 h-3 ${isAdd ? 'text-orange-400' : 'text-rose-400'}`} />
            </div>
            <span className="px-2.5 py-1 bg-zinc-800 rounded-md text-xs font-mono font-medium text-zinc-300 border border-zinc-700/50">{data.tag}</span>
          </div>
        ) : (
          <p className="text-xs text-zinc-600 italic">Set tag name...</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className={`!w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px] ${isAdd ? '!bg-orange-500' : '!bg-rose-500'}`} />
    </div>
  );
}
