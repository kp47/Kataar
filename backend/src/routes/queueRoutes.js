const express = require('express');
const { attachPatient, requirePatient } = require('../middleware/patientAuth');
const { createToken, getMyToken, pushToken } = require('../controllers/tokenController');

const router = express.Router();
router.use(attachPatient);

router.post('/:vendorSlug/token', requirePatient, createToken);
router.get('/:vendorSlug/my-token', requirePatient, getMyToken);
router.post('/:vendorSlug/token/:tokenId/push', requirePatient, pushToken);

module.exports = router;
