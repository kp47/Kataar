const express = require('express');
const { requireVendor } = require('../middleware/vendorAuth');
const { callNext, skipCurrent, pauseQueue, resumeQueue, getQueueState } = require('../controllers/adminQueueController');

const router = express.Router();
router.use(requireVendor);

router.get('/state', getQueueState);
router.post('/next', callNext);
router.post('/skip', skipCurrent);
router.post('/pause', pauseQueue);
router.post('/resume', resumeQueue);

module.exports = router;
