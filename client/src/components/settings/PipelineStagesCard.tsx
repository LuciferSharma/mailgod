import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, Plus, Trash2, ChevronUp, ChevronDown, Loader2, Lock, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { pipelineApi } from '../../api';
import type { PipelineStage } from '../../types';

const inputClass =
  'bg-field border border-field-line rounded-md px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none';

const DEFAULT_NEW_COLOR = '#6366f1';

/**
 * Self-contained Settings card for managing pipeline stages.
 *
 * Owns its own query (['pipeline-stages']) and every mutation invalidates that
 * key. The inbox StagePicker / chip caches share the same key with a 5-minute
 * staleTime, so invalidating here keeps the whole app's stage list coherent
 * without a manual refetch.
 */
export default function PipelineStagesCard() {
  const queryClient = useQueryClient();

  const { data: stages, isLoading } = useQuery({
    queryKey: ['pipeline-stages'],
    queryFn: pipelineApi.stages,
    staleTime: 300_000,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });

  // --- mutations -----------------------------------------------------------
  const createMut = useMutation({
    mutationFn: (body: { name: string; color?: string; terminal?: boolean }) =>
      pipelineApi.createStage(body),
    onSuccess: () => {
      invalidate();
      toast.success('Stage added');
    },
    onError: (e: any) => {
      if (e?.response?.status === 409) toast.error('A stage with that name already exists');
      else toast.error(e?.response?.data?.error || 'Failed to add stage');
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Pick<PipelineStage, 'name' | 'color' | 'terminal'>> }) =>
      pipelineApi.updateStage(id, body),
    onSuccess: () => invalidate(),
    onError: (e: any) => {
      if (e?.response?.status === 409) toast.error('A stage with that name already exists');
      else toast.error(e?.response?.data?.error || 'Failed to update stage');
      // Refetch so the optimistic-looking inline edit reverts to server state.
      invalidate();
    },
  });

  const reorderMut = useMutation({
    mutationFn: (ids: string[]) => pipelineApi.reorderStages(ids),
    onSuccess: () => invalidate(),
    onError: (e: any) => {
      toast.error(e?.response?.data?.error || 'Failed to reorder stages');
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ id, reassignTo }: { id: string; reassignTo?: string }) =>
      pipelineApi.deleteStage(id, reassignTo),
    onSuccess: () => {
      invalidate();
      setReassignFor(null);
      toast.success('Stage deleted');
    },
    onError: (e: any) => {
      // 409 stage_in_use is handled inline (open the reassign picker), not as a toast.
      if (e?.response?.status === 409 && e?.response?.data?.error === 'stage_in_use') return;
      if (e?.response?.status === 403) toast.error('System stages cannot be deleted');
      else toast.error(e?.response?.data?.error || 'Failed to delete stage');
    },
  });

  // Which stage is currently showing its inline "reassign before delete" picker,
  // plus the refCount returned by the 409 so we can warn the user.
  const [reassignFor, setReassignFor] = useState<{ id: string; refCount: number } | null>(null);

  const sorted = (stages ?? []).slice().sort((a, b) => a.order - b.order);

  // Build the full id order with `id` shifted by `dir` (-1 up, +1 down).
  const move = (id: string, dir: -1 | 1) => {
    const ids = sorted.map(s => s._id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    reorderMut.mutate(ids);
  };

  const handleDelete = (stage: PipelineStage) => {
    if (stage.system) return;
    if (!confirm(`Delete the "${stage.name}" stage?`)) return;
    deleteMut.mutate(
      { id: stage._id },
      {
        onError: (e: any) => {
          if (e?.response?.status === 409 && e?.response?.data?.error === 'stage_in_use') {
            setReassignFor({ id: stage._id, refCount: e.response.data.refCount ?? 0 });
          }
        },
      }
    );
  };

  const confirmReassignDelete = (id: string, reassignTo: string) => {
    const target = sorted.find(s => s._id === reassignTo);
    const source = sorted.find(s => s._id === id);
    if (!reassignTo) return;
    if (!confirm(`Move conversations from "${source?.name}" to "${target?.name}" and delete "${source?.name}"?`)) return;
    deleteMut.mutate({ id, reassignTo });
  };

  return (
    <div className="bg-card rounded-lg border border-line p-6">
      <div className="flex items-center gap-2 mb-1">
        <GitBranch className="w-5 h-5 text-primary-500" />
        <h3 className="text-lg font-semibold text-heading">Pipeline Stages</h3>
      </div>
      <p className="text-sm text-subtle mb-5">
        Stages used to track conversations through your sales pipeline. Reorder them to set the
        flow; system stages can be renamed and recolored but not deleted.
      </p>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-subtle py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading stages…
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.length === 0 && (
            <p className="text-sm text-dim italic">No stages yet. Add one below.</p>
          )}

          {sorted.map((stage, i) => (
            <StageRow
              key={stage._id}
              stage={stage}
              isFirst={i === 0}
              isLast={i === sorted.length - 1}
              otherStages={sorted.filter(s => s._id !== stage._id)}
              reassign={reassignFor?.id === stage._id ? reassignFor : null}
              onRename={(name) => {
                const trimmed = name.trim();
                if (!trimmed || trimmed === stage.name) return;
                updateMut.mutate({ id: stage._id, body: { name: trimmed } });
              }}
              onRecolor={(color) => {
                if (color === stage.color) return;
                updateMut.mutate({ id: stage._id, body: { color } });
              }}
              onToggleTerminal={(terminal) => updateMut.mutate({ id: stage._id, body: { terminal } })}
              onMoveUp={() => move(stage._id, -1)}
              onMoveDown={() => move(stage._id, 1)}
              onDelete={() => handleDelete(stage)}
              onCancelReassign={() => setReassignFor(null)}
              onConfirmReassign={(reassignTo) => confirmReassignDelete(stage._id, reassignTo)}
              busy={reorderMut.isPending || deleteMut.isPending}
            />
          ))}

          <AddStageRow
            disabled={createMut.isPending}
            onAdd={(name, color) => createMut.mutate({ name, color })}
          />
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Single stage row — owns its own inline-edit name buffer.
// ===========================================================================
interface StageRowProps {
  stage: PipelineStage;
  isFirst: boolean;
  isLast: boolean;
  otherStages: PipelineStage[];
  reassign: { id: string; refCount: number } | null;
  onRename: (name: string) => void;
  onRecolor: (color: string) => void;
  onToggleTerminal: (terminal: boolean) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onCancelReassign: () => void;
  onConfirmReassign: (reassignTo: string) => void;
  busy: boolean;
}

function StageRow({
  stage,
  isFirst,
  isLast,
  otherStages,
  reassign,
  onRename,
  onRecolor,
  onToggleTerminal,
  onMoveUp,
  onMoveDown,
  onDelete,
  onCancelReassign,
  onConfirmReassign,
  busy,
}: StageRowProps) {
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [reassignTo, setReassignTo] = useState(otherStages[0]?._id ?? '');

  // Keep local buffers in sync if the server value changes underneath us
  // (e.g. a reorder refetch or a rejected rename reverting).
  useEffect(() => setName(stage.name), [stage.name]);
  useEffect(() => setColor(stage.color), [stage.color]);

  return (
    <div className="rounded-md border border-line bg-elevated">
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Color swatch — native color input clipped to a round chip */}
        <label className="relative shrink-0 cursor-pointer" title="Stage color">
          <span
            className="block w-4 h-4 rounded-full ring-1 ring-black/20"
            style={{ backgroundColor: color }}
          />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => { if (color !== stage.color) onRecolor(color); }}
            className="absolute inset-0 w-4 h-4 opacity-0 cursor-pointer"
          />
        </label>

        {/* Inline-editable name */}
        <input
          type="text"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => onRename(name)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setName(stage.name);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="flex-1 min-w-0 bg-transparent text-sm text-heading outline-none focus:bg-field focus:border focus:border-field-line rounded px-1.5 py-1"
        />

        {stage.system && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-500/10 text-blue-500 ring-1 ring-blue-500/20 shrink-0">
            <Lock className="w-2.5 h-2.5" /> System
          </span>
        )}
        <button
          type="button"
          onClick={() => onToggleTerminal(!stage.terminal)}
          title={stage.terminal ? 'Terminal stage (won/lost) — click to unset' : 'Mark as a terminal (won/lost) stage'}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 transition-colors ${
            stage.terminal
              ? 'bg-emerald-500/10 text-emerald-500 ring-1 ring-emerald-500/20'
              : 'text-dim ring-1 ring-line hover:text-body'
          }`}
        >
          Terminal
        </button>

        {/* Reorder */}
        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={isFirst || busy}
            title="Move up"
            className="p-1 text-dim hover:text-body disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={isLast || busy}
            title="Move down"
            className="p-1 text-dim hover:text-body disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>

        {/* Delete — hidden for system stages */}
        {!stage.system && (
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            title="Delete stage"
            className="p-1 text-dim hover:text-red-500 disabled:opacity-40 shrink-0"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Inline reassign-before-delete (shown when DELETE returns 409 stage_in_use) */}
      {reassign && (
        <div className="border-t border-line px-3 py-2.5 bg-amber-500/5">
          <p className="text-xs text-amber-500 mb-2">
            This stage is used by {reassign.refCount} conversation{reassign.refCount === 1 ? '' : 's'}.
            Choose a stage to move them to before deleting.
          </p>
          <div className="flex items-center gap-2">
            <select
              value={reassignTo}
              onChange={(e) => setReassignTo(e.target.value)}
              className={`flex-1 ${inputClass}`}
            >
              {otherStages.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onConfirmReassign(reassignTo)}
              disabled={!reassignTo || busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 rounded-md text-red-500 hover:bg-red-500/20 disabled:opacity-40 transition-colors"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Reassign & delete
            </button>
            <button
              type="button"
              onClick={onCancelReassign}
              className="p-2 text-dim hover:text-body"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Add-stage row
// ===========================================================================
function AddStageRow({
  onAdd,
  disabled,
}: {
  onAdd: (name: string, color: string) => void;
  disabled: boolean;
}) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(DEFAULT_NEW_COLOR);
  const nameRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed, color);
    setName('');
    setColor(DEFAULT_NEW_COLOR);
    nameRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-line">
      <label className="relative shrink-0 cursor-pointer" title="Stage color">
        <span
          className="block w-7 h-7 rounded-md ring-1 ring-black/20"
          style={{ backgroundColor: color }}
        />
        <input
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="absolute inset-0 w-7 h-7 opacity-0 cursor-pointer"
        />
      </label>
      <input
        ref={nameRef}
        type="text"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="New stage name"
        className={`flex-1 ${inputClass}`}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!name.trim() || disabled}
        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm bg-elevated border border-line rounded-md text-body hover:bg-blue-500/10 hover:text-blue-500 hover:border-blue-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {disabled ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
        Add
      </button>
    </div>
  );
}
