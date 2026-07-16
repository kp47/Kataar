const { pool } = require('../config/db');
const { getOrCreateTodaySession } = require('../utils/sessionHelper');
const { emitQueueUpdate } = require('../sockets');

/**
 * Shared core: marks any currently-"called" token as served, then calls
 * the next waiting token (by queue_position). Used by the explicit
 * "Call next" action and after a skip.
 */
async function advanceQueue(conn, session, vendorSlug, comment) {
  const [[currentlyCalled]] = await conn.query(
    `SELECT * FROM tokens WHERE session_id = ? AND status = 'called' LIMIT 1 FOR UPDATE`,
    [session.id]
  );
  if (currentlyCalled) {
    await conn.query(`UPDATE tokens SET status = 'served', served_at = NOW() WHERE id = ?`, [currentlyCalled.id]);
    await conn.query(
      `INSERT INTO call_events (session_id, vendor_id, token_id, event_type) VALUES (?, ?, ?, 'served')`,
      [session.id, session.vendor_id, currentlyCalled.id]
    );
  }

  const [[next]] = await conn.query(
    `SELECT * FROM tokens WHERE session_id = ? AND status = 'waiting' ORDER BY queue_position ASC LIMIT 1 FOR UPDATE`,
    [session.id]
  );

  if (!next) {
    await conn.query(`UPDATE queue_sessions SET last_called_at = NOW() WHERE id = ?`, [session.id]);
    return { called: null };
  }

  await conn.query(
    `UPDATE tokens SET status = 'called', called_at = NOW(), vendor_comment = ? WHERE id = ?`,
    [comment || null, next.id]
  );
  await conn.query(
    `UPDATE queue_sessions SET current_token_number = ?, last_called_at = NOW() WHERE id = ?`,
    [next.token_number, session.id]
  );
  await conn.query(
    `INSERT INTO call_events (session_id, vendor_id, token_id, event_type, comment) VALUES (?, ?, ?, 'called', ?)`,
    [session.id, session.vendor_id, next.id, comment || null]
  );

  return { called: { ...next, status: 'called', vendor_comment: comment || null } };
}

/** POST /api/admin/queue/next  body: { comment? } */
async function callNext(req, res) {
  const { comment } = req.body || {};
  const { session } = await getOrCreateTodaySession(req.vendor.id);
  if (!session) return res.status(400).json({ error: 'Not operating today.' });
  if (session.status === 'closed') return res.status(400).json({ error: 'Queue is closed.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await advanceQueue(conn, session, req.vendor.slug, comment);
    await conn.commit();

    emitQueueUpdate(req.vendor.slug, {
      type: 'next-called',
      nowServing: result.called ? result.called.token_number : session.current_token_number,
    });
    res.json({
      called: result.called
        ? { id: result.called.id, tokenNumber: result.called.token_number, comment: result.called.vendor_comment }
        : null,
      message: result.called ? null : 'No one is waiting in the queue right now.',
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * POST /api/admin/queue/skip — the currently-called token didn't show up.
 * First offense: sent back into the queue (skip tolerance used).
 * Second offense on the same token: forfeited entirely.
 * Either way, immediately calls the next token so the line keeps moving.
 */
async function skipCurrent(req, res) {
  const { session } = await getOrCreateTodaySession(req.vendor.id);
  if (!session) return res.status(400).json({ error: 'Not operating today.' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[current]] = await conn.query(
      `SELECT * FROM tokens WHERE session_id = ? AND status = 'called' LIMIT 1 FOR UPDATE`,
      [session.id]
    );
    if (!current) {
      await conn.rollback();
      return res.status(400).json({ error: 'No token is currently called.' });
    }

    if (!current.skip_used) {
      const [[{ maxPos }]] = await conn.query(
        `SELECT COALESCE(MAX(queue_position), 0) AS maxPos FROM tokens WHERE session_id = ? AND status = 'waiting'`,
        [session.id]
      );
      await conn.query(
        `UPDATE tokens SET status = 'waiting', skip_used = 1, called_at = NULL, queue_position = ? WHERE id = ?`,
        [maxPos + 1, current.id]
      );
      await conn.query(
        `INSERT INTO call_events (session_id, vendor_id, token_id, event_type) VALUES (?, ?, ?, 'skipped')`,
        [session.id, session.vendor_id, current.id]
      );
    } else {
      await conn.query(`UPDATE tokens SET status = 'forfeited' WHERE id = ?`, [current.id]);
      await conn.query(
        `INSERT INTO call_events (session_id, vendor_id, token_id, event_type) VALUES (?, ?, ?, 'forfeited')`,
        [session.id, session.vendor_id, current.id]
      );
    }

    const result = await advanceQueue(conn, session, req.vendor.slug, null);
    await conn.commit();

    emitQueueUpdate(req.vendor.slug, {
      type: 'skipped',
      nowServing: result.called ? result.called.token_number : session.current_token_number,
    });
    res.json({
      skippedTokenNumber: current.token_number,
      outcome: current.skip_used ? 'forfeited' : 'sent-to-back-of-queue',
      called: result.called ? { id: result.called.id, tokenNumber: result.called.token_number } : null,
    });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** POST /api/admin/queue/pause  body: { reason? } */
async function pauseQueue(req, res) {
  const { reason } = req.body || {};
  const { session } = await getOrCreateTodaySession(req.vendor.id);
  if (!session) return res.status(400).json({ error: 'Not operating today.' });

  await pool.query(`UPDATE queue_sessions SET status = 'paused', pause_reason = ? WHERE id = ?`, [reason || null, session.id]);
  emitQueueUpdate(req.vendor.slug, { type: 'paused', reason: reason || null });
  res.json({ ok: true, status: 'paused' });
}

/** POST /api/admin/queue/resume */
async function resumeQueue(req, res) {
  const { session } = await getOrCreateTodaySession(req.vendor.id);
  if (!session) return res.status(400).json({ error: 'Not operating today.' });

  await pool.query(`UPDATE queue_sessions SET status = 'open', pause_reason = NULL WHERE id = ?`, [session.id]);
  emitQueueUpdate(req.vendor.slug, { type: 'resumed' });
  res.json({ ok: true, status: 'open' });
}

/** GET /api/admin/queue/state — the receptionist's live view */
async function getQueueState(req, res) {
  const { session } = await getOrCreateTodaySession(req.vendor.id);
  if (!session) return res.json({ session: null, called: null, waiting: [] });

  const [[called]] = await pool.query(`SELECT * FROM tokens WHERE session_id = ? AND status = 'called' LIMIT 1`, [session.id]);
  const [waiting] = await pool.query(
    `SELECT id, token_number, patient_name, push_used, skip_used, created_at FROM tokens
     WHERE session_id = ? AND status = 'waiting' ORDER BY queue_position ASC LIMIT 50`,
    [session.id]
  );

  res.json({
    session: { id: session.id, status: session.status, pauseReason: session.pause_reason, currentTokenNumber: session.current_token_number },
    called: called ? { id: called.id, tokenNumber: called.token_number, calledAt: called.called_at, patientName: called.patient_name, skipUsed: !!called.skip_used } : null,
    waiting: waiting.map((w) => ({ ...w, pushUsed: !!w.push_used, skipUsed: !!w.skip_used })),
    waitingCount: waiting.length,
  });
}

module.exports = { callNext, skipCurrent, pauseQueue, resumeQueue, getQueueState, advanceQueue };
