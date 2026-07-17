const crypto = require('crypto');
const { pool } = require('../config/db');
const { getOrCreateTodaySession, computeExpiry } = require('../utils/sessionHelper');
const { getEffectiveWaitMinutes } = require('../utils/estimator');
const { emitQueueUpdate, emitPatientNotification } = require('../sockets');

const DEVICE_COOKIE = 'qw_device';
const DEVICE_COOKIE_MAX_AGE = 365 * 24 * 60 * 60 * 1000;

/**
 * Resolves who's making this request. Vendors that require email verification
 * need a signed-in patient session; vendors that don't fall back to an
 * anonymous per-browser device id (no email/OTP involved at all), stored in
 * the `patient_email` column as a synthetic `device:<uuid>` identity so the
 * rest of the queue logic (dedupe, "my token" lookup, push ownership) doesn't
 * need to know the difference. Returns null if there's no identity to use —
 * `mint` controls whether a missing device cookie should be created (true for
 * token creation, false for read-only checks, so polling doesn't hand out
 * cookies to visitors who've never gotten a token).
 */
function resolveIdentity(req, res, requireVerification, { mint = false } = {}) {
  if (requireVerification) {
    return req.patient ? { email: req.patient.email, name: req.patient.name || null } : null;
  }

  let deviceId = req.cookies?.[DEVICE_COOKIE];
  if (!deviceId) {
    if (!mint) return null;
    deviceId = crypto.randomUUID();
    res.cookie(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: DEVICE_COOKIE_MAX_AGE,
    });
  }
  return { email: `device:${deviceId}`, name: null };
}

/** Re-persists queue_position as a clean 1..N sequence for a given ordered list of token ids. */
async function persistOrder(conn, orderedIds) {
  for (let i = 0; i < orderedIds.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await conn.query(`UPDATE tokens SET queue_position = ? WHERE id = ?`, [i + 1, orderedIds[i]]);
  }
}

/** Builds the status payload a patient's dashboard polls/subscribes to. */
async function buildStatusPayload(session, token) {
  const [[settings]] = await pool.query(`SELECT * FROM vendor_settings WHERE vendor_id = ?`, [session.vendor_id]);
  const { minutesPerToken, basis } = await getEffectiveWaitMinutes(session.id, settings.default_wait_minutes);

  let tokensAhead = 0;
  if (token.status === 'waiting') {
    const [[{ cnt }]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM tokens WHERE session_id = ? AND status = 'waiting' AND queue_position < ?`,
      [session.id, token.queue_position]
    );
    tokensAhead = cnt;
  }

  return {
    token: {
      id: token.id,
      tokenNumber: token.token_number,
      status: token.status,
      pushUsed: !!token.push_used,
      skipUsed: !!token.skip_used,
      expiresAt: token.expires_at,
      vendorComment: token.vendor_comment,
    },
    queue: {
      nowServing: session.current_token_number,
      tokensAhead,
      estimatedWaitMinutes: token.status === 'waiting' ? Math.round(tokensAhead * minutesPerToken) : 0,
      minutesPerToken,
      estimateBasis: basis,
      sessionStatus: session.status,
    },
  };
}

/** POST /api/queue/:vendorSlug/token — create a new token for the current patient. */
async function createToken(req, res) {
  const { vendorSlug } = req.params;

  const [[vendorRow]] = await pool.query(
    `SELECT v.id, vs.require_verification FROM vendors v JOIN vendor_settings vs ON vs.vendor_id = v.id
     WHERE v.slug = ? AND v.is_active = 1`,
    [vendorSlug]
  );
  if (!vendorRow) return res.status(404).json({ error: 'This business could not be found.' });

  const identity = resolveIdentity(req, res, !!vendorRow.require_verification, { mint: true });
  if (!identity) return res.status(401).json({ error: 'Please sign in to continue.' });
  const patientEmail = identity.email;
  const patientName = identity.name;

  const { vendor, session, closedToday } = await getOrCreateTodaySession(vendorRow.id);
  if (closedToday) return res.status(400).json({ error: `${vendor.business_name} is closed today.` });
  if (session.status === 'closed') return res.status(400).json({ error: 'This queue is closed for the day.' });

  // One active token per patient per vendor per day.
  const [[activeExisting]] = await pool.query(
    `SELECT id FROM tokens WHERE session_id = ? AND patient_email = ? AND status IN ('waiting','called') LIMIT 1`,
    [session.id, patientEmail]
  );
  if (activeExisting) {
    return res.status(409).json({ error: 'You already have an active token for this queue today.', tokenId: activeExisting.id });
  }

  if (session.next_token_number - 1 >= vendor.daily_capacity) {
    return res.status(400).json({ error: "Today's tokens are full. Please try again tomorrow or check with the front desk." });
  }

  const expiresAt = computeExpiry(vendor);
  const tokenNumber = session.next_token_number;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO tokens (session_id, vendor_id, token_number, queue_position, patient_email, patient_name, status, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?)`,
      [session.id, vendor.id, tokenNumber, tokenNumber, patientEmail, patientName, expiresAt]
    );
    await conn.query(`UPDATE queue_sessions SET next_token_number = next_token_number + 1 WHERE id = ?`, [session.id]);
    await conn.commit();

    const [[freshSession]] = await pool.query(`SELECT * FROM queue_sessions WHERE id = ?`, [session.id]);
    emitQueueUpdate(vendorSlug, { type: 'token-created', nowServing: freshSession.current_token_number });

    const [[token]] = await pool.query(`SELECT * FROM tokens WHERE id = ?`, [result.insertId]);
    const payload = await buildStatusPayload(freshSession, token);
    res.status(201).json(payload);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** GET /api/queue/:vendorSlug/my-token — current token status for the current patient. */
async function getMyToken(req, res) {
  const { vendorSlug } = req.params;

  const [[vendor]] = await pool.query(
    `SELECT v.id, vs.require_verification FROM vendors v JOIN vendor_settings vs ON vs.vendor_id = v.id WHERE v.slug = ?`,
    [vendorSlug]
  );
  if (!vendor) return res.status(404).json({ error: 'This business could not be found.' });

  const identity = resolveIdentity(req, res, !!vendor.require_verification, { mint: false });
  if (!identity) return res.json({ token: null, queue: null });
  const patientEmail = identity.email;

  const { session } = await getOrCreateTodaySession(vendor.id);
  if (!session) return res.json({ token: null, queue: null });

  const [[token]] = await pool.query(
    `SELECT * FROM tokens WHERE session_id = ? AND patient_email = ?
     AND status IN ('waiting','called','served','skipped') ORDER BY id DESC LIMIT 1`,
    [session.id, patientEmail]
  );
  if (!token) return res.json({ token: null, queue: { nowServing: session.current_token_number, sessionStatus: session.status } });

  const payload = await buildStatusPayload(session, token);
  res.json(payload);
}

/** POST /api/queue/:vendorSlug/token/:tokenId/push — one-time bounded push-back. */
async function pushToken(req, res) {
  const { vendorSlug, tokenId } = req.params;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[token]] = await conn.query(`SELECT * FROM tokens WHERE id = ? FOR UPDATE`, [tokenId]);
    if (!token) {
      await conn.rollback();
      return res.status(404).json({ error: 'Token not found.' });
    }

    const [[settings]] = await conn.query(
      `SELECT require_verification, push_bump_positions FROM vendor_settings WHERE vendor_id = ?`,
      [token.vendor_id]
    );
    const identity = resolveIdentity(req, res, !!settings.require_verification, { mint: false });
    if (!identity || token.patient_email !== identity.email) {
      await conn.rollback();
      return res.status(404).json({ error: 'Token not found.' });
    }
    if (token.status !== 'waiting') {
      await conn.rollback();
      return res.status(400).json({ error: 'You can only push a token while it is still waiting to be called.' });
    }
    if (token.push_used) {
      await conn.rollback();
      return res.status(400).json({ error: 'You have already used your one push for this token.' });
    }

    const bump = settings.push_bump_positions;

    const [waitingList] = await conn.query(
      `SELECT id FROM tokens WHERE session_id = ? AND status = 'waiting' ORDER BY queue_position ASC FOR UPDATE`,
      [token.session_id]
    );
    const ids = waitingList.map((r) => r.id);
    const currentIndex = ids.indexOf(token.id);
    if (currentIndex === -1) {
      await conn.rollback();
      return res.status(400).json({ error: 'Token is no longer in the waiting queue.' });
    }

    const newIndex = Math.min(currentIndex + bump, ids.length - 1);
    const affectedIds = ids.slice(currentIndex + 1, newIndex + 1); // people who move UP because of this push
    ids.splice(currentIndex, 1);
    ids.splice(newIndex, 0, token.id);

    await persistOrder(conn, ids);
    await conn.query(`UPDATE tokens SET push_used = 1 WHERE id = ?`, [token.id]);
    await conn.query(
      `INSERT INTO call_events (session_id, vendor_id, token_id, event_type, comment) VALUES (?, ?, ?, 'pushed', ?)`,
      [token.session_id, token.vendor_id, token.id, `Pushed back ${newIndex - currentIndex} position(s)`]
    );

    // Notify only the patients who moved up as a result — not the whole queue.
    for (const affectedId of affectedIds) {
      // eslint-disable-next-line no-await-in-loop
      await conn.query(
        `INSERT INTO notifications (token_id, message) VALUES (?, ?)`,
        [affectedId, `Good news — token #${token.token_number} pushed back, so you moved up one spot.`]
      );
      emitPatientNotification(vendorSlug, affectedId, { message: 'You moved up a spot in the queue.' });
    }

    await conn.commit();
    emitQueueUpdate(vendorSlug, { type: 'token-pushed', tokenNumber: token.token_number });

    const [[freshSession]] = await pool.query(`SELECT * FROM queue_sessions WHERE id = ?`, [token.session_id]);
    const [[freshToken]] = await pool.query(`SELECT * FROM tokens WHERE id = ?`, [token.id]);
    const payload = await buildStatusPayload(freshSession, freshToken);
    res.json(payload);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { createToken, getMyToken, pushToken, buildStatusPayload, persistOrder };
