import { Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MovementsPage from './pages/MovementsPage.jsx';
import RegistryPage from './pages/RegistryPage.jsx';
import JobDetailPage from './pages/JobDetailPage.jsx';
import RecurringTemplatesPage from './pages/RecurringTemplatesPage.jsx';
import UsersAdminPage from './pages/UsersAdminPage.jsx';
import RoadmapPage from './pages/RoadmapPage.jsx';
import { can } from './services/api.js';

const routes = ({ setTokenState, token }) => [
  {
    path: '/login',
    element: token ? (
      <Navigate to="/dashboard" replace />
    ) : (
      <LoginPage onLogin={(newToken) => setTokenState(newToken)} />
    ),
  },
  {
    path: '/dashboard',
    element: token ? <DashboardPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/movements',
    element: token ? <MovementsPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/registry',
    element: token ? <RegistryPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/jobs/:id',
    element: token ? <JobDetailPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/recurring',
    element: token ? <RecurringTemplatesPage /> : <Navigate to="/login" replace />,
  },
  {
    path: '/users',
    element: token ? (can('manage_users') ? <UsersAdminPage /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },
  {
    path: '/roadmap',
    element: token ? (can('read', 'roadmap') ? <RoadmapPage /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />,
  },
  {
    path: '/',
    element: token ? <Navigate to="/dashboard" replace /> : <Navigate to="/login" replace />,
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
];

export default routes;
