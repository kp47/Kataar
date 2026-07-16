const { verifySession } = require('../utils/authTokens');

function requireVendor(req, res, next) {
  const cookieToken = req.cookies?.qw_vendor_session;
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  const token = cookieToken || bearer;

  if (!token) {
    return res.status(401).json({ error: 'Vendor login required.' });
  }
  const payload = verifySession(token);
  if (!payload || payload.type !== 'vendor') {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  req.vendor = { id: payload.vendorId, slug: payload.slug };
  next();
}

module.exports = { requireVendor };
