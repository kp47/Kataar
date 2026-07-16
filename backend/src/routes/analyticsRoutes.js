const express = require('express');
const { pool } = require('../config/db');
const { requireVendor } = require('../middleware/vendorAuth');

const router = express.Router();
router.use(requireVendor);

/** GET /api/admin/analytics/summary?days=7 */
router.get('/summary', async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 90);

  const [totals] = await pool.query(
    `SELECT
       COUNT(*) AS totalTokens,
       SUM(status = 'served') AS served,
       SUM(status = 'forfeited') AS forfeited,
       SUM(status = 'expired') AS expired,
       SUM(status = 'cancelled') AS cancelled
     FROM tokens
     WHERE vendor_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [req.vendor.id, days]
  );

  const [[avgWaitRow]] = await pool.query(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, called_at, served_at)) AS avgMinutes
     FROM tokens
     WHERE vendor_id = ? AND status = 'served' AND called_at IS NOT NULL AND served_at IS NOT NULL
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
    [req.vendor.id, days]
  );

  const [byHour] = await pool.query(
    `SELECT HOUR(created_at) AS hour, COUNT(*) AS count
     FROM tokens
     WHERE vendor_id = ? AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY HOUR(created_at) ORDER BY hour`,
    [req.vendor.id, days]
  );

  const [byDay] = await pool.query(
    `SELECT qs.session_date, COUNT(t.id) AS issued, SUM(t.status = 'served') AS served
     FROM tokens t JOIN queue_sessions qs ON qs.id = t.session_id
     WHERE t.vendor_id = ? AND qs.session_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     GROUP BY qs.session_date ORDER BY qs.session_date`,
    [req.vendor.id, days]
  );

  const t = totals[0];
  const noShowRate = t.totalTokens ? Math.round(((t.forfeited || 0) / t.totalTokens) * 1000) / 10 : 0;

  res.json({
    rangeDays: days,
    totals: {
      totalTokens: t.totalTokens || 0,
      served: t.served || 0,
      forfeited: t.forfeited || 0,
      expired: t.expired || 0,
      cancelled: t.cancelled || 0,
      noShowRatePercent: noShowRate,
    },
    averageWaitMinutes: avgWaitRow.avgMinutes ? Math.round(avgWaitRow.avgMinutes * 10) / 10 : null,
    tokensByHour: byHour,
    dailyBreakdown: byDay,
  });
});

module.exports = router;
