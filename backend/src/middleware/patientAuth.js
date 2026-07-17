const { verifySession } = require('../utils/authTokens');

/**
 * Reads the patient session cookie. Populates req.patient = { email, name }.
 * Does NOT reject the request if missing/invalid — whether a route needs a
 * signed-in patient depends on the vendor's require_verification setting,
 * which each queue controller checks itself (see tokenController.resolveIdentity).
 */
function attachPatient(req, res, next) {
  const cookieToken = req.cookies?.qw_patient_session;
  if (cookieToken) {
    const payload = verifySession(cookieToken);
    if (payload && payload.type === 'patient') {
      req.patient = { email: payload.email, name: payload.name || null };
    }
  }
  next();
}

module.exports = { attachPatient };
