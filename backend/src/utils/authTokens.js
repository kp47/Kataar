const jwt = require('jsonwebtoken');
const crypto = require('crypto');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET;
const MAGIC_LINK_SECRET = process.env.MAGIC_LINK_SECRET;

// ---- Session JWTs (issued after successful magic-link verification or vendor login) ----

function signSession(payload, expiresIn = '30d') {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

function verifySession(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

// ---- Magic link one-time tokens ----
// We generate a random opaque token, send the raw value in the email link,
// and store only its hash in the DB so a DB leak can't be used to log in.

function generateMagicLinkToken() {
  const raw = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHmac('sha256', MAGIC_LINK_SECRET).update(raw).digest('hex');
  return { raw, hash };
}

function hashMagicLinkToken(raw) {
  return crypto.createHmac('sha256', MAGIC_LINK_SECRET).update(raw).digest('hex');
}

module.exports = {
  signSession,
  verifySession,
  generateMagicLinkToken,
  hashMagicLinkToken,
};
