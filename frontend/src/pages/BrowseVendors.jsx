import { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, extractErrorMessage } from '../api/client';
import FlipNumber from '../components/FlipNumber';

export default function BrowseVendors() {
  const navigate = useNavigate();
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchVendors = useCallback(() => {
    setLoading(true);
    api
      .get('/public/vendors', { params: { search: search || undefined, category: category || undefined } })
      .then(({ data }) => setVendors(data.vendors))
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [search, category]);

  useEffect(() => {
    api.get('/public/categories').then(({ data }) => setCategories(data.categories));
  }, []);

  // Debounced search-as-you-type.
  useEffect(() => {
    const t = setTimeout(fetchVendors, 300);
    return () => clearTimeout(t);
  }, [fetchVendors]);

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          QueueWise
        </div>
        <Link to="/vendor/signup" className="btn btn-secondary">
          For businesses
        </Link>
      </div>

      <div className="container-wide" style={{ paddingTop: 32 }}>
        <div className="eyebrow">Find a queue</div>
        <h1 style={{ fontSize: 28, marginTop: 6 }}>Pick where you're headed</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          See the live number and estimated wait before you leave the house.
        </p>

        <div className="row" style={{ marginTop: 24, flexWrap: 'wrap' }}>
          <input
            className="input"
            style={{ maxWidth: 320 }}
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input" style={{ maxWidth: 220 }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {error && (
          <p className="error-text" style={{ marginTop: 24 }}>
            {error}
          </p>
        )}

        {loading ? (
          <p className="muted" style={{ marginTop: 32 }}>
            Loading…
          </p>
        ) : vendors.length === 0 ? (
          <p className="muted" style={{ marginTop: 32 }}>
            No businesses match your search yet.
          </p>
        ) : (
          <div className="stack" style={{ marginTop: 28, gap: 12 }}>
            {vendors.map((v) => (
              <VendorCard key={v.id} vendor={v} onSelect={() => navigate(`/q/${v.slug}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function VendorCard({ vendor, onSelect }) {
  const started = vendor.sessionStatus !== null && vendor.sessionStatus !== undefined;
  return (
    <div className="card row-between" style={{ flexWrap: 'wrap', gap: 16 }}>
      <div style={{ minWidth: 220 }}>
        <div className="row" style={{ gap: 8 }}>
          <h3 style={{ fontSize: 17 }}>{vendor.businessName}</h3>
          {!vendor.openToday ? (
            <span className="pill pill-danger">Closed today</span>
          ) : vendor.sessionStatus === 'paused' ? (
            <span className="pill pill-paused">Paused</span>
          ) : (
            <span className="pill pill-called">Open</span>
          )}
        </div>
        <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {vendor.category}
        </p>
      </div>

      {vendor.openToday && (
        <div className="row" style={{ gap: 24 }}>
          <div style={{ textAlign: 'center' }}>
            <FlipNumber value={started ? vendor.nowServing : null} size="small" />
            <div className="stat-label">Now serving</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div className="stat-number" style={{ fontSize: 20 }}>
              {vendor.waitingCount}
            </div>
            <div className="stat-label">Waiting</div>
          </div>
          <div style={{ textAlign: 'center', minWidth: 90 }}>
            <div className="stat-number" style={{ fontSize: 20 }}>
              {vendor.estimatedWaitMinutes != null ? `~${vendor.estimatedWaitMinutes}m` : '—'}
            </div>
            <div className="stat-label">Est. wait for a new token</div>
          </div>
        </div>
      )}

      <button className="btn btn-primary" onClick={onSelect} disabled={!vendor.openToday}>
        {vendor.openToday ? 'Get token' : 'Closed today'}
      </button>
    </div>
  );
}
