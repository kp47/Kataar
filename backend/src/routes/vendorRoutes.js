const express = require('express');
const { pool } = require('../config/db');
const { requireVendor } = require('../middleware/vendorAuth');
const { DAY_KEYS } = require('../utils/sessionHelper');

const router = express.Router();
router.use(requireVendor);

/** GET /api/vendor/settings */
router.get('/settings', async (req, res) => {
  const [[settings]] = await pool.query(`SELECT * FROM vendor_settings WHERE vendor_id = ?`, [req.vendor.id]);
  if (!settings) return res.status(404).json({ error: 'Settings not found.' });
  settings.operational_days =
    typeof settings.operational_days === 'string' ? JSON.parse(settings.operational_days) : settings.operational_days;
  res.json({ settings });
});

/** PUT /api/vendor/settings */
router.put('/settings', async (req, res) => {
  const {
    operational_days,
    open_time,
    close_time,
    default_wait_minutes,
    daily_capacity,
    expiry_policy,
    expiry_hours,
    grace_window_minutes,
    push_bump_positions,
    require_verification,
    timezone,
  } = req.body || {};

  const errors = [];
  if (operational_days && (!Array.isArray(operational_days) || !operational_days.every((d) => DAY_KEYS.includes(d)))) {
    errors.push('operational_days must be an array of valid day keys (mon, tue, ...).');
  }
  if (expiry_policy && !['fixed_hours', 'end_of_day'].includes(expiry_policy)) {
    errors.push('expiry_policy must be "fixed_hours" or "end_of_day".');
  }
  if (default_wait_minutes !== undefined && (default_wait_minutes < 1 || default_wait_minutes > 240)) {
    errors.push('default_wait_minutes must be between 1 and 240.');
  }
  if (daily_capacity !== undefined && (daily_capacity < 1 || daily_capacity > 999)) {
    errors.push('daily_capacity must be between 1 and 999.');
  }
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const fields = {
    operational_days: operational_days ? JSON.stringify(operational_days) : undefined,
    open_time,
    close_time,
    default_wait_minutes,
    daily_capacity,
    expiry_policy,
    expiry_hours,
    grace_window_minutes,
    push_bump_positions,
    require_verification: require_verification === undefined ? undefined : require_verification ? 1 : 0,
    timezone,
  };
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return res.status(400).json({ error: 'No fields to update.' });

  const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
  const values = entries.map(([, v]) => v);

  await pool.query(`UPDATE vendor_settings SET ${setClause} WHERE vendor_id = ?`, [...values, req.vendor.id]);
  const [[updated]] = await pool.query(`SELECT * FROM vendor_settings WHERE vendor_id = ?`, [req.vendor.id]);
  updated.operational_days =
    typeof updated.operational_days === 'string' ? JSON.parse(updated.operational_days) : updated.operational_days;
  res.json({ settings: updated });
});

module.exports = router;
