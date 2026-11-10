import { Zap, Mail, Clock, GitBranch, Shuffle, Tag, Globe, LogOut, GripVertical } from 'lucide-react';

const nodeCategories = [
  {
    label: 'Triggers',
    nodes: [
      { type: 'trigger', label: 'Trigger', icon: Zap, accent: 'text-emerald-400', bg: 'hover:bg-emerald-500/10', border: 'hover:border-emerald-500/30' },
    ],
  },
  {
    label: 'Actions',
    nodes: [
      { type: 'sendEmail', label: 'Send Email', icon: Mail, accent: 'text-blue-400', bg: 'hover:bg-blue-500/10', border: 'hover:border-blue-500/30' },
      { type: 'addTag', label: 'Add Tag', icon: Tag, accent: 'text-orange-400', bg: 'hover:bg-orange-500/10', border: 'hover:border-orange-500/30' },
      { type: 'removeTag', label: 'Remove Tag', icon: Tag, accent: 'text-rose-400', bg: 'hover:bg-rose-500/10', border: 'hover:border-rose-500/30' },
      { type: 'webhook', label: 'Webhook', icon: Globe, accent: 'text-teal-400', bg: 'hover:bg-teal-500/10', border: 'hover:border-teal-500/30' },
    ],
  },
  {
    label: 'Logic',
    nodes: [
      { type: 'delay', label: 'Delay', icon: Clock, accent: 'text-slate-400', bg: 'hover:bg-slate-500/10', border: 'hover:border-slate-500/30' },
      { type: 'condition', label: 'Condition', icon: GitBranch, accent: 'text-amber-400', bg: 'hover:bg-amber-500/10', border: 'hover:border-amber-500/30' },
      { type: 'abSplit', label: 'A/B Split', icon: Shuffle, accent: 'text-violet-400', bg: 'hover:bg-violet-500/10', border: 'hover:border-violet-500/30' },
    ],
  },
  {
    label: 'Flow Control',
    nodes: [
      { type: 'exit', label: 'Exit', icon: LogOut, accent: 'text-red-400', bg: 'hover:bg-red-500/10', border: 'hover:border-red-500/30' },
    ],
  },
];

interface NodePaletteProps {
  onAddNode: (type: string) => void;
}

export default function NodePalette({ onAddNode }: NodePaletteProps) {
  return (
    <div className="w-56 bg-zinc-900 border-r border-zinc-800 overflow-y-auto flex flex-col">
      <div className="px-4 pt-4 pb-3 border-b border-zinc-800">
        <h3 className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Nodes</h3>
        <p className="text-[10px] text-zinc-600 mt-0.5">Click to add to canvas</p>
      </div>

      <div className="flex-1 px-3 py-3 space-y-5">
        {nodeCategories.map((category) => (
          <div key={category.label}>
            <h4 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider px-1 mb-2">{category.label}</h4>
            <div className="space-y-1">
              {category.nodes.map(({ type, label, icon: Icon, accent, bg, border }) => (
                <button
                  key={type}
                  onClick={() => onAddNode(type)}
                  className={`group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-zinc-800 transition-all duration-150 ${bg} ${border} active:scale-[0.98]`}
                >
                  <div className="p-1.5 rounded-md bg-zinc-800 group-hover:bg-zinc-700/80 transition-colors">
                    <Icon className={`w-3.5 h-3.5 ${accent}`} />
                  </div>
                  <span className="text-xs font-medium text-zinc-400 group-hover:text-zinc-200 flex-1 text-left transition-colors">{label}</span>
                  <GripVertical className="w-3 h-3 text-zinc-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 border-t border-zinc-800">
        <p className="text-[10px] text-zinc-600 text-center">Drag handles to connect</p>
      </div>
    </div>
  );
}
