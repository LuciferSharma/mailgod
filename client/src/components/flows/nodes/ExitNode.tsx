import { Handle, Position } from '@xyflow/react';
import { LogOut } from 'lucide-react';

export default function ExitNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className={`rounded-xl w-[180px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-red-500/60 shadow-lg shadow-red-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-red-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-red-500 to-rose-500 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <LogOut className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">EXIT</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-2.5 border-x border-b border-zinc-700/50">
        <p className="text-xs text-zinc-600">End of flow path</p>
      </div>
    </div>
  );
}
