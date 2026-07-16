const express = require('express');
const { pool } = require('../config/db');
const { getOrCreateTodaySession, getTodayLiveSnapshot, operatesToday } = require('../utils/sessionHelper');
const { getEffectiveWaitMinutes } = require('../utils/estimator');

const router = express.Router();

/**
 * GET /api/public/vendors?search=&category=
 * The customer-facing directory: browse/search active vendors, with a live
 * snapshot of each one's queue. Read-only — does not create today's session
 * for vendors just because someone is browsing.
 */
router.get('/vendors', async (req, res) => {
  const { search, category } = req.query;

  const clauses = ['v.is_active = 1'];
  const params = [];
  if (search) {
    clauses.push('v.business_name LIKE ?');
    params.push(`%${search}%`);
  }
  if (category) {
    clauses.push('v.category = ?');
    params.push(category);
  }

  const [vendors] = await pool.query(
    `SELECT v.id, v.business_name, v.slug, v.category, v.city, s.operational_days, s.open_time, s.close_time, s.default_wait_minutes
     FROM vendors v JOIN vendor_settings s ON s.vendor_id = v.id
     WHERE ${clauses.join(' AND ')}
     ORDER BY v.business_name ASC
     LIMIT 200`,
    params
  );

  // Small directories (typical for an early rollout) — a snapshot query per vendor is fine.
  // If this grows into the thousands, batch these into a couple of grouped queries instead.
  const results = await Promise.all(
    vendors.map(async (v) => {
      const today = operatesToday(v.operational_days);
      if (!today) {
        return {
          id: v.id,
          businessName: v.business_name,
          slug: v.slug,
          category: v.category,
          city: v.city,
          openToday: false,
          nowServing: null,
          waitingCount: 0,
          estimatedWaitMinutes: null,
        };
      }
      const snapshot = await getTodayLiveSnapshot(v.id);
      const { minutesPerToken } = snapshot.sessionId
        ? await getEffectiveWaitMinutes(snapshot.sessionId, v.default_wait_minutes)
        : { minutesPerToken: v.default_wait_minutes };

      return {
        id: v.id,
        businessName: v.business_name,
        slug: v.slug,
        category: v.category,
        city: v.city,
        openToday: true,
        sessionStatus: snapshot.sessionStatus, // null until the vendor's first token of the day
        nowServing: snapshot.nowServing,
        waitingCount: snapshot.waitingCount,
        minutesPerToken,
        estimatedWaitMinutes: Math.round(snapshot.waitingCount * minutesPerToken),
        openTime: v.open_time,
        closeTime: v.close_time,
      };
    })
  );

  res.json({ vendors: results });
});

/** GET /api/public/categories — distinct categories currently in use, for the filter dropdown */
router.get('/categories', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT DISTINCT category FROM vendors WHERE is_active = 1 ORDER BY category ASC`
  );
  res.json({ categories: rows.map((r) => r.category) });
});

/**
 * GET /api/public/:vendorSlug/info — vendor info plus a live queue snapshot.
 * The route itself needs no auth (it's a simple lookup), but the frontend only
 * reveals the live snapshot fields (nowServing/waitingCount/estimatedWaitMinutes)
 * to the customer after they've verified their email — pre-verification they only
 * see the vendor's name/category, matching the "vendors first, counter after
 * verification" flow.
 */
router.get('/:vendorSlug/info', async (req, res) => {
  const [[vendor]] = await pool.query(
    `SELECT v.id, v.business_name, v.slug, v.category, v.city, s.open_time, s.close_time, s.operational_days, s.default_wait_minutes
     FROM vendors v JOIN vendor_settings s ON s.vendor_id = v.id
     WHERE v.slug = ? AND v.is_active = 1`,
    [req.params.vendorSlug]
  );
  if (!vendor) return res.status(404).json({ error: 'This business could not be found.' });
  vendor.operational_days = typeof vendor.operational_days === 'string' ? JSON.parse(vendor.operational_days) : vendor.operational_days;

  const openToday = operatesToday(vendor.operational_days);
  vendor.openToday = openToday;
  if (openToday) {
    const snapshot = await getTodayLiveSnapshot(vendor.id);
    const { minutesPerToken } = snapshot.sessionId
      ? await getEffectiveWaitMinutes(snapshot.sessionId, vendor.default_wait_minutes)
      : { minutesPerToken: vendor.default_wait_minutes };
    vendor.sessionStatus = snapshot.sessionStatus;
    vendor.nowServing = snapshot.nowServing;
    vendor.waitingCount = snapshot.waitingCount;
    vendor.minutesPerToken = minutesPerToken;
    vendor.estimatedWaitMinutes = Math.round(snapshot.waitingCount * minutesPerToken);
  } else {
    vendor.sessionStatus = null;
    vendor.nowServing = null;
    vendor.waitingCount = 0;
    vendor.estimatedWaitMinutes = null;
  }

  res.json({ vendor });
});

/** GET /api/public/:vendorSlug/board — for the waiting-room screen / live dashboard, no login needed */
router.get('/:vendorSlug/board', async (req, res) => {
  const [[vendor]] = await pool.query(`SELECT id, business_name FROM vendors WHERE slug = ? AND is_active = 1`, [req.params.vendorSlug]);
  if (!vendor) return res.status(404).json({ error: 'This business could not be found.' });

  const { session, closedToday } = await getOrCreateTodaySession(vendor.id);
  if (closedToday || !session) {
    return res.json({ businessName: vendor.business_name, open: false, nowServing: null, waitingCount: 0 });
  }

  const [[settings]] = await pool.query(`SELECT default_wait_minutes FROM vendor_settings WHERE vendor_id = ?`, [vendor.id]);
  const [[{ waitingCount }]] = await pool.query(
    `SELECT COUNT(*) AS waitingCount FROM tokens WHERE session_id = ? AND status = 'waiting'`,
    [session.id]
  );
  const { minutesPerToken } = await getEffectiveWaitMinutes(session.id, settings.default_wait_minutes);

  res.json({
    businessName: vendor.business_name,
    open: session.status !== 'closed',
    sessionStatus: session.status,
    nowServing: session.current_token_number || null,
    waitingCount,
    minutesPerToken,
  });
});

module.exports = router;
