const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
const { signSession } = require('../utils/authTokens');
const { requireVendor } = require('../middleware/vendorAuth');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const DEFAULT_SETTINGS = {
  operational_days: JSON.stringify(['mon', 'tue', 'wed', 'thu', 'fri', 'sat']),
  open_time: '09:00:00',
  close_time: '18:00:00',
  default_wait_minutes: 10,
  daily_capacity: 60,
  expiry_policy: 'fixed_hours',
  expiry_hours: 2.0,
  grace_window_minutes: 3,
  push_bump_positions: 4,
};

/** POST /api/vendor-auth/signup */
router.post('/signup', async (req, res) => {
  const { businessName, email, password, contactPhone, category, city } = req.body || {};
  if (!businessName || !email || !password) {
    return res.status(400).json({ error: 'Business name, email and password are required.' });
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

  const normalizedEmail = email.trim().toLowerCase();
  const [[existing]] = await pool.query(`SELECT id FROM vendors WHERE email = ?`, [normalizedEmail]);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  let baseSlug = slugify(businessName) || 'business';
  let slug = baseSlug;
  let suffix = 1;
  // eslint-disable-next-line no-await-in-loop
  while ((await pool.query(`SELECT id FROM vendors WHERE slug = ?`, [slug]))[0].length) {
    suffix += 1;
    slug = `${baseSlug}-${suffix}`;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO vendors (business_name, slug, email, password_hash, contact_phone, category, city) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [businessName.trim(), slug, normalizedEmail, passwordHash, contactPhone || null, category || 'Other', city || null]
    );
    const vendorId = result.insertId;
    await conn.query(
      `INSERT INTO vendor_settings (vendor_id, operational_days, open_time, close_time, default_wait_minutes,
        daily_capacity, expiry_policy, expiry_hours, grace_window_minutes, push_bump_positions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vendorId,
        DEFAULT_SETTINGS.operational_days,
        DEFAULT_SETTINGS.open_time,
        DEFAULT_SETTINGS.close_time,
        DEFAULT_SETTINGS.default_wait_minutes,
        DEFAULT_SETTINGS.daily_capacity,
        DEFAULT_SETTINGS.expiry_policy,
        DEFAULT_SETTINGS.expiry_hours,
        DEFAULT_SETTINGS.grace_window_minutes,
        DEFAULT_SETTINGS.push_bump_positions,
      ]
    );
    await conn.commit();

    const session = signSession({ type: 'vendor', vendorId, slug }, '7d');
    res.cookie('qw_vendor_session', session, {
      httpOnly: true,
      sameSite: 'none',
      secure: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.status(201).json({ vendorId, slug, businessName: businessName.trim() });
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
});

/** POST /api/vendor-auth/login */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const [[vendor]] = await pool.query(`SELECT * FROM vendors WHERE email = ?`, [email.trim().toLowerCase()]);
  if (!vendor) return res.status(401).json({ error: 'Invalid email or password.' });

  const match = await bcrypt.compare(password, vendor.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

  const session = signSession({ type: 'vendor', vendorId: vendor.id, slug: vendor.slug }, '7d');
  res.cookie('qw_vendor_session', session, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.json({ vendorId: vendor.id, slug: vendor.slug, businessName: vendor.business_name });
});

router.post('/logout', (req, res) => {
  res.clearCookie('qw_vendor_session', { sameSite: 'none', secure: true });
  res.json({ ok: true });
});

router.get('/me', requireVendor, async (req, res) => {
  const [[vendor]] = await pool.query(
    `SELECT id, business_name, slug, email, contact_phone, category, city FROM vendors WHERE id = ?`,
    [req.vendor.id]
  );
  res.json({ vendor });
});

module.exports = router;
