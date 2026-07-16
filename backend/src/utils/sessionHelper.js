const { pool } = require('../config/db');

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

/** Returns YYYY-MM-DD for "today" — good enough for a single-timezone-per-vendor MVP. */
function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fetches vendor + settings, and gets-or-creates today's queue_sessions row.
 * Returns null if the vendor doesn't operate today (per operational_days).
 */
async function getOrCreateTodaySession(vendorId) {
  const [[vendor]] = await pool.query(
    `SELECT v.id, v.business_name, v.slug, s.*
     FROM vendors v JOIN vendor_settings s ON s.vendor_id = v.id
     WHERE v.id = ? AND v.is_active = 1`,
    [vendorId]
  );
  if (!vendor) return null;

  const today = todayDateString();
  const dayKey = DAY_KEYS[new Date().getDay()];
  const operationalDays = typeof vendor.operational_days === 'string'
    ? JSON.parse(vendor.operational_days)
    : vendor.operational_days;

  if (!operationalDays.includes(dayKey)) {
    return { vendor, session: null, closedToday: true };
  }

  let [[session]] = await pool.query(
    `SELECT * FROM queue_sessions WHERE vendor_id = ? AND session_date = ?`,
    [vendorId, today]
  );

  if (!session) {
    const [result] = await pool.query(
      `INSERT INTO queue_sessions (vendor_id, session_date, status, current_token_number, next_token_number)
       VALUES (?, ?, 'open', 0, 1)`,
      [vendorId, today]
    );
    [[session]] = await pool.query(`SELECT * FROM queue_sessions WHERE id = ?`, [result.insertId]);
  }

  return { vendor, session, closedToday: false };
}

function computeExpiry(settings, now = new Date()) {
  if (settings.expiry_policy === 'end_of_day') {
    const [h, m] = String(settings.close_time).split(':').map(Number);
    const end = new Date(now);
    end.setHours(h, m, 0, 0);
    return end;
  }
  return new Date(now.getTime() + Number(settings.expiry_hours) * 60 * 60 * 1000);
}

/**
 * Read-only snapshot of today's queue for a vendor — does NOT create a
 * queue_sessions row. Used by the public directory listing, where merely
 * browsing shouldn't have the side effect of "opening" a vendor's queue.
 */
async function getTodayLiveSnapshot(vendorId) {
  const today = todayDateString();
  const [[session]] = await pool.query(
    `SELECT * FROM queue_sessions WHERE vendor_id = ? AND session_date = ?`,
    [vendorId, today]
  );
  if (!session) {
    return { started: false, nowServing: null, waitingCount: 0, sessionStatus: null, sessionId: null };
  }
  const [[{ waitingCount }]] = await pool.query(
    `SELECT COUNT(*) AS waitingCount FROM tokens WHERE session_id = ? AND status = 'waiting'`,
    [session.id]
  );
  return {
    started: true,
    nowServing: session.current_token_number || null,
    waitingCount,
    sessionStatus: session.status,
    sessionId: session.id,
  };
}

/** True if today (per server clock) falls on one of the vendor's operational days. */
function operatesToday(operationalDays) {
  const days = typeof operationalDays === 'string' ? JSON.parse(operationalDays) : operationalDays;
  return days.includes(DAY_KEYS[new Date().getDay()]);
}

module.exports = {
  getOrCreateTodaySession,
  getTodayLiveSnapshot,
  operatesToday,
  computeExpiry,
  todayDateString,
  DAY_KEYS,
};
