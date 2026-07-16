const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = require('./app');
const { testConnection } = require('./config/db');
const { initSockets } = require('./sockets');
const { startQueueMaintenanceLoop } = require('./jobs/queueJobs');

const PORT = process.env.PORT || 4000;

async function start() {
  try {
    await testConnection();
  } catch (err) {
    console.error('[server] Could not connect to MySQL. Check your .env DB_* values and that MySQL is running.');
    console.error(err.message);
    process.exit(1);
  }

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: process.env.APP_BASE_URL || 'http://localhost:5173', credentials: true },
  });
  initSockets(io);

  startQueueMaintenanceLoop();

  server.listen(PORT, () => {
    console.log(`[server] QueueWise API listening on port ${PORT}`);
  });
}

start();
