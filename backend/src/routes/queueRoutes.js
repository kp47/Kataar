const express = require('express');
const { attachPatient } = require('../middleware/patientAuth');
const { createToken, getMyToken, pushToken } = require('../controllers/tokenController');

const router = express.Router();
router.use(attachPatient);

// No blanket auth gate here — each controller resolves identity itself,
// since whether a signed-in session is required depends on the vendor's
// require_verification setting (see tokenController.resolveIdentity).
router.post('/:vendorSlug/token', createToken);
router.get('/:vendorSlug/my-token', getMyToken);
router.post('/:vendorSlug/token/:tokenId/push', pushToken);

module.exports = router;
