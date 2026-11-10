import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../stores/authStore';

export default function ProtectedRoute() {
  const isAuthenticated = useAuth((s) => s.isAuthenticated);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
