import { Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import MovementsPage from './pages/MovementsPage.jsx';
import RegistryPage from './pages/RegistryPage.jsx';

const routes = ({ setTokenState, token }) => [
  {
    path: '/login',
    element: <LoginPage onLogin={(newToken) => setTokenState(newToken)} />,
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
    path: '/',
    element: <Navigate to={token ? '/dashboard' : '/login'} replace />,
  },
];

export default routes;
