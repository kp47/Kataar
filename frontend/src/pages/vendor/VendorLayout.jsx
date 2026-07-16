import { NavLink, useNavigate } from 'react-router-dom';
import { useVendorAuth } from '../../context/VendorAuthContext';

const tabs = [
  { to: '/vendor/admin', label: 'Queue' },
  { to: '/vendor/settings', label: 'Settings' },
  { to: '/vendor/analytics', label: 'Analytics' },
];

export default function VendorLayout({ children }) {
  const { vendor, logout } = useVendorAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/vendor/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          QueueWise
        </div>
        <div className="row" style={{ gap: 20 }}>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              style={({ isActive }) => ({
                fontSize: 14,
                fontWeight: 600,
                color: isActive ? 'var(--amber)' : 'var(--slate)',
                textDecoration: 'none',
              })}
            >
              {t.label}
            </NavLink>
          ))}
          <button className="btn btn-secondary" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>
      <div className="container-wide">
        {vendor && (
          <div className="row-between" style={{ marginBottom: 20 }}>
            <div>
              <h1 style={{ fontSize: 22 }}>{vendor.business_name}</h1>
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                Patient link: <code>{window.location.origin}/q/{vendor.slug}</code> &nbsp;·&nbsp; Waiting-room board:{' '}
                <code>{window.location.origin}/board/{vendor.slug}</code>
              </p>
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
