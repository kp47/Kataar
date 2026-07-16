import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, extractErrorMessage } from '../../api/client';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { getSocket } from '../../socket';
import FlipNumber from '../../components/FlipNumber';
import AdSlot from '../../components/AdSlot';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_LABEL = {
  waiting: 'Waiting',
  called: "It's your turn",
  served: 'Completed',
  skipped: 'Skipped — back in queue',
  forfeited: 'Forfeited',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

export default function QueuePage() {
  const { vendorSlug } = useParams();
  const { patient, loading: authLoading } = usePatientAuth();

  const [vendorInfo, setVendorInfo] = useState(null);
  const [vendorError, setVendorError] = useState('');

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [linkSent, setLinkSent] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [status, setStatus] = useState(null); // { token, queue }
  const [statusError, setStatusError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [pushing, setPushing] = useState(false);

  const pollRef = useRef(null);

  // Vendor info (name, hours) — public, no auth needed.
  useEffect(() => {
    api
      .get(`/public/${vendorSlug}/info`)
      .then(({ data }) => setVendorInfo(data.vendor))
      .catch((err) => setVendorError(extractErrorMessage(err)));
  }, [vendorSlug]);

  const fetchMyToken = useCallback(async () => {
    if (!patient) return;
    try {
      const { data } = await api.get(`/queue/${vendorSlug}/my-token`);
      setStatus(data);
      setStatusError('');
    } catch (err) {
      setStatusError(extractErrorMessage(err));
    }
  }, [patient, vendorSlug]);

  useEffect(() => {
    if (patient) fetchMyToken();
  }, [patient, fetchMyToken]);

  // Live updates via socket, with a light poll fallback every 20s in case a socket event is missed.
  useEffect(() => {
    if (!patient) return undefined;
    const socket = getSocket();
    socket.emit('join-vendor-room', vendorSlug);
    const onUpdate = () => fetchMyToken();
    socket.on('queue-update', onUpdate);

    pollRef.current = setInterval(fetchMyToken, 20000);
    return () => {
      socket.off('queue-update', onUpdate);
      socket.emit('leave-vendor-room', vendorSlug);
      clearInterval(pollRef.current);
    };
  }, [patient, vendorSlug, fetchMyToken]);

  // Personal push notification channel once we know our token id.
  useEffect(() => {
    if (!status?.token?.id) return undefined;
    const socket = getSocket();
    const eventName = `token-${status.token.id}-notification`;
    const handler = (payload) => setActionMessage(payload.message);
    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [status?.token?.id]);

  const requestLink = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!EMAIL_RE.test(email)) {
      setFormError('Please enter a valid email address.');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/request-link', { email, vendorSlug });
      setLinkSent(true);
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const getToken = async () => {
    setFormError('');
    setSubmitting(true);
    try {
      const { data } = await api.post(`/queue/${vendorSlug}/token`, { name: name || undefined });
      setStatus(data);
    } catch (err) {
      setFormError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const pushBack = async () => {
    if (!status?.token) return;
    setPushing(true);
    setActionMessage('');
    try {
      const { data } = await api.post(`/queue/${vendorSlug}/token/${status.token.id}/push`);
      setStatus(data);
      setActionMessage('Your turn has been pushed back — your place is held.');
    } catch (err) {
      setActionMessage(extractErrorMessage(err));
    } finally {
      setPushing(false);
    }
  };

  if (vendorError) {
    return (
      <div className="container" style={{ paddingTop: 80, textAlign: 'center' }}>
        <p className="error-text">{vendorError}</p>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <div className="topbar">
        <div className="brand">
          <span className="brand-mark" />
          QueueWise
        </div>
        <Link to="/" style={{ fontSize: 13, color: 'var(--slate)', textDecoration: 'none' }}>
          ← All businesses
        </Link>
      </div>

      <div className="container" style={{ paddingTop: 32 }}>
        <div className="eyebrow">{vendorInfo ? vendorInfo.business_name : 'Loading…'}</div>
        <h1 style={{ fontSize: 26, marginTop: 6 }}>Get your token</h1>

        {authLoading ? (
          <p className="muted" style={{ marginTop: 24 }}>
            Loading…
          </p>
        ) : !patient ? (
          <div className="card" style={{ marginTop: 24 }}>
            {linkSent ? (
              <div className="success-banner">
                Check <strong>{email}</strong> for a sign-in link. It expires in 15 minutes — tap it
                on this device to continue.
              </div>
            ) : (
              <form className="stack" onSubmit={requestLink}>
                <div className="field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
                {formError && <p className="error-text">{formError}</p>}
                <button className="btn btn-primary btn-block btn-lg" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Email me a sign-in link'}
                </button>
                <p className="muted" style={{ fontSize: 13 }}>
                  No password needed. We'll only use this to send you queue updates.
                </p>
              </form>
            )}
          </div>
        ) : status?.token ? (
          <TokenDashboard status={status} onPush={pushBack} pushing={pushing} actionMessage={actionMessage} />
        ) : (
          <div className="card stack" style={{ marginTop: 24 }}>
            <p className="muted">You're signed in as {patient.email}.</p>
            <div className="field">
              <label htmlFor="name">Your name (optional, helps the front desk)</label>
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {formError && <p className="error-text">{formError}</p>}
            <button className="btn btn-primary btn-block btn-lg" onClick={getToken} disabled={submitting}>
              {submitting ? 'Getting your token…' : 'Get my token'}
            </button>
          </div>
        )}

        {statusError && <p className="error-text" style={{ marginTop: 16 }}>{statusError}</p>}
      </div>
    </div>
  );
}

function TokenDashboard({ status, onPush, pushing, actionMessage }) {
  const { token, queue } = status;
  const canPush = token.status === 'waiting' && !token.pushUsed;

  return (
    <div className="stack" style={{ marginTop: 24 }}>
      <div className="card" style={{ textAlign: 'center' }}>
        <div className="eyebrow">Your token</div>
        <FlipNumber value={token.tokenNumber} />
        <span className={`pill ${token.status === 'called' ? 'pill-called' : token.status === 'waiting' ? 'pill-waiting' : 'pill-danger'}`}>
          {STATUS_LABEL[token.status] || token.status}
        </span>

        <div className="grid-2" style={{ marginTop: 20, textAlign: 'left' }}>
          <div className="stat-card">
            <div className="stat-number">{queue.nowServing ?? '—'}</div>
            <div className="stat-label">Now serving</div>
          </div>
          <div className="stat-card">
            <div className="stat-number">{token.status === 'waiting' ? queue.tokensAhead : '—'}</div>
            <div className="stat-label">People ahead of you</div>
          </div>
        </div>

        {token.status === 'waiting' && (
          <p className="muted" style={{ marginTop: 16 }}>
            Estimated wait: <strong style={{ color: 'var(--paper)' }}>~{queue.estimatedWaitMinutes} min</strong>{' '}
            <span style={{ fontSize: 12 }}>({queue.minutesPerToken} min/token, {queue.estimateBasis === 'live' ? 'live average' : "clinic's estimate"})</span>
          </p>
        )}

        {token.status === 'called' && (
          <p style={{ marginTop: 16, color: 'var(--green)', fontWeight: 600 }}>
            Please head to the counter now{token.vendorComment ? ` — "${token.vendorComment}"` : '.'}
          </p>
        )}

        {queue.sessionStatus === 'paused' && token.status === 'waiting' && (
          <p className="muted" style={{ marginTop: 12 }}>The queue is temporarily paused — you'll keep your place.</p>
        )}
      </div>

      {token.status === 'waiting' && (
        <div className="card">
          <div className="row-between">
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Need more time?</div>
              <p className="muted" style={{ fontSize: 13, marginTop: 2 }}>
                Push your turn back a few places, once per token, and keep your spot.
              </p>
            </div>
            <button className="btn btn-secondary" onClick={onPush} disabled={!canPush || pushing}>
              {pushing ? 'Pushing…' : token.pushUsed ? 'Already used' : 'Push back'}
            </button>
          </div>
        </div>
      )}

      {actionMessage && <div className="success-banner">{actionMessage}</div>}

      <AdSlot />
    </div>
  );
}
