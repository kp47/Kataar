const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const { generateOtp, hashOtp, signSession } = require('../utils/authTokens');
const { sendOtpEmail } = require('../utils/mailer');
const { attachPatient } = require('../middleware/patientAuth');

const router = express.Router();

const requestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 OTP requests per IP window — enough for real use, blocks spam
  message: { error: 'Too many sign-in attempts. Please wait a few minutes and try again.' },
});

const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // caps brute-force guessing of the 6-digit code
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/auth/request-otp
 * body: { email, vendorSlug? } — vendorSlug is optional context so the
 * email can mention the business name; it doesn't scope the login itself.
 */
router.post('/request-otp', requestLimiter, async (req, res) => {
  const { email, vendorSlug } = req.body || {};
  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  const normalizedEmail = email.trim().toLowerCase();

  const { code, hash } = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await pool.query(
    `INSERT INTO magic_links (email, token_hash, purpose, expires_at) VALUES (?, ?, 'patient_login', ?)`,
    [normalizedEmail, hash, expiresAt]
  );

  let businessName = null;
  if (vendorSlug) {
    const [[vendor]] = await pool.query(`SELECT business_name FROM vendors WHERE slug = ?`, [vendorSlug]);
    businessName = vendor?.business_name || null;
  }

  await sendOtpEmail({ to: normalizedEmail, code, businessName });

  res.json({ message: 'Check your email for a 6-digit code. It expires in 10 minutes.' });
});

/**
 * POST /api/auth/verify-otp
 * body: { email, code, name? } — name is only used the first time (registration);
 * once a patient has a saved name, later logins never need to ask again.
 */
router.post('/verify-otp', verifyLimiter, async (req, res) => {
  const { email, code, name } = req.body || {};
  if (!email || !code) return res.status(400).json({ error: 'Missing email or code.' });
  const normalizedEmail = email.trim().toLowerCase();

  const hash = hashOtp(code.trim());
  const [[otp]] = await pool.query(
    `SELECT * FROM magic_links WHERE email = ? AND token_hash = ? AND purpose = 'patient_login' AND used_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [normalizedEmail, hash]
  );

  if (!otp) return res.status(400).json({ error: 'That code is incorrect.' });
  if (new Date(otp.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This code has expired. Please request a new one.' });
  }

  await pool.query(`UPDATE magic_links SET used_at = NOW() WHERE id = ?`, [otp.id]);

  const trimmedName = name?.trim() || null;
  await pool.query(
    `INSERT INTO patients (email, name) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE name = COALESCE(?, name)`,
    [otp.email, trimmedName, trimmedName]
  );
  const [[patient]] = await pool.query(`SELECT name FROM patients WHERE email = ?`, [otp.email]);

  const session = signSession({ type: 'patient', email: otp.email, name: patient.name }, '30d');
  res.cookie('qw_patient_session', session, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  res.json({ email: otp.email, name: patient.name });
});

router.get('/me', attachPatient, (req, res) => {
  res.json({ patient: req.patient || null });
});

router.post('/logout', (req, res) => {
  res.clearCookie('qw_patient_session');
  res.json({ ok: true });
});

module.exports = router;
