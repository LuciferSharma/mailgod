import { useState, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, Users, Filter, FileText, GitBranch,
  Send, BarChart3, Clock, Settings, Mail, Sun, Moon, LogOut, Activity, BookOpen, Inbox, Bell,
  ChevronLeft, ChevronRight, KanbanSquare, Flame, MailCheck,
} from 'lucide-react';
import { useTheme } from '../../stores/themeStore';
import { useAuth } from '../../stores/authStore';
import { inboxApi } from '../../api';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/reminders', icon: Bell, label: 'Reminders' },
  { to: '/inbox', icon: Inbox, label: 'Inbox' },
  { to: '/pipeline', icon: KanbanSquare, label: 'Pipeline' },
  { to: '/subscribers', icon: Users, label: 'Subscribers' },
  { to: '/segments', icon: Filter, label: 'Segments' },
  { to: '/templates', icon: FileText, label: 'Templates' },
  { to: '/flows', icon: GitBranch, label: 'Flows' },
  { to: '/campaigns', icon: Send, label: 'Campaigns' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/activity', icon: Activity, label: 'Activity Log' },
  { to: '/engaged', icon: Flame, label: 'Engaged Leads' },
  { to: '/mailboxes', icon: MailCheck, label: 'Mailboxes' },
  { to: '/cron-jobs', icon: Clock, label: 'Scheduled Jobs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/guide', icon: BookOpen, label: 'Guide' },
];

const COLLAPSED_KEY = 'qrm:sidebar-collapsed';

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
function writeCollapsed(v: boolean) {
  try { localStorage.setItem(COLLAPSED_KEY, v ? '1' : '0'); } catch { /* */ }
}

export default function Sidebar() {
  const { theme, toggleTheme } = useTheme();
  const logout = useAuth((s) => s.logout);
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  useEffect(() => { writeCollapsed(collapsed); }, [collapsed]);

  // Global "[" toggles the sidebar
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '[') { e.preventDefault(); setCollapsed(c => !c); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const { data: inboxBadge } = useQuery({
    queryKey: ['inbox-unread-count'],
    queryFn: inboxApi.unreadCount,
    refetchInterval: 30000,
  });

  return (
    <aside
      className={`${collapsed ? 'w-14' : 'w-60'} bg-card border-r border-line text-heading flex flex-col shrink-0 transition-[width] duration-200 ease-out`}
    >
      <div className={`border-b border-line ${collapsed ? 'p-2.5' : 'p-4'} flex items-center ${collapsed ? 'justify-center' : 'justify-between'} gap-2`}>
        {collapsed ? (
          <div className="p-1.5 bg-blue-500/15 rounded-lg" title="QR Mailer">
            <Mail className="w-5 h-5 text-blue-500" />
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-blue-500/15 rounded-lg">
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <span className="text-lg font-bold text-heading">QR Mailer</span>
            </div>
            <p className="text-[11px] text-dim mt-1.5 ml-1">Email Marketing Platform</p>
          </div>
        )}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded hover:bg-elevated text-dim hover:text-body"
            title="Collapse sidebar (press [)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center pt-2 pb-1 border-b border-line">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded hover:bg-elevated text-dim hover:text-body"
            title="Expand sidebar (press [)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      <nav className={`flex-1 py-3 ${collapsed ? 'px-1.5' : 'px-2'}`}>
        {navItems.map(({ to, icon: Icon, label }) => {
          const isInbox = to === '/inbox';
          const unread = isInbox ? (inboxBadge?.unread || 0) : 0;
          const dueReminders = isInbox ? (inboxBadge?.due_reminders || 0) : 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                `flex items-center ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'} text-sm rounded-lg mb-0.5 transition-colors relative ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-500 font-medium'
                    : 'text-subtle hover:bg-elevated hover:text-heading'
                }`
              }
            >
              <div className="relative">
                <Icon className="w-4 h-4" />
                {/* Collapsed badge: red dot for unread, amber dot for reminders */}
                {collapsed && isInbox && unread > 0 && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-500 ring-2 ring-card" />
                )}
                {collapsed && isInbox && dueReminders > 0 && (
                  <span className="absolute -bottom-1 -right-1 w-1.5 h-1.5 rounded-full bg-amber-500" />
                )}
              </div>
              {!collapsed && (
                <>
                  <span className="flex-1">{label}</span>
                  {isInbox && unread > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500 text-white">
                      {unread > 99 ? '99+' : unread}
                    </span>
                  )}
                  {isInbox && dueReminders > 0 && (
                    <Bell className="w-3 h-3 text-amber-500 fill-amber-500" />
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className={`${collapsed ? 'px-1.5' : 'px-3'} pb-3 space-y-0.5`}>
        <button
          onClick={toggleTheme}
          title={collapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'} text-sm text-subtle hover:text-heading hover:bg-elevated rounded-lg transition-colors`}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {!collapsed && (theme === 'dark' ? 'Light Mode' : 'Dark Mode')}
        </button>
        <button
          onClick={logout}
          title={collapsed ? 'Logout' : undefined}
          className={`w-full flex items-center ${collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2'} text-sm text-subtle hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors`}
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && 'Logout'}
        </button>
      </div>

      {!collapsed && (
        <div className="p-4 border-t border-line text-[11px] text-dim">
          Mailgod · open source
        </div>
      )}
    </aside>
  );
}
