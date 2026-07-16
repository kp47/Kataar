const { pool } = require('../config/db');

/**
 * Computes the effective minutes-per-token estimate for a vendor's queue session.
 *
 * Strategy: use the actual average gap between consecutive "served" events
 * from *today's* session (this captures real-world pace: a doctor running
 * behind after lunch shows up here immediately). If we don't have enough
 * real data points yet (< MIN_SAMPLES), fall back to the vendor's manual
 * default_wait_minutes so early-morning estimates aren't wild guesses.
 *
 * We also weight toward *recent* serves more than the whole day's average,
 * so a slowdown this hour isn't hidden by a fast morning.
 */
const MIN_SAMPLES = 3;
const RECENT_WINDOW = 8; // consider the last N served tokens for the "recent pace"

async function getEffectiveWaitMinutes(sessionId, fallbackMinutes) {
  const [rows] = await pool.query(
    `SELECT called_at, served_at FROM tokens
     WHERE session_id = ? AND status = 'served' AND called_at IS NOT NULL AND served_at IS NOT NULL
     ORDER BY served_at DESC LIMIT ?`,
    [sessionId, RECENT_WINDOW]
  );

  if (rows.length < MIN_SAMPLES) {
    return { minutesPerToken: fallbackMinutes, basis: 'default', sampleSize: rows.length };
  }

  const durations = rows.map((r) => (new Date(r.served_at) - new Date(r.called_at)) / 60000);
  const avg = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Guard against outliers (e.g. someone left the counter idle for 40 min) skewing
  // the estimate too far from the vendor's own configured baseline.
  const bounded = Math.min(Math.max(avg, fallbackMinutes * 0.4), fallbackMinutes * 2.5);

  return { minutesPerToken: Math.round(bounded * 10) / 10, basis: 'live', sampleSize: rows.length };
}

module.exports = { getEffectiveWaitMinutes };
