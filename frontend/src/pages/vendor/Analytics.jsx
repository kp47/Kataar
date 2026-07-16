import { useEffect, useState } from 'react';
import { api, extractErrorMessage } from '../../api/client';
import VendorLayout from './VendorLayout';

export default function Analytics() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/admin/analytics/summary', { params: { days } })
      .then(({ data }) => setData(data))
      .catch((err) => setError(extractErrorMessage(err)));
  }, [days]);

  return (
    <VendorLayout>
      <div className="row-between" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 16 }}>Last</h3>
        <select className="input" style={{ width: 140 }} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>Today</option>
          <option value={7}>7 days</option>
          <option value={30}>30 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {error && <p className="error-text">{error}</p>}

      {data && (
        <div className="stack">
          <div className="grid-2">
            <div className="stat-card">
              <div className="stat-number">{data.totals.totalTokens}</div>
              <div className="stat-label">Tokens issued</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.totals.served}</div>
              <div className="stat-label">Served</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.averageWaitMinutes ?? '—'}</div>
              <div className="stat-label">Avg. minutes per token</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{data.totals.noShowRatePercent}%</div>
              <div className="stat-label">No-show / forfeit rate</div>
            </div>
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Tokens by hour of day</h3>
            {data.tokensByHour.length === 0 ? (
              <p className="muted">No data yet.</p>
            ) : (
              <div className="row" style={{ alignItems: 'flex-end', gap: 6, height: 120 }}>
                {data.tokensByHour.map((h) => {
                  const max = Math.max(...data.tokensByHour.map((x) => x.count));
                  const heightPct = Math.max((h.count / max) * 100, 6);
                  return (
                    <div key={h.hour} title={`${h.hour}:00 — ${h.count} tokens`} style={{ textAlign: 'center', flex: 1 }}>
                      <div style={{ height: `${heightPct}%`, background: 'var(--amber)', borderRadius: 3 }} />
                      <div style={{ fontSize: 10, color: 'var(--slate)', marginTop: 4 }}>{h.hour}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Daily breakdown</h3>
            <table className="qtable">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Issued</th>
                  <th>Served</th>
                </tr>
              </thead>
              <tbody>
                {data.dailyBreakdown.map((d) => (
                  <tr key={d.session_date}>
                    <td>{d.session_date}</td>
                    <td>{d.issued}</td>
                    <td>{d.served}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </VendorLayout>
  );
}
