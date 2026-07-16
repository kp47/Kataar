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

// ---- Email OTP codes ----
// We generate a short numeric code, email it to the user, and store only its
// hash in the DB so a DB leak can't be used to sign in as someone else.

function generateOtp() {
  const code = crypto.randomInt(0, 1000000).toString().padStart(6, '0');
  const hash = crypto.createHmac('sha256', MAGIC_LINK_SECRET).update(code).digest('hex');
  return { code, hash };
}

function hashOtp(code) {
  return crypto.createHmac('sha256', MAGIC_LINK_SECRET).update(code).digest('hex');
}

module.exports = {
  signSession,
  verifySession,
  generateOtp,
  hashOtp,
};
