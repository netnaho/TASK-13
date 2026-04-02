import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/Toaster';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Listings from './pages/Listings';
import ListingDetail from './pages/ListingDetail';
import Conversations from './pages/Conversations';
import AdminConfig from './pages/admin/Config';
import AdminSettlements from './pages/admin/Settlements';
import AdminAudit from './pages/admin/Audit';
import AdminExports from './pages/admin/Exports';
import AdminQuery from './pages/admin/Query';

export default function App() {
  return (
    <BrowserRouter>
      <Toaster />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/listings" replace />} />
          <Route path="listings" element={<Listings />} />
          <Route path="listings/:id" element={<ListingDetail />} />
          <Route path="conversations" element={<Conversations />} />
          <Route
            path="admin/config"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/settlements"
            element={
              <ProtectedRoute allowedRoles={['admin', 'vendor', 'ops_reviewer', 'finance_admin']}>
                <AdminSettlements />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/audit"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminAudit />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/exports"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminExports />
              </ProtectedRoute>
            }
          />
          <Route
            path="admin/query"
            element={
              <ProtectedRoute allowedRoles={['admin', 'vendor']}>
                <AdminQuery />
              </ProtectedRoute>
            }
          />
        </Route>
        <Route path="*" element={<Navigate to="/listings" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
