import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Info, X, BookOpen } from 'lucide-react';

interface PageHintProps {
  storageKey: string;
  lines: string[];
}

export default function PageHint({ storageKey, lines }: PageHintProps) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(`hint-${storageKey}`) === '1');

  if (dismissed) return null;

  return (
    <div className="bg-blue-500/8 border border-blue-500/20 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <ul className="text-xs text-subtle space-y-0.5">
            {lines.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
          <Link to="/guide" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 mt-1.5">
            <BookOpen className="w-3 h-3" /> Read the full guide
          </Link>
        </div>
        <button
          onClick={() => { localStorage.setItem(`hint-${storageKey}`, '1'); setDismissed(true); }}
          className="p-0.5 text-dim hover:text-body shrink-0"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
