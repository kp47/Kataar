const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { generateMagicLinkToken, hashMagicLinkToken, signSession } = require('../utils/authTokens');
const { sendMagicLinkEmail } = require('../utils/mailer');
const { attachPatient } = require('../middleware/patientAuth');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 magic-link requests per email/IP window — enough for real use, blocks spam
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/request-link
 * body: { email, vendorSlug? } — vendorSlug is optional context so the
 * email can mention the business name; it doesn't scope the login itself.
 */
router.post('/request-link', requestLimiter, async (req, res) => {
  const { email, vendorSlug } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const { raw, hash } = generateMagicLinkToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  await pool.query(
    `INSERT INTO magic_links (email, token_hash, purpose, expires_at) VALUES (?, ?, 'patient_login', ?)`,
    [normalizedEmail, hash, expiresAt]
  );

  let businessName = null;
  if (vendorSlug) {
    const [[vendor]] = await pool.query(`SELECT business_name FROM vendors WHERE slug = ?`, [vendorSlug]);
    businessName = vendor?.business_name || null;
  }

  const redirectPath = vendorSlug ? `/q/${vendorSlug}` : '/dashboard';
  const link = `${process.env.APP_BASE_URL}/verify?token=${raw}&next=${encodeURIComponent(redirectPath)}`;

  await sendMagicLinkEmail({ to: normalizedEmail, link, businessName });

  res.json({ message: 'Check your email for a sign-in link. It expires in 15 minutes.' });
});

/**
 * POST /api/auth/verify
 * body: { token } — the raw token from the emailed link.
 */
router.post('/verify', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token.' });

  const hash = hashMagicLinkToken(token);
  const [[link]] = await pool.query(
    `SELECT * FROM magic_links WHERE token_hash = ? AND purpose = 'patient_login'`,
    [hash]
  );

  if (!link) return res.status(400).json({ error: 'This link is invalid.' });
  if (link.used_at) return res.status(400).json({ error: 'This link has already been used.' });
  if (new Date(link.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This link has expired. Please request a new one.' });
  }

  await pool.query(`UPDATE magic_links SET used_at = NOW() WHERE id = ?`, [link.id]);

  const session = signSession({ type: 'patient', email: link.email }, '30d');
  res.cookie('qw_patient_session', session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({ email: link.email });
});

router.get('/me', attachPatient, (req, res) => {
  res.json({ patient: req.patient || null });
});

router.post('/logout', (req, res) => {
  res.clearCookie('qw_patient_session');
  res.json({ ok: true });
});

module.exports = router;
