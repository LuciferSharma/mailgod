import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import ErrorBoundary from '../ErrorBoundary';

export default function AppLayout() {
  const location = useLocation();

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">
        <ErrorBoundary key={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
