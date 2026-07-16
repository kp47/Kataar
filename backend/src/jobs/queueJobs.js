const { pool } = require('../config/db');
const { advanceQueue } = require('../controllers/adminQueueController');
const { emitQueueUpdate } = require('../sockets');

/**
 * Runs periodically. Two responsibilities:
 *  1. If a "called" token has sat past the vendor's grace_window_minutes with
 *     no action from the counter, auto-skip it (same rule as the manual skip
 *     button) so one no-show doesn't stall everyone behind them.
 *  2. Any "waiting" or "called" token past its own expires_at is marked
 *     "expired" and freed from the queue.
 */
async function runQueueMaintenance() {
  // --- 1. Auto-skip overdue "called" tokens ---
  const [overdue] = await pool.query(
    `SELECT t.*, s.grace_window_minutes, qs.id AS session_row_id, v.slug AS vendor_slug
     FROM tokens t
     JOIN vendor_settings s ON s.vendor_id = t.vendor_id
     JOIN queue_sessions qs ON qs.id = t.session_id
     JOIN vendors v ON v.id = t.vendor_id
     WHERE t.status = 'called'
       AND t.called_at IS NOT NULL
       AND TIMESTAMPDIFF(MINUTE, t.called_at, NOW()) >= s.grace_window_minutes`
  );

  for (const token of overdue) {
    // eslint-disable-next-line no-await-in-loop
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      if (!token.skip_used) {
        const [[{ maxPos }]] = await conn.query(
          `SELECT COALESCE(MAX(queue_position), 0) AS maxPos FROM tokens WHERE session_id = ? AND status = 'waiting'`,
          [token.session_id]
        );
        await conn.query(
          `UPDATE tokens SET status = 'waiting', skip_used = 1, called_at = NULL, queue_position = ? WHERE id = ?`,
          [maxPos + 1, token.id]
        );
        await conn.query(
          `INSERT INTO call_events (session_id, vendor_id, token_id, event_type, comment) VALUES (?, ?, ?, 'skipped', 'auto: no response in grace window')`,
          [token.session_id, token.vendor_id, token.id]
        );
      } else {
        await conn.query(`UPDATE tokens SET status = 'forfeited' WHERE id = ?`, [token.id]);
        await conn.query(
          `INSERT INTO call_events (session_id, vendor_id, token_id, event_type, comment) VALUES (?, ?, ?, 'forfeited', 'auto: second no-show')`,
          [token.session_id, token.vendor_id, token.id]
        );
      }

      const [[session]] = await conn.query(`SELECT * FROM queue_sessions WHERE id = ?`, [token.session_id]);
      const result = await advanceQueue(conn, session, token.vendor_slug, null);
      await conn.commit();

      emitQueueUpdate(token.vendor_slug, {
        type: 'auto-skip',
        nowServing: result.called ? result.called.token_number : session.current_token_number,
      });
    } catch (err) {
      await conn.rollback();
      console.error('[queueJobs] auto-skip failed for token', token.id, err.message);
    } finally {
      conn.release();
    }
  }

  // --- 2. Expire stale tokens (waiting or called, past their own expiry) ---
  const [expireResult] = await pool.query(
    `UPDATE tokens SET status = 'expired'
     WHERE status IN ('waiting','called') AND expires_at < NOW()`
  );
  if (expireResult && expireResult.affectedRows) {
    console.log(`[queueJobs] expired ${expireResult.affectedRows} stale token(s)`);
  }
}

function startQueueMaintenanceLoop(intervalMs = 30000) {
  setInterval(() => {
    runQueueMaintenance().catch((err) => console.error('[queueJobs] maintenance run failed:', err.message));
  }, intervalMs);
  console.log(`[queueJobs] maintenance loop running every ${intervalMs / 1000}s`);
}

module.exports = { startQueueMaintenanceLoop, runQueueMaintenance };
