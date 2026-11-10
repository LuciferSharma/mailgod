import { Handle, Position } from '@xyflow/react';
import { Mail } from 'lucide-react';

export default function EmailNode({ data, selected }: { data: any; selected?: boolean }) {
  return (
    <div className={`rounded-xl w-[240px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-blue-500/60 shadow-lg shadow-blue-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-top-[7px]" />
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Mail className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">SEND EMAIL</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-3 border-x border-b border-zinc-700/50 space-y-1.5">
        {data.templateName ? (
          <>
            <p className="text-xs font-medium text-zinc-200 truncate">{data.templateName}</p>
            {data.subject && <p className="text-[11px] text-zinc-500 truncate">{data.subject}</p>}
          </>
        ) : (
          <p className="text-xs text-zinc-500 italic">Select a template...</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-blue-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
