import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, KanbanSquare, Reply } from 'lucide-react';
import toast from 'react-hot-toast';
import { pipelineApi } from '../api';
import type { PipelineBoardColumn, PipelineCard, PipelineStage } from '../types';
import StagePicker from '../components/inbox/StagePicker';
import PageHint from '../components/PageHint';
import { relativeTimeShort } from '../lib/engagement';

type SourceValue = '' | 'campaign' | 'flow' | 'one_off';

const SOURCE_TABS: { value: SourceValue; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'campaign', label: 'Campaigns' },
  { value: 'flow', label: 'Flow steps' },
  { value: 'one_off', label: 'One-offs' },
];

export default function PipelinePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [source, setSource] = useState<SourceValue>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce the search box into the query key so we don't refetch on each keystroke.
  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => clearTimeout(debounceRef.current);
  }, [searchInput]);

  const { data: board, isLoading } = useQuery({
    queryKey: ['pipeline-board', source, search],
    queryFn: () => pipelineApi.board({ source: source || undefined, search: search || undefined }),
  });

  const { data: stages } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: pipelineApi.stages,
  });

  const moveMutation = useMutation({
    mutationFn: (body: {
      subscriber_id: string;
      source_type: string;
      source_id: string;
      flow_node_id?: string | null;
      stage_id: string | null;
    }) => pipelineApi.setStage(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pipeline-board'] });
    },
    onError: () => toast.error('Could not move card'),
  });

  const handleMove = (card: PipelineCard, stageId: string | null) => {
    if (stageId === card.stage_id) return;
    moveMutation.mutate({
      subscriber_id: card.subscriber_id,
      source_type: card.source_type,
      source_id: card.source_id,
      flow_node_id: card.flow_node_id,
      stage_id: stageId,
    });
  };

  const handleOpenCard = (card: PipelineCard) => {
    navigate('/inbox', {
      state: {
        open: {
          type: card.source_type,
          id: card.source_id,
          flow_node_id: card.flow_node_id,
          subscriber_id: card.subscriber_id,
        },
      },
    });
  };

  const columns = board?.columns || [];
  const allEmpty = columns.length > 0 && columns.every(c => c.total === 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <KanbanSquare className="w-6 h-6 text-blue-500" /> Pipeline
          </h1>
          <p className="text-subtle mt-1">Track prospect conversations across your sales stages</p>
        </div>
      </div>

      <PageHint
        storageKey="pipeline"
        lines={[
          'Each card is a conversation with a prospect. Drag stages with the picker to move it through your pipeline.',
          'Use the source tabs and search to focus on a campaign, flow, or one-off send.',
          'Click a card to jump straight to that thread in the inbox.',
        ]}
      />

      {/* Toolbar: source filter + debounced search */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="inline-flex items-center gap-1 rounded-md border border-line bg-card p-1">
          {SOURCE_TABS.map(tab => (
            <button
              key={tab.value || 'all'}
              onClick={() => setSource(tab.value)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                source === tab.value ? 'bg-blue-500/15 text-blue-500' : 'text-subtle hover:bg-elevated'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-64 max-w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dim" />
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search prospects or subjects..."
            className="w-full pl-9 pr-3 py-2 text-sm rounded-md border border-line bg-field placeholder:text-dim focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
        </div>
      </div>

      {board?.scan_capped && (
        <div className="mb-3 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-3 py-2">
          Showing the most recent conversations — older ones may not appear. Use search to find a specific prospect.
        </div>
      )}

      {isLoading ? (
        <div className="p-16 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-dim" />
        </div>
      ) : columns.length === 0 ? (
        <div className="p-16 text-center text-sm text-subtle">
          <KanbanSquare className="w-10 h-10 mx-auto text-dim mb-2" />
          No pipeline stages configured yet.
        </div>
      ) : allEmpty ? (
        <div className="p-16 text-center text-sm text-subtle">
          <KanbanSquare className="w-10 h-10 mx-auto text-dim mb-2" />
          No conversations in your pipeline yet — set a stage on a conversation from the inbox to see it here.
        </div>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4 -mx-1 px-1">
          {columns.map(column => (
            <StageColumn
              key={column.stage._id}
              column={column}
              stages={stages || []}
              onMove={handleMove}
              onOpenCard={handleOpenCard}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function StageColumn({
  column,
  stages,
  onMove,
  onOpenCard,
}: {
  column: PipelineBoardColumn;
  stages: PipelineStage[];
  onMove: (card: PipelineCard, stageId: string | null) => void;
  onOpenCard: (card: PipelineCard) => void;
}) {
  const { stage, total, cards } = column;
  const hidden = total - cards.length;

  return (
    <div className="w-72 shrink-0 flex flex-col rounded-lg border border-line bg-card overflow-hidden">
      {/* Stage-colored top border */}
      <div className="h-1 w-full" style={{ backgroundColor: stage.color }} />

      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-line">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
          <h2 className="text-sm font-semibold text-heading truncate">{stage.name}</h2>
        </div>
        <span className="text-xs font-medium text-dim tabular-nums shrink-0">{total}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[8rem] max-h-[calc(100vh-18rem)]">
        {cards.length === 0 ? (
          <div className="py-10 text-center text-xs text-dim">No conversations</div>
        ) : (
          cards.map(card => (
            <PipelineCardItem
              key={card.label_id}
              card={card}
              stages={stages}
              onMove={onMove}
              onOpenCard={onOpenCard}
            />
          ))
        )}

        {hidden > 0 && (
          <div className="px-2 py-1.5 text-center text-[11px] text-dim">+{hidden} more</div>
        )}
      </div>
    </div>
  );
}

function PipelineCardItem({
  card,
  stages,
  onMove,
  onOpenCard,
}: {
  card: PipelineCard;
  stages: PipelineStage[];
  onMove: (card: PipelineCard, stageId: string | null) => void;
  onOpenCard: (card: PipelineCard) => void;
}) {
  return (
    <div
      onClick={() => onOpenCard(card)}
      className="group rounded-md border border-line bg-elevated px-3 py-2.5 cursor-pointer transition-colors hover:border-field-line"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="text-sm font-medium text-heading truncate min-w-0">
          {card.subscriber_name || card.subscriber_email}
        </h3>
        {card.reply_count > 0 && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-500/15 text-blue-500 shrink-0">
            <Reply className="w-2.5 h-2.5" /> {card.reply_count}
          </span>
        )}
      </div>

      <p className="text-xs text-subtle truncate mb-1.5">{card.conversation_subject}</p>

      <div className="flex items-center gap-1.5 text-[10px] text-dim mb-2">
        <span className="px-1.5 py-0.5 rounded bg-card text-dim truncate max-w-[60%]">{card.source_label}</span>
        <span className="shrink-0">{relativeTimeShort(card.last_activity_at)}</span>
      </div>

      <StagePicker
        stages={stages}
        value={card.stage_id}
        onChange={stageId => onMove(card, stageId)}
      />
    </div>
  );
}
