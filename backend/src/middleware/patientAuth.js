const { verifySession } = require('../utils/authTokens');

/**
 * Reads the patient session cookie. Populates req.patient = { email }.
 * Does NOT reject the request if missing/invalid — many patient routes
 * (e.g. viewing a public board) don't require login. Use requirePatient
 * below on routes that do.
 */
function attachPatient(req, res, next) {
  const cookieToken = req.cookies?.qw_patient_session;
  if (cookieToken) {
    const payload = verifySession(cookieToken);
    if (payload && payload.type === 'patient') {
      req.patient = { email: payload.email };
    }
  }
  next();
}

function requirePatient(req, res, next) {
  if (!req.patient) {
    return res.status(401).json({ error: 'Please sign in to continue.' });
  }
  next();
}

module.exports = { attachPatient, requirePatient };
