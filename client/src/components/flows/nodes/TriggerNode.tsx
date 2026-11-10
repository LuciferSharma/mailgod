import { Handle, Position } from '@xyflow/react';
import { MousePointerClick, CalendarClock } from 'lucide-react';

const triggerIcons: Record<string, any> = {
  manual: MousePointerClick,
  scheduled: CalendarClock,
};

const triggerLabels: Record<string, string> = {
  manual: 'Manual',
  scheduled: 'Scheduled',
};

export default function TriggerNode({ data, selected }: { data: any; selected?: boolean }) {
  const triggerType = data.triggerType || 'manual';
  const Icon = triggerIcons[triggerType] || MousePointerClick;

  return (
    <div className={`rounded-xl w-[220px] transition-all duration-200 ${
      selected
        ? 'ring-2 ring-emerald-500/60 shadow-lg shadow-emerald-500/10'
        : 'ring-1 ring-zinc-700/50 shadow-md shadow-black/20'
    }`}>
      <div className="bg-gradient-to-r from-emerald-500 to-green-600 rounded-t-xl px-4 py-2.5 flex items-center gap-2.5">
        <div className="bg-white/15 p-1.5 rounded-lg backdrop-blur-sm">
          <Icon className="w-4 h-4 text-white" />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">TRIGGER</span>
      </div>
      <div className="bg-zinc-900 rounded-b-xl px-4 py-3 border-x border-b border-zinc-700/50">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-xs font-medium text-zinc-300">{triggerLabels[triggerType] || triggerType}</p>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-emerald-500 !w-3.5 !h-3.5 !border-2 !border-zinc-900 !-bottom-[7px]" />
    </div>
  );
}
