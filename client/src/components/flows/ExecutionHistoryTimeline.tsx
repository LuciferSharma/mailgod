interface HistoryEntry {
  node_id: string;
  action: string;
  timestamp: string;
}

export default function ExecutionHistoryTimeline({ history }: { history: HistoryEntry[] }) {
  if (!history || history.length === 0) {
    return <p className="text-sm text-subtle py-2 pl-6">No history recorded.</p>;
  }

  return (
    <div className="ml-6 border-l-2 border-blue-500/30 pl-5 py-2 space-y-3">
      {history.map((entry, idx) => (
        <div key={idx} className="relative">
          <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-card" />
          <div className="text-xs text-dim">
            {new Date(entry.timestamp).toLocaleString()}
          </div>
          <div className="text-sm text-heading font-medium">{entry.action}</div>
          <div className="text-xs text-subtle font-mono">Node: {entry.node_id}</div>
        </div>
      ))}
    </div>
  );
}
