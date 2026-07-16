import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, extractErrorMessage } from '../../api/client';
import { useVendorAuth } from '../../context/VendorAuthContext';

const CATEGORIES = ['Clinic / Hospital', 'Salon & Spa', 'Government Office', 'Bank', 'Retail Store', 'Restaurant', 'Other'];

export default function VendorSignup() {
  const navigate = useNavigate();
  const { refresh } = useVendorAuth();
  const [form, setForm] = useState({ businessName: '', email: '', password: '', contactPhone: '', category: CATEGORIES[0] });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.businessName || !form.email || !form.password) {
      setError('Business name, email, and password are required.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/vendor-auth/signup', form);
      await refresh();
      navigate('/vendor/admin', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 440, paddingTop: 64 }}>
      <div className="brand" style={{ marginBottom: 24 }}>
        <span className="brand-mark" />
        QueueWise
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 4 }}>Set up your queue</h1>
      <p className="muted" style={{ marginBottom: 24 }}>Free to get started. Takes about a minute.</p>

      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label>Business name</label>
          <input className="input" value={form.businessName} onChange={update('businessName')} placeholder="Dr. Mehta's Clinic" />
        </div>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={form.email} onChange={update('email')} placeholder="you@business.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={form.password} onChange={update('password')} placeholder="At least 8 characters" />
        </div>
        <div className="field">
          <label>Category</label>
          <select className="input" value={form.category} onChange={update('category')}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Contact phone (optional)</label>
          <input className="input" value={form.contactPhone} onChange={update('contactPhone')} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>
        Already have an account? <Link to="/vendor/login">Log in</Link>
      </p>
    </div>
  );
}
