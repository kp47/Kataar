import { Routes, Route, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import BrowseVendors from './pages/BrowseVendors';
import QueuePage from './pages/patient/QueuePage';
import VendorSignup from './pages/vendor/VendorSignup';
import VendorLogin from './pages/vendor/VendorLogin';
import AdminPanel from './pages/vendor/AdminPanel';
import Settings from './pages/vendor/Settings';
import Analytics from './pages/vendor/Analytics';
import PublicBoard from './pages/PublicBoard';
import { useVendorAuth } from './context/VendorAuthContext';

function RequireVendor({ children }) {
  const { vendor, loading } = useVendorAuth();
  if (loading) return <div className="container" style={{ paddingTop: 80 }}>Loading…</div>;
  if (!vendor) return <Navigate to="/vendor/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<BrowseVendors />} />
      <Route path="/for-business" element={<Landing />} />
      <Route path="/q/:vendorSlug" element={<QueuePage />} />
      <Route path="/board/:vendorSlug" element={<PublicBoard />} />

      <Route path="/vendor/signup" element={<VendorSignup />} />
      <Route path="/vendor/login" element={<VendorLogin />} />
      <Route
        path="/vendor/admin"
        element={
          <RequireVendor>
            <AdminPanel />
          </RequireVendor>
        }
      />
      <Route
        path="/vendor/settings"
        element={
          <RequireVendor>
            <Settings />
          </RequireVendor>
        }
      />
      <Route
        path="/vendor/analytics"
        element={
          <RequireVendor>
            <Analytics />
          </RequireVendor>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
