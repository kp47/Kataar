const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();
require('express-async-errors'); // lets thrown errors in async route handlers reach the error middleware below

const authRoutes = require('./routes/authRoutes');
const vendorAuthRoutes = require('./routes/vendorAuthRoutes');
const vendorRoutes = require('./routes/vendorRoutes');
const queueRoutes = require('./routes/queueRoutes');
const adminQueueRoutes = require('./routes/adminQueueRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');
const publicRoutes = require('./routes/publicRoutes');

const app = express();

app.use(
  cors({
    origin: process.env.APP_BASE_URL,
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', authRoutes);
app.use('/api/vendor-auth', vendorAuthRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/admin/queue', adminQueueRoutes);
app.use('/api/admin/analytics', analyticsRoutes);
app.use('/api/public', publicRoutes);

// 404
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

// Centralized error handler — keeps controllers free of repetitive try/catch boilerplate
// for anything that isn't a deliberate 4xx response.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ error: 'Something went wrong on our end. Please try again.' });
});

module.exports = app;
