import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, extractErrorMessage } from '../../api/client';
import { useVendorAuth } from '../../context/VendorAuthContext';

export default function VendorLogin() {
  const navigate = useNavigate();
  const { refresh } = useVendorAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.post('/vendor-auth/login', { email, password });
      await refresh();
      navigate('/vendor/admin', { replace: true });
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ maxWidth: 400, paddingTop: 88 }}>
      <div className="brand" style={{ marginBottom: 24 }}>
        <span className="brand-mark" />
        QueueWise
      </div>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Vendor login</h1>

      <form className="card stack" onSubmit={submit}>
        <div className="field">
          <label>Email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </div>
        <div className="field">
          <label>Password</label>
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>

      <p className="muted" style={{ marginTop: 16, fontSize: 14 }}>
        New here? <Link to="/vendor/signup">Set up your queue</Link>
      </p>
    </div>
  );
}
