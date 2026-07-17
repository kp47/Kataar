import { useEffect, useState } from 'react';
import { api, extractErrorMessage } from '../../api/client';
import VendorLayout from './VendorLayout';

const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/vendor/settings').then(({ data }) => setSettings(data.settings));
  }, []);

  const update = (key) => (e) => {
    const value =
      e.target.type === 'number' ? Number(e.target.value) : e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setSettings((s) => ({ ...s, [key]: value }));
    setSaved(false);
  };

  const toggleDay = (day) => {
    setSettings((s) => {
      const has = s.operational_days.includes(day);
      return { ...s, operational_days: has ? s.operational_days.filter((d) => d !== day) : [...s.operational_days, day] };
    });
    setSaved(false);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { data } = await api.put('/vendor/settings', settings);
      setSettings(data.settings);
      setSaved(true);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return (
      <VendorLayout>
        <p className="muted">Loading settings…</p>
      </VendorLayout>
    );
  }

  return (
    <VendorLayout>
      <form className="stack" style={{ maxWidth: 640 }} onSubmit={save}>
        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Patient sign-in</h3>
          <label className="row" style={{ gap: 10, alignItems: 'center', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!settings.require_verification}
              onChange={update('require_verification')}
            />
            <span>Require email verification before a patient can get a token</span>
          </label>
          <p className="muted" style={{ fontSize: 13 }}>
            {settings.require_verification
              ? 'Patients verify a 6-digit code sent to their email before getting a token.'
              : "Off: anyone can tap \"Get token\" instantly, no email needed. We'll remember their token on that device instead."}
          </p>
        </div>

        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Operational days &amp; hours</h3>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {DAYS.map((d) => (
              <button
                type="button"
                key={d.key}
                className="btn"
                style={{
                  padding: '8px 14px',
                  background: settings.operational_days.includes(d.key) ? 'var(--amber)' : 'var(--surface-raised)',
                  color: settings.operational_days.includes(d.key) ? 'var(--ink)' : 'var(--paper)',
                  border: '1px solid var(--border)',
                }}
                onClick={() => toggleDay(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Opens at</label>
              <input className="input" type="time" value={settings.open_time?.slice(0, 5)} onChange={update('open_time')} />
            </div>
            <div className="field">
              <label>Closes at</label>
              <input className="input" type="time" value={settings.close_time?.slice(0, 5)} onChange={update('close_time')} />
            </div>
          </div>
        </div>

        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Capacity &amp; wait estimate</h3>
          <div className="grid-2">
            <div className="field">
              <label>Daily token capacity</label>
              <input className="input" type="number" min={1} max={999} value={settings.daily_capacity} onChange={update('daily_capacity')} />
            </div>
            <div className="field">
              <label>Estimated minutes per token</label>
              <input
                className="input"
                type="number"
                min={1}
                max={240}
                value={settings.default_wait_minutes}
                onChange={update('default_wait_minutes')}
              />
            </div>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            Once you have real serving data today, the live estimate shown to patients gradually shifts toward your
            actual pace instead of this manual number.
          </p>
        </div>

        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Token expiry</h3>
          <div className="field">
            <label>When should an unused token expire?</label>
            <select className="input" value={settings.expiry_policy} onChange={update('expiry_policy')}>
              <option value="fixed_hours">A fixed number of hours after issue</option>
              <option value="end_of_day">At closing time, same day</option>
            </select>
          </div>
          {settings.expiry_policy === 'fixed_hours' && (
            <div className="field">
              <label>Valid for (hours)</label>
              <input className="input" type="number" step="0.5" min={0.5} max={12} value={settings.expiry_hours} onChange={update('expiry_hours')} />
            </div>
          )}
        </div>

        <div className="card stack">
          <h3 style={{ fontSize: 15 }}>Queue fairness rules</h3>
          <div className="grid-2">
            <div className="field">
              <label>Grace window before auto-skip (minutes)</label>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={settings.grace_window_minutes}
                onChange={update('grace_window_minutes')}
              />
            </div>
            <div className="field">
              <label>Positions moved back on push</label>
              <input
                className="input"
                type="number"
                min={1}
                max={20}
                value={settings.push_bump_positions}
                onChange={update('push_bump_positions')}
              />
            </div>
          </div>
        </div>

        {error && <p className="error-text">{error}</p>}
        {saved && <div className="success-banner">Settings saved.</div>}
        <button className="btn btn-primary btn-lg" disabled={saving} style={{ alignSelf: 'flex-start' }}>
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </VendorLayout>
  );
}
