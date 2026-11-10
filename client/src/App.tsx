import { Routes, Route, Navigate } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import SubscribersPage from './pages/SubscribersPage';
import SubscriberProfilePage from './pages/SubscriberProfilePage';
import SegmentsPage from './pages/SegmentsPage';
import TemplatesPage from './pages/TemplatesPage';
import FlowsPage from './pages/FlowsPage';
import FlowBuilderPage from './pages/FlowBuilderPage';
import CampaignsPage from './pages/CampaignsPage';
import CampaignDetailPage from './pages/CampaignDetailPage';
import AnalyticsPage from './pages/AnalyticsPage';
import CronJobsPage from './pages/CronJobsPage';
import SettingsPage from './pages/SettingsPage';
import ActivityPage from './pages/ActivityPage';
import EngagedLeadsPage from './pages/EngagedLeadsPage';
import GuidePage from './pages/GuidePage';
import InboxPage from './pages/InboxPage';
import PipelinePage from './pages/PipelinePage';
import SegmentDetailPage from './pages/SegmentDetailPage';
import RemindersPage from './pages/RemindersPage';
import MailboxesPage from './pages/MailboxesPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/reminders" element={<RemindersPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/pipeline" element={<PipelinePage />} />
          <Route path="/subscribers" element={<SubscribersPage />} />
          <Route path="/subscribers/:id" element={<SubscriberProfilePage />} />
          <Route path="/segments" element={<SegmentsPage />} />
          <Route path="/segments/:id" element={<SegmentDetailPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/flows" element={<FlowsPage />} />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/campaigns/:id" element={<CampaignDetailPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/activity" element={<ActivityPage />} />
          <Route path="/engaged" element={<EngagedLeadsPage />} />
          <Route path="/mailboxes" element={<MailboxesPage />} />
          <Route path="/cron-jobs" element={<CronJobsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/guide" element={<GuidePage />} />
        </Route>
        <Route path="/flows/:id" element={<FlowBuilderPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
