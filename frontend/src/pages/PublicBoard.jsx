import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api, extractErrorMessage } from '../api/client';
import { getSocket } from '../socket';
import FlipNumber from '../components/FlipNumber';

export default function PublicBoard() {
  const { vendorSlug } = useParams();
  const [board, setBoard] = useState(null);
  const [error, setError] = useState('');

  const fetchBoard = useCallback(() => {
    api
      .get(`/public/${vendorSlug}/board`)
      .then(({ data }) => setBoard(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [vendorSlug]);

  useEffect(() => {
    fetchBoard();
    const socket = getSocket();
    socket.emit('join-vendor-room', vendorSlug);
    socket.on('queue-update', fetchBoard);
    const poll = setInterval(fetchBoard, 15000);
    return () => {
      socket.off('queue-update', fetchBoard);
      socket.emit('leave-vendor-room', vendorSlug);
      clearInterval(poll);
    };
  }, [vendorSlug, fetchBoard]);

  if (error) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p className="error-text">{error}</p>
      </div>
    );
  }
  if (!board) return null;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
      <div className="eyebrow" style={{ fontSize: 18 }}>{board.businessName}</div>

      {!board.open ? (
        <h1 style={{ fontSize: 32 }}>Closed today</h1>
      ) : (
        <>
          <div className="eyebrow">Now serving</div>
          <FlipNumber value={board.nowServing} size="large" />
          <div className="row" style={{ gap: 40, marginTop: 12 }}>
            <div style={{ textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: 36 }}>{board.waitingCount}</div>
              <div className="stat-label">Waiting</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div className="stat-number" style={{ fontSize: 36 }}>{board.minutesPerToken}</div>
              <div className="stat-label">Min / token</div>
            </div>
          </div>
          {board.sessionStatus === 'paused' && (
            <p className="muted" style={{ marginTop: 16, fontSize: 18 }}>Queue temporarily paused</p>
          )}
        </>
      )}
    </div>
  );
}
