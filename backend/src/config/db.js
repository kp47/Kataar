const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  dateStrings: true, // return DATETIME/DATE as strings, avoids TZ surprises
});

async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
    console.log('[db] MySQL connection OK');
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };
