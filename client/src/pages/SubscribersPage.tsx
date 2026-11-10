import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscriberApi } from '../api';
import { Link } from 'react-router-dom';
import { Search, Upload, Plus, ChevronLeft, ChevronRight, Trash2, Tag, Download, X, FileText, CheckCircle, AlertCircle, Columns3, ExternalLink } from 'lucide-react';
import { displayScore, bandFor, BAND_META, relativeTimeShort } from '../lib/engagement';
import toast from 'react-hot-toast';
import ImportProgressBar from '../components/subscribers/ImportProgressBar';

const COLUMN_PREFS_KEY = 'subscribers-visible-custom-columns';

function loadVisibleColumns(): string[] {
  try {
    const raw = localStorage.getItem(COLUMN_PREFS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveVisibleColumns(cols: string[]) {
  try { localStorage.setItem(COLUMN_PREFS_KEY, JSON.stringify(cols)); } catch { /* */ }
}

const inputClass = 'bg-field border border-field-line rounded-lg px-3 py-2 text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50 outline-none';

export default function SubscribersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [engagementBand, setEngagementBand] = useState('');
  const [engagementActivity, setEngagementActivity] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [bulkImportTags, setBulkImportTags] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTag, setBulkTag] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [visibleCustomCols, setVisibleCustomCols] = useState<string[]>(() => loadVisibleColumns());
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);

  useEffect(() => { saveVisibleColumns(visibleCustomCols); }, [visibleCustomCols]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (columnsRef.current && !columnsRef.current.contains(e.target as Node)) setColumnsOpen(false);
    }
    if (columnsOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [columnsOpen]);

  const { data: customFields } = useQuery({
    queryKey: ['custom-fields-discover'],
    queryFn: subscriberApi.discoverCustomFields,
  });

  const { data: tagOptions } = useQuery({
    queryKey: ['subscriber-tags-discover'],
    queryFn: subscriberApi.discoverTags,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['subscribers', page, search, statusFilter, planFilter, tagFilter, engagementBand, engagementActivity],
    queryFn: () => subscriberApi.list({
      page, limit: 50,
      search: search || undefined,
      status: statusFilter || undefined,
      plan_tier: planFilter || undefined,
      tag: tagFilter || undefined,
      engagement_band: engagementBand || undefined,
      engagement_activity: engagementActivity || undefined,
    }),
  });

  const previewMutation = useMutation({
    mutationFn: (formData: FormData) => subscriberApi.importPreview(formData),
    onSuccess: (data: any) => setCsvPreview(data),
    onError: () => toast.error('Failed to parse CSV'),
  });

  const importMutation = useMutation({
    mutationFn: (formData: FormData) => subscriberApi.import(formData),
    onSuccess: (data: any) => {
      if (data.jobId) {
        setImportJobId(data.jobId);
        setShowImport(false);
        setCsvPreview(null);
        setPreviewFile(null);
        setBulkImportTags('');
      } else {
        toast.success(`Imported ${data.imported} subscribers (${data.skipped} skipped)`);
        queryClient.invalidateQueries({ queryKey: ['subscribers'] });
        setShowImport(false);
        setCsvPreview(null);
        setPreviewFile(null);
        setBulkImportTags('');
      }
    },
    onError: () => toast.error('Import failed'),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => subscriberApi.create(data),
    onSuccess: () => { toast.success('Subscriber created'); queryClient.invalidateQueries({ queryKey: ['subscribers'] }); setShowCreate(false); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Create failed'),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: () => subscriberApi.bulkAction('delete', Array.from(selectedIds)),
    onSuccess: (d: any) => { toast.success(`Deleted ${d.deleted} subscribers`); setSelectedIds(new Set()); queryClient.invalidateQueries({ queryKey: ['subscribers'] }); },
    onError: () => toast.error('Bulk delete failed'),
  });

  const bulkTagMutation = useMutation({
    mutationFn: (tag: string) => subscriberApi.bulkAction('tag', Array.from(selectedIds), tag),
    onSuccess: (d: any) => { toast.success(`Tagged ${d.modified} subscribers`); setSelectedIds(new Set()); setShowTagInput(false); setBulkTag(''); queryClient.invalidateQueries({ queryKey: ['subscribers'] }); },
    onError: () => toast.error('Bulk tag failed'),
  });

  const handleExport = useCallback(async () => {
    try {
      const res = await subscriberApi.bulkAction('export', Array.from(selectedIds));
      const blob = res instanceof Blob ? res : new Blob([res], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `subscribers-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch { toast.error('Export failed'); }
  }, [selectedIds]);

  const toggleId = (id: string) => setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const toggleAll = () => { if (!data?.data) return; const ids = data.data.map(s => s._id); setSelectedIds(prev => prev.size === ids.length ? new Set() : new Set(ids)); };

  const handlePreview = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setPreviewFile(file);
    const formData = new FormData();
    formData.append('file', file);
    previewMutation.mutate(formData);
  };

  const handleConfirmImport = () => {
    if (!previewFile) return;
    const formData = new FormData();
    formData.append('file', previewFile);
    if (bulkImportTags.trim()) {
      formData.append('bulk_tags', bulkImportTags.trim());
    }
    importMutation.mutate(formData);
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-heading">Subscribers</h1>
          <p className="text-subtle mt-1">{data?.total?.toLocaleString() || 0} total subscribers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowImport(!showImport)} className="flex items-center gap-2 px-4 py-2 bg-card border border-line rounded-lg text-sm text-body hover:bg-elevated"><Upload className="w-4 h-4" /> Import CSV</button>
          <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"><Plus className="w-4 h-4" /> Add</button>
        </div>
      </div>

      {showImport && (
        <div className="bg-card border border-line rounded-lg p-4 mt-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="font-semibold text-heading">Import from CSV</h3>
              <p className="text-sm text-subtle mt-1">Upload a CSV file with subscriber data. File will be previewed before importing.</p>
            </div>
            <button onClick={() => { setShowImport(false); setCsvPreview(null); setPreviewFile(null); setBulkImportTags(''); }} className="p-1 text-dim hover:text-body"><X className="w-4 h-4" /></button>
          </div>

          <div className="bg-elevated rounded-lg p-3 mb-3">
            <p className="text-xs font-semibold text-heading mb-1.5">Supported CSV columns:</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-subtle">
              <span><code className="text-blue-500">email</code> — required</span>
              <span><code className="text-blue-500">name</code> — subscriber name</span>
              <span><code className="text-blue-500">country</code> — country code/name</span>
              <span><code className="text-blue-500">plan_tier</code> — free, $9, $29, $49, $99</span>
              <span><code className="text-blue-500">signup_source</code> — e.g. organic, podcast</span>
              <span><code className="text-blue-500">tags</code> — semicolon-separated, e.g. <code className="text-green-500">podcaster;creator</code></span>
            </div>
          </div>

          {!csvPreview && (
            <div className="flex items-center gap-3">
              <input ref={fileRef} type="file" accept=".csv" className="text-sm text-body" />
              <button onClick={handlePreview} disabled={previewMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:opacity-50">
                <FileText className="w-4 h-4" />
                {previewMutation.isPending ? 'Parsing...' : 'Preview'}
              </button>
            </div>
          )}

          {csvPreview && (
            <div className="mt-3">
              <div className="flex items-center gap-4 mb-3">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-heading font-medium">{csvPreview.total} rows parsed</span>
                </div>
                <span className="text-xs text-subtle">
                  {csvPreview.new} new · {csvPreview.existing} already exist (tags will be merged)
                </span>
                <span className="text-xs text-dim">
                  Columns: {csvPreview.headers.join(', ')}
                </span>
              </div>

              {csvPreview.headers.length > 0 && !csvPreview.headers.includes('email') && (
                <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-3">
                  <AlertCircle className="w-4 h-4" />
                  No "email" column found. Import will fail.
                </div>
              )}

              {csvPreview.invalid_count > 0 && (
                <div className="text-sm bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 mb-3">
                  <div className="flex items-center gap-2 text-amber-500 font-medium mb-1">
                    <AlertCircle className="w-4 h-4" />
                    {csvPreview.invalid_count} row{csvPreview.invalid_count !== 1 ? 's' : ''} will be skipped (invalid email)
                  </div>
                  {csvPreview.invalid_samples?.length > 0 && (
                    <div className="text-xs text-subtle pl-6">
                      e.g. {csvPreview.invalid_samples.slice(0, 5).map((s: any) =>
                        `row ${s.row}: "${s.value || '(empty)'}"`
                      ).join(', ')}
                      {csvPreview.invalid_samples.length > 5 && ` and ${csvPreview.invalid_count - 5} more`}
                    </div>
                  )}
                </div>
              )}

              <div className="border border-line rounded-lg overflow-auto max-h-64 mb-3">
                <table className="w-full text-xs">
                  <thead className="bg-elevated sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-subtle font-medium w-10">#</th>
                      {csvPreview.headers.map((h: string) => (
                        <th key={h} className="px-3 py-2 text-left text-subtle font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.preview.map((row: any, i: number) => (
                      <tr key={i} className="border-t border-line/50">
                        <td className="px-3 py-1.5 text-dim">{i + 1}</td>
                        {csvPreview.headers.map((h: string) => (
                          <td key={h} className="px-3 py-1.5 text-body max-w-48 truncate">
                            {Array.isArray(row[h]) ? row[h].join('; ') : (row[h] || <span className="text-dim">—</span>)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csvPreview.total > 10 && (
                <p className="text-xs text-dim mb-3">Showing first 10 of {csvPreview.total} rows</p>
              )}

              <div className="mb-3 bg-elevated/40 border border-line rounded-md p-3">
                <label className="block text-xs font-semibold text-dim uppercase tracking-wider mb-1.5">
                  Tag all imported subscribers (optional)
                </label>
                <input
                  type="text"
                  value={bulkImportTags}
                  onChange={e => setBulkImportTags(e.target.value)}
                  placeholder="e.g. clay-may-26-US  (separate multiple with , or ;)"
                  className={`w-full ${inputClass}`}
                />
                {bulkImportTags.trim() && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {bulkImportTags.split(/[,;]/).map(t => t.trim()).filter(Boolean).map(t => (
                      <span key={t} className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-500 text-xs font-medium">{t}</span>
                    ))}
                    <span className="text-[11px] text-dim ml-1 self-center">→ added to all {csvPreview.valid ?? csvPreview.total} imported rows</span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleConfirmImport} disabled={importMutation.isPending} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50">
                  <Upload className="w-4 h-4" />
                  {importMutation.isPending ? 'Importing...' : `Import ${csvPreview.valid ?? csvPreview.total} Subscriber${(csvPreview.valid ?? csvPreview.total) !== 1 ? 's' : ''}`}
                </button>
                <button onClick={() => { setCsvPreview(null); setPreviewFile(null); setBulkImportTags(''); if (fileRef.current) fileRef.current.value = ''; }} className="px-4 py-2 bg-card border border-line text-body rounded-lg text-sm hover:bg-elevated">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {importJobId && (
        <div className="mt-4">
          <ImportProgressBar jobId={importJobId} onComplete={() => setImportJobId(null)} />
        </div>
      )}

      {showCreate && (
        <div className="bg-card border border-line rounded-lg p-4 mt-4">
          <h3 className="font-semibold text-heading mb-3">Add Subscriber</h3>
          <form onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); createMutation.mutate({ email: fd.get('email'), name: fd.get('name'), plan_tier: fd.get('plan_tier') || 'free', country: fd.get('country') }); }} className="grid grid-cols-2 gap-3">
            <input name="email" type="email" placeholder="Email *" required className={inputClass} />
            <input name="name" placeholder="Name" className={inputClass} />
            <input name="country" placeholder="Country" className={inputClass} />
            <select name="plan_tier" className={inputClass}><option value="free">Free</option><option value="$9">$9/mo</option><option value="$29">$29/mo</option><option value="$49">$49/mo</option><option value="$99">$99/mo</option></select>
            <button type="submit" disabled={createMutation.isPending} className="col-span-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm">Create</button>
          </form>
        </div>
      )}

      <div className="flex items-center gap-3 mt-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-dim" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by name or email..." className={`w-full pl-10 pr-4 ${inputClass}`} />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className={inputClass}><option value="">All Status</option><option value="active">Active</option><option value="unsubscribed">Unsubscribed</option><option value="bounced">Bounced</option></select>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }} className={inputClass}><option value="">All Plans</option><option value="free">Free</option><option value="$9">$9</option><option value="$29">$29</option><option value="$49">$49</option><option value="$99">$99</option></select>
        <select
          value={tagFilter}
          onChange={(e) => { setTagFilter(e.target.value); setPage(1); }}
          className={inputClass}
          title="Filter by tag"
        >
          <option value="">All Tags</option>
          {(tagOptions || []).map(t => (
            <option key={t.tag} value={t.tag}>{t.tag} ({t.count})</option>
          ))}
        </select>
        <select value={engagementBand} onChange={(e) => { setEngagementBand(e.target.value); setPage(1); }} className={inputClass} title="Engagement band">
          <option value="">All Engagement</option>
          <option value="vip">🔥 VIP (300+)</option>
          <option value="hot">⭐ Hot (100–299)</option>
          <option value="warm">👍 Warm (30–99)</option>
          <option value="cool">💤 Cool (1–29)</option>
          <option value="cold">❄️ Cold (0)</option>
          <option value="at_risk">⚠️ At risk (&lt;0)</option>
        </select>
        <select value={engagementActivity} onChange={(e) => { setEngagementActivity(e.target.value); setPage(1); }} className={inputClass} title="Activity recency">
          <option value="">Any activity</option>
          <option value="active">Active (last 30d)</option>
          <option value="recent">Recent (30–90d)</option>
          <option value="stale">Stale (90d+)</option>
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mt-4 bg-blue-500/10 border border-blue-500/20 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-blue-500">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-blue-500/30" />
          <button onClick={() => { if (confirm(`Delete ${selectedIds.size} subscribers?`)) bulkDeleteMutation.mutate(); }} disabled={bulkDeleteMutation.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/10 text-red-500 border border-red-500/20 rounded-md hover:bg-red-500/20 disabled:opacity-50">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
          {showTagInput ? (
            <div className="flex items-center gap-1.5">
              <input value={bulkTag} onChange={e => setBulkTag(e.target.value)} placeholder="Tag name" className={`w-32 text-xs ${inputClass}`} onKeyDown={e => e.key === 'Enter' && bulkTag.trim() && bulkTagMutation.mutate(bulkTag.trim())} />
              <button onClick={() => bulkTag.trim() && bulkTagMutation.mutate(bulkTag.trim())} disabled={!bulkTag.trim() || bulkTagMutation.isPending} className="px-2 py-1.5 text-xs bg-blue-600 text-white rounded-md disabled:opacity-50">Apply</button>
              <button onClick={() => { setShowTagInput(false); setBulkTag(''); }} className="p-1 text-dim hover:text-body"><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <button onClick={() => setShowTagInput(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-500/10 text-purple-500 border border-purple-500/20 rounded-md hover:bg-purple-500/20">
              <Tag className="w-3 h-3" /> Add Tag
            </button>
          )}
          <button onClick={handleExport} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-500/10 text-green-500 border border-green-500/20 rounded-md hover:bg-green-500/20">
            <Download className="w-3 h-3" /> Export CSV
          </button>
          <div className="flex-1" />
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-subtle hover:text-body">Clear selection</button>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 mt-4 mb-2">
        <div className="relative" ref={columnsRef}>
          <button
            onClick={() => setColumnsOpen(!columnsOpen)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-line rounded-md text-subtle hover:bg-elevated"
          >
            <Columns3 className="w-3.5 h-3.5" />
            Columns {visibleCustomCols.length > 0 && <span className="text-blue-500">+{visibleCustomCols.length}</span>}
          </button>
          {columnsOpen && (
            <div className="absolute right-0 top-9 z-20 w-72 bg-card border border-line rounded-md shadow-lg p-3">
              <div className="text-[10px] font-semibold text-dim uppercase tracking-wider mb-2">Custom field columns</div>
              {!customFields || customFields.length === 0 ? (
                <p className="text-xs text-subtle py-2">No custom fields yet. Add some via CSV import or the subscriber profile.</p>
              ) : (
                <div className="max-h-64 overflow-y-auto space-y-1">
                  {customFields.map(f => (
                    <label key={f.key} className="flex items-center gap-2 px-2 py-1 hover:bg-elevated rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibleCustomCols.includes(f.key)}
                        onChange={e => {
                          setVisibleCustomCols(prev =>
                            e.target.checked ? [...prev, f.key] : prev.filter(k => k !== f.key)
                          );
                        }}
                        className="rounded border-field-line"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-body truncate">{f.key}</div>
                        <div className="text-[10px] text-dim">{f.type} · {f.count} subscriber{f.count !== 1 ? 's' : ''}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card rounded-lg border border-line overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-subtle animate-pulse">Loading...</div> : (
          <table className="w-full text-sm">
            <thead className="bg-elevated"><tr className="text-left text-subtle">
              <th className="px-3 py-3 w-10"><input type="checkbox" checked={!!data?.data?.length && selectedIds.size === data.data.length} onChange={toggleAll} className="rounded border-field-line" /></th>
              <th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Engagement</th><th className="px-4 py-3 font-medium">Tags</th><th className="px-4 py-3 font-medium">Sent</th><th className="px-4 py-3 font-medium">Country</th>
              {visibleCustomCols.map(k => (
                <th key={k} className="px-4 py-3 font-medium text-blue-500/70">{k}</th>
              ))}
            </tr></thead>
            <tbody>
              {data?.data?.map((sub) => (
                <tr key={sub._id} className={`border-t border-line/50 hover:bg-elevated/50 ${selectedIds.has(sub._id) ? 'bg-blue-500/5' : ''}`}>
                  <td className="px-3 py-3"><input type="checkbox" checked={selectedIds.has(sub._id)} onChange={() => toggleId(sub._id)} className="rounded border-field-line" /></td>
                  <td className="px-4 py-3"><Link to={`/subscribers/${sub._id}`} className="text-link hover:underline font-medium">{sub.email}</Link></td>
                  <td className="px-4 py-3 text-body">{sub.name || '-'}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 rounded-full text-xs bg-zinc-500/15 text-subtle font-medium">{sub.plan_tier}</span></td>
                  <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sub.status === 'active' ? 'bg-green-500/15 text-green-500' : sub.status === 'unsubscribed' ? 'bg-red-500/15 text-red-500' : 'bg-yellow-500/15 text-yellow-500'}`}>{sub.status}</span></td>
                  <td className="px-4 py-3">
                    {(() => {
                      const score = displayScore(sub);
                      const meta = BAND_META[bandFor(score)];
                      return (
                        <div className="leading-tight">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-semibold text-heading tabular-nums">{score}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${meta.bg} ${meta.color}`}>
                              {meta.emoji} {meta.label}
                            </span>
                          </div>
                          <div className="text-[10px] text-dim mt-0.5">
                            {relativeTimeShort(sub.engagement_last_event_at)}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3"><div className="flex gap-1 flex-wrap">{sub.tags.slice(0, 3).map(t => <span key={t} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs">{t}</span>)}{sub.tags.length > 3 && <span className="text-xs text-dim">+{sub.tags.length - 3}</span>}</div></td>
                  <td className="px-4 py-3 text-subtle">{sub.engagement?.emails_sent || 0}</td>
                  <td className="px-4 py-3 text-subtle">{sub.country || '-'}</td>
                  {visibleCustomCols.map(k => {
                    const val = sub.custom_attributes?.[k];
                    if (val == null || val === '') return <td key={k} className="px-4 py-3 text-dim">—</td>;
                    const s = String(val);
                    if (/^https?:\/\//i.test(s)) {
                      return (
                        <td key={k} className="px-4 py-3">
                          <a href={s} target="_blank" rel="noopener noreferrer" className="text-link hover:underline inline-flex items-center gap-1 max-w-48 truncate">
                            <span className="truncate">{s}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        </td>
                      );
                    }
                    return <td key={k} className="px-4 py-3 text-body max-w-48 truncate" title={s}>{s}</td>;
                  })}
                </tr>
              ))}
              {(!data?.data || data.data.length === 0) && <tr><td colSpan={9 + visibleCustomCols.length} className="px-4 py-8 text-center text-dim">No subscribers found</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-subtle">Page {data.page} of {data.totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-2 border border-line rounded-lg disabled:opacity-30 text-body"><ChevronLeft className="w-4 h-4" /></button>
            <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page >= data.totalPages} className="p-2 border border-line rounded-lg disabled:opacity-30 text-body"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}
