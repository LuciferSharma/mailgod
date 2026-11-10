import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { analyticsApi } from '../api';
import type { EngagedProspect, EngagedProspectsQuery } from '../types';
import {
  Flame,
  Download,
  Filter,
  Search,
  Eye,
  MousePointerClick,
  Users,
  Sparkles,
  ExternalLink,
  Mail,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Globe,
  Tag,
} from 'lucide-react';

const selectClass =
  'bg-field border border-field-line rounded-lg px-3 py-2 text-sm text-heading focus:ring-2 focus:ring-blue-500/30 outline-none';

export default function EngagedLeadsPage() {
  const navigate = useNavigate();

  // Filters State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [minOpens, setMinOpens] = useState<number>(1);
  const [hasClicked, setHasClicked] = useState<'all' | 'yes' | 'no'>('all');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [excludeReplied, setExcludeReplied] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [sortBy, setSortBy] = useState<'opens' | 'clicks' | 'last_active' | 'first_opened' | 'score'>('last_active');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  const queryParams: EngagedProspectsQuery = {
    page,
    limit,
    minOpens,
    hasClicked,
    timeframe,
    excludeReplied,
    search: search.trim() || undefined,
    sortBy,
    sortOrder,
  };

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['engaged-prospects', queryParams],
    queryFn: () => analyticsApi.engagedProspects(queryParams),
    refetchInterval: 30000,
  });

  const prospects = data?.data || [];
  const total = data?.total || 0;
  const totalPages = data?.total_pages || Math.ceil(total / limit) || 1;
  const kpis = data?.kpis || {
    total_viewers: 0,
    hot_count: 0,
    clickers_count: 0,
    multi_open_count: 0,
  };

  async function handleExportCsv() {
    try {
      setIsExporting(true);
      const blob = await analyticsApi.exportEngagedProspectsCsv(queryParams);
      const url = window.URL.createObjectURL(new Blob([blob], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      const dateStr = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `engaged_leads_${dateStr}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export CSV:', err);
      alert('Failed to export CSV. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  function formatTimeAgo(ts: string | null) {
    if (!ts) return '—';
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    const days = Math.floor(diff / 86400000);
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  }

  function handleOpenInbox(p: EngagedProspect) {
    navigate('/inbox', {
      state: {
        searchEmail: p.email,
        open: {
          subscriber_id: p.subscriber_id,
        },
      },
    });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 rounded-xl">
              <Flame className="w-5 h-5 text-amber-500" />
            </div>
            Engaged Leads & Viewers
          </h1>
          <p className="text-sm text-subtle mt-1">
            Filter, inspect, and export prospects who opened or clicked outreach emails to prioritize your follow-ups.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            disabled={isExporting || total === 0}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            {isExporting ? 'Exporting...' : `Export CSV (${total.toLocaleString()})`}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-heading">{kpis.total_viewers.toLocaleString()}</div>
            <div className="text-xs text-subtle font-medium">Matching Viewers</div>
          </div>
        </div>

        <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-red-400">{kpis.hot_count.toLocaleString()}</div>
            <div className="text-xs text-subtle font-medium">🔥 High Intent Leads (3+ opens / clicks)</div>
          </div>
        </div>

        <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-amber-500/10 rounded-xl text-amber-400">
            <MousePointerClick className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-amber-400">{kpis.clickers_count.toLocaleString()}</div>
            <div className="text-xs text-subtle font-medium">Link Clickers</div>
          </div>
        </div>

        <div className="bg-card border border-line rounded-xl p-4 flex items-center gap-3.5">
          <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <div className="text-2xl font-bold text-heading">{kpis.multi_open_count.toLocaleString()}</div>
            <div className="text-xs text-subtle font-medium">Multi-Openers (2+ times)</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-card border border-line rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-dim absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by email or name..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-field border border-field-line rounded-lg text-sm text-heading placeholder:text-dim focus:ring-2 focus:ring-blue-500/30 outline-none"
            />
          </div>

          {/* Min Opens */}
          <div className="flex items-center gap-1.5">
            <Eye className="w-4 h-4 text-dim hidden sm:block" />
            <select
              value={minOpens}
              onChange={(e) => {
                setMinOpens(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className={selectClass}
            >
              <option value={1}>1+ Opens (All Openers)</option>
              <option value={2}>2+ Opens (Warm)</option>
              <option value={3}>3+ Opens (High Intent 🔥)</option>
              <option value={5}>5+ Opens (Super Hot 🔥🔥)</option>
              <option value={0}>0+ Opens (Include Click-only)</option>
            </select>
          </div>

          {/* Timeframe */}
          <div className="flex items-center gap-1.5">
            <Clock className="w-4 h-4 text-dim hidden sm:block" />
            <select
              value={timeframe}
              onChange={(e) => {
                setTimeframe(e.target.value as any);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Click Filter */}
          <div className="flex items-center gap-1.5">
            <MousePointerClick className="w-4 h-4 text-dim hidden sm:block" />
            <select
              value={hasClicked}
              onChange={(e) => {
                setHasClicked(e.target.value as any);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="all">Clicks: All</option>
              <option value="yes">Clicked Links Only</option>
              <option value="no">No Clicks</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-4 h-4 text-dim hidden sm:block" />
            <select
              value={`${sortBy}-${sortOrder}`}
              onChange={(e) => {
                const [sb, so] = e.target.value.split('-');
                setSortBy(sb as any);
                setSortOrder(so as any);
                setPage(1);
              }}
              className={selectClass}
            >
              <option value="last_active-desc">Recently Active First</option>
              <option value="opens-desc">Most Opens (Desc)</option>
              <option value="clicks-desc">Most Clicks (Desc)</option>
              <option value="score-desc">Highest Intent Score</option>
              <option value="first_opened-desc">First Opened (Newest)</option>
              <option value="last_active-asc">Oldest Active First</option>
            </select>
          </div>
        </div>

        {/* Bottom Options Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-line text-xs text-subtle">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeReplied}
              onChange={(e) => {
                setExcludeReplied(e.target.checked);
                setPage(1);
              }}
              className="rounded border-field-line text-blue-600 focus:ring-blue-500/30"
            />
            <span>Hide prospects who already replied or booked demo</span>
          </label>

          <div className="flex items-center gap-2">
            <span>Show:</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(parseInt(e.target.value, 10));
                setPage(1);
              }}
              className="bg-field border border-field-line rounded px-2 py-1 text-xs text-heading outline-none"
            >
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="bg-card border border-line rounded-xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="py-24 text-center text-subtle">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mb-3" />
            <p>Loading engaged prospects...</p>
          </div>
        ) : prospects.length === 0 ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-field flex items-center justify-center mx-auto text-dim">
              <Filter className="w-6 h-6" />
            </div>
            <div className="text-base font-medium text-heading">No engaged prospects found</div>
            <p className="text-sm text-subtle max-w-md mx-auto">
              Try adjusting your open thresholds, clearing the search query, or selecting "All Time" to view older activity.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-elevated/60 text-xs font-semibold text-subtle uppercase border-b border-line">
                <tr>
                  <th className="py-3.5 px-4">Prospect</th>
                  <th className="py-3.5 px-4 text-center">Intent Tier</th>
                  <th className="py-3.5 px-4 text-center">Opens</th>
                  <th className="py-3.5 px-4 text-center">Clicks</th>
                  <th className="py-3.5 px-4">Last Active</th>
                  <th className="py-3.5 px-4">Pipeline</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {prospects.map((p) => {
                  const isHot = p.intent_tier === 'hot' || p.total_opens >= 3 || p.total_clicks >= 1;
                  const isMultiOpen = p.total_opens >= 2;

                  return (
                    <tr key={p.subscriber_id} className="hover:bg-elevated/40 transition-colors">
                      {/* Prospect Info */}
                      <td className="py-3.5 px-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-heading truncate">
                              {p.name || p.email.split('@')[0]}
                            </span>
                            {p.plan_tier && p.plan_tier !== 'free' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                {p.plan_tier}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-subtle truncate mt-0.5 font-mono">{p.email}</div>
                          {p.tags && p.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                              {p.tags.slice(0, 3).map((tag, i) => (
                                <span
                                  key={i}
                                  className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded bg-field text-dim border border-field-line"
                                >
                                  <Tag className="w-2.5 h-2.5" />
                                  {tag}
                                </span>
                              ))}
                              {p.tags.length > 3 && (
                                <span className="text-[10px] text-dim">+{p.tags.length - 3}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Intent Tier */}
                      <td className="py-3.5 px-4 text-center">
                        {isHot ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 shadow-sm">
                            <Flame className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                            Hot
                          </span>
                        ) : p.intent_tier === 'warm' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                            Warm
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                            Cold
                          </span>
                        )}
                      </td>

                      {/* Opens */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="inline-flex items-center gap-1.5 font-semibold">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-xs ${
                              p.total_opens >= 5
                                ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                                : p.total_opens >= 3
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : p.total_opens >= 2
                                ? 'bg-blue-500/10 text-blue-400'
                                : 'bg-field text-heading'
                            }`}
                          >
                            {p.total_opens} {p.total_opens === 1 ? 'open' : 'opens'}
                          </span>
                        </div>
                      </td>

                      {/* Clicks */}
                      <td className="py-3.5 px-4 text-center">
                        {p.total_clicks > 0 ? (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              {p.total_clicks} {p.total_clicks === 1 ? 'click' : 'clicks'}
                            </span>
                            {p.clicked_urls && p.clicked_urls.length > 0 && (
                              <div
                                className="text-[10px] text-dim max-w-[140px] truncate"
                                title={p.clicked_urls.join('\n')}
                              >
                                {p.clicked_urls[0].replace(/^https?:\/\/(www\.)?/, '')}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-dim text-xs">—</span>
                        )}
                      </td>

                      {/* Last Active */}
                      <td className="py-3.5 px-4">
                        <div className="text-xs font-medium text-heading">{formatTimeAgo(p.last_active_at)}</div>
                        {p.last_active_at && (
                          <div className="text-[11px] text-dim mt-0.5">
                            {new Date(p.last_active_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        )}
                      </td>

                      {/* Pipeline Stage */}
                      <td className="py-3.5 px-4">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium"
                          style={{
                            backgroundColor: `${p.pipeline_stage_color || '#64748b'}20`,
                            color: p.pipeline_stage_color || '#64748b',
                            border: `1px solid ${p.pipeline_stage_color || '#64748b'}40`,
                          }}
                        >
                          {p.pipeline_stage || 'New'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleOpenInbox(p)}
                            title="Open email conversation thread in Inbox"
                            className="p-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => navigate(`/subscribers/${p.subscriber_id}`)}
                            title="View prospect profile"
                            className="p-1.5 rounded-lg hover:bg-elevated text-dim hover:text-heading transition-colors"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {total > 0 && (
          <div className="p-4 border-t border-line bg-card flex items-center justify-between text-xs text-subtle">
            <div>
              Showing {((page - 1) * limit + 1).toLocaleString()} to{' '}
              {Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()} prospects
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="p-1.5 rounded bg-field border border-field-line text-heading hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-medium text-heading px-2">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-1.5 rounded bg-field border border-field-line text-heading hover:bg-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
