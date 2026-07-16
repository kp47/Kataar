import { useEffect, useState, useCallback } from 'react';
import { api, extractErrorMessage } from '../../api/client';
import { useVendorAuth } from '../../context/VendorAuthContext';
import { getSocket } from '../../socket';
import FlipNumber from '../../components/FlipNumber';
import VendorLayout from './VendorLayout';

export default function AdminPanel() {
  const { vendor } = useVendorAuth();
  const [state, setState] = useState(null);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchState = useCallback(async () => {
    try {
      const { data } = await api.get('/admin/queue/state');
      setState(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    if (!vendor) return undefined;
    const socket = getSocket();
    socket.emit('join-vendor-room', vendor.slug);
    const onUpdate = () => fetchState();
    socket.on('queue-update', onUpdate);
    const poll = setInterval(fetchState, 15000);
    return () => {
      socket.off('queue-update', onUpdate);
      socket.emit('leave-vendor-room', vendor.slug);
      clearInterval(poll);
    };
  }, [vendor, fetchState]);

  const runAction = async (fn) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await fn();
      if (data.message) setMessage(data.message);
      await fetchState();
      setComment('');
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const callNext = () => runAction(() => api.post('/admin/queue/next', { comment: comment || undefined }));
  const skip = () => runAction(() => api.post('/admin/queue/skip'));
  const pause = () => runAction(() => api.post('/admin/queue/pause', { reason: 'Paused from admin panel' }));
  const resume = () => runAction(() => api.post('/admin/queue/resume'));

  if (!state) {
    return (
      <VendorLayout>
        <p className="muted">Loading queue…</p>
      </VendorLayout>
    );
  }

  if (!state.session) {
    return (
      <VendorLayout>
        <div className="card">
          <p>You're not operating today based on your configured days. Adjust this in Settings if that's wrong.</p>
        </div>
      </VendorLayout>
    );
  }

  const { session, called, waiting } = state;

  return (
    <VendorLayout>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="eyebrow">Now serving</div>
          <FlipNumber value={session.currentTokenNumber || null} />
          <span className={`pill ${session.status === 'paused' ? 'pill-paused' : 'pill-called'}`}>
            {session.status === 'paused' ? 'Paused' : 'Open'}
          </span>

          {called && (
            <div style={{ marginTop: 16, textAlign: 'left' }}>
              <div className="row-between">
                <span>
                  Currently called: <strong>#{called.tokenNumber}</strong> {called.patientName ? `(${called.patientName})` : ''}
                </span>
                {called.skipUsed && <span className="pill pill-danger">Skip already used</span>}
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: 16, textAlign: 'left' }}>
            <label>Comment for next token (optional)</label>
            <input
              className="input"
              placeholder="e.g. Please have your insurance card ready"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn btn-primary btn-lg btn-block" onClick={callNext} disabled={busy || session.status === 'closed'}>
              Call next token
            </button>
            <div className="row">
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={skip} disabled={busy || !called}>
                Skip current
              </button>
              {session.status === 'paused' ? (
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={resume} disabled={busy}>
                  Resume queue
                </button>
              ) : (
                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={pause} disabled={busy}>
                  Pause queue
                </button>
              )}
            </div>
          </div>

          {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
          {error && <p className="error-text" style={{ marginTop: 12 }}>{error}</p>}
        </div>

        <div className="card">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <h3 style={{ fontSize: 15 }}>Waiting ({state.waitingCount})</h3>
          </div>
          {waiting.length === 0 ? (
            <p className="muted">No one waiting right now.</p>
          ) : (
            <table className="qtable">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((w) => (
                  <tr key={w.id}>
                    <td>{w.token_number}</td>
                    <td>{w.patient_name || '—'}</td>
                    <td>
                      {w.pushUsed && <span className="pill pill-waiting">Pushed</span>}{' '}
                      {w.skipUsed && <span className="pill pill-danger">No-show once</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </VendorLayout>
  );
}
