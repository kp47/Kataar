// Populates the database with demo vendors, settings, and several days of
// realistic queue history — so the app has something to look at immediately
// after setup instead of empty screens everywhere.
//
// Safe to re-run: it deletes any existing demo vendors (matched by email)
// before re-inserting, so `npm run seed` is idempotent.
//
// Run with: npm run seed
const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');
require('dotenv').config();

const DEMO_PASSWORD = 'Demo@1234';

const DEMO_VENDORS = [
  {
    businessName: 'GreenLeaf Clinic',
    slug: 'greenleaf-clinic',
    email: 'demo.clinic@queuewise.test',
    category: 'Clinic / Hospital',
    defaultWaitMinutes: 12,
    dailyCapacity: 50,
    seedHistory: true, // this one gets a full multi-day analytics history
  },
  {
    businessName: 'Glow Salon & Spa',
    slug: 'glow-salon-spa',
    email: 'demo.salon@queuewise.test',
    category: 'Salon & Spa',
    defaultWaitMinutes: 20,
    dailyCapacity: 30,
    seedHistory: false,
  },
  {
    businessName: 'Metro Bank Branch',
    slug: 'metro-bank-branch',
    email: 'demo.bank@queuewise.test',
    category: 'Bank',
    defaultWaitMinutes: 8,
    dailyCapacity: 80,
    seedHistory: false,
  },
  {
    businessName: 'City Registrar Office',
    slug: 'city-registrar-office',
    email: 'demo.gov@queuewise.test',
    category: 'Government Office',
    defaultWaitMinutes: 15,
    dailyCapacity: 40,
    seedHistory: false,
  },
];

const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

function dateNDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}
function dateString(d) {
  return d.toISOString().slice(0, 10);
}
function atTime(date, hours, minutes) {
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d;
}

async function upsertVendor(conn, v) {
  await conn.query(`DELETE FROM vendors WHERE email = ?`, [v.email]); // cascades settings/sessions/tokens

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const [result] = await conn.query(
    `INSERT INTO vendors (business_name, slug, email, password_hash, category, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
    [v.businessName, v.slug, v.email, passwordHash, v.category]
  );
  const vendorId = result.insertId;

  await conn.query(
    `INSERT INTO vendor_settings (vendor_id, operational_days, open_time, close_time, default_wait_minutes,
      daily_capacity, expiry_policy, expiry_hours, grace_window_minutes, push_bump_positions)
     VALUES (?, ?, '09:00:00', '18:00:00', ?, ?, 'fixed_hours', 2.0, 3, 4)`,
    [vendorId, JSON.stringify(ALL_DAYS), v.defaultWaitMinutes, v.dailyCapacity]
  );

  return vendorId;
}

/** Creates a closed, fully-served past day so Analytics has a real shape to show. */
async function seedPastDay(conn, vendorId, daysAgo, tokenCount) {
  const day = dateNDaysAgo(daysAgo);
  const [sessionResult] = await conn.query(
    `INSERT INTO queue_sessions (vendor_id, session_date, status, current_token_number, next_token_number)
     VALUES (?, ?, 'closed', ?, ?)`,
    [vendorId, dateString(day), tokenCount, tokenCount + 1]
  );
  const sessionId = sessionResult.insertId;

  let cursor = atTime(day, 9, 0);
  for (let i = 1; i <= tokenCount; i += 1) {
    const gapMinutes = 6 + Math.round(Math.random() * 10); // 6-16 min per token, mimics real pace variance
    const calledAt = new Date(cursor);
    const servedAt = new Date(calledAt.getTime() + (2 + Math.random() * 6) * 60000);
    cursor = new Date(calledAt.getTime() + gapMinutes * 60000);

    const roll = Math.random();
    const status = roll < 0.04 ? 'forfeited' : roll < 0.07 ? 'expired' : 'served';

    await conn.query(
      `INSERT INTO tokens (session_id, vendor_id, token_number, queue_position, patient_email, status,
        called_at, served_at, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        vendorId,
        i,
        i,
        `demo.patient${i}.${daysAgo}@example.com`,
        status,
        status === 'expired' ? null : calledAt,
        status === 'served' ? servedAt : null,
        atTime(day, 8, 30 + i),
        new Date(calledAt.getTime() + 2 * 60 * 60000),
      ]
    );
  }
}

/** Creates today's live, open session with a realistic in-progress mix: served, called, and waiting tokens. */
async function seedToday(conn, vendorId, { served, waitingWithFlags = false }) {
  const today = new Date();
  const totalSoFar = served + 1; // + the one currently called
  const [sessionResult] = await conn.query(
    `INSERT INTO queue_sessions (vendor_id, session_date, status, current_token_number, next_token_number)
     VALUES (?, ?, 'open', ?, ?)`,
    [vendorId, dateString(today), totalSoFar, totalSoFar + 1]
  );
  const sessionId = sessionResult.insertId;

  let cursor = atTime(today, 9, 0);
  for (let i = 1; i <= served; i += 1) {
    const calledAt = new Date(cursor);
    const servedAt = new Date(calledAt.getTime() + (2 + Math.random() * 6) * 60000);
    cursor = new Date(calledAt.getTime() + (6 + Math.random() * 8) * 60000);
    await conn.query(
      `INSERT INTO tokens (session_id, vendor_id, token_number, queue_position, patient_email, status,
        called_at, served_at, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'served', ?, ?, ?, ?)`,
      [sessionId, vendorId, i, i, `demo.patient${i}.today@example.com`, calledAt, servedAt, calledAt, new Date(calledAt.getTime() + 2 * 3600000)]
    );
  }

  // The one currently at the counter.
  const calledNumber = served + 1;
  await conn.query(
    `INSERT INTO tokens (session_id, vendor_id, token_number, queue_position, patient_email, status,
      called_at, vendor_comment, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, 'called', NOW(), ?, NOW(), ?)`,
    [sessionId, vendorId, calledNumber, calledNumber, 'demo.patient.called@example.com', 'Please have your ID ready', new Date(Date.now() + 2 * 3600000)]
  );

  // A handful waiting behind them.
  const waitingCount = 5;
  for (let j = 1; j <= waitingCount; j += 1) {
    const tokenNumber = calledNumber + j;
    const pushUsed = waitingWithFlags && j === 3 ? 1 : 0;
    const skipUsed = waitingWithFlags && j === 5 ? 1 : 0;
    await conn.query(
      `INSERT INTO tokens (session_id, vendor_id, token_number, queue_position, patient_email, status,
        push_used, skip_used, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, 'waiting', ?, ?, NOW(), ?)`,
      [sessionId, vendorId, tokenNumber, tokenNumber, `demo.patient${tokenNumber}.today@example.com`, pushUsed, skipUsed, new Date(Date.now() + 2 * 3600000)]
    );
  }
}

async function run() {
  const conn = await pool.getConnection();
  try {
    for (const v of DEMO_VENDORS) {
      console.log(`[seed] Creating ${v.businessName} ...`);
      const vendorId = await upsertVendor(conn, v);

      if (v.seedHistory) {
        // Six closed days behind us, with a plausible token count each day.
        for (let daysAgo = 6; daysAgo >= 1; daysAgo -= 1) {
          // eslint-disable-next-line no-await-in-loop
          await seedPastDay(conn, vendorId, daysAgo, 18 + Math.round(Math.random() * 14));
        }
        // eslint-disable-next-line no-await-in-loop
        await seedToday(conn, vendorId, { served: 9, waitingWithFlags: true });
      } else {
        // Lighter footprint: just today, so the directory has live numbers to show.
        // eslint-disable-next-line no-await-in-loop
        await seedToday(conn, vendorId, { served: 2 + Math.round(Math.random() * 3) });
      }
    }

    console.log('\n[seed] Done. Demo vendor logins (all use the same password):');
    console.log(`  Password: ${DEMO_PASSWORD}`);
    DEMO_VENDORS.forEach((v) => console.log(`  - ${v.email}  (${v.businessName}, /q/${v.slug})`));
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
