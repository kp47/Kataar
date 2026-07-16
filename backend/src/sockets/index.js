let ioInstance = null;

function initSockets(io) {
  ioInstance = io;

  io.on('connection', (socket) => {
    // Clients join a room named after the vendor's slug so we can broadcast
    // "now serving" updates only to people watching that vendor's queue.
    socket.on('join-vendor-room', (vendorSlug) => {
      if (typeof vendorSlug === 'string' && vendorSlug.length < 200) {
        socket.join(`vendor:${vendorSlug}`);
      }
    });

    socket.on('leave-vendor-room', (vendorSlug) => {
      if (typeof vendorSlug === 'string') {
        socket.leave(`vendor:${vendorSlug}`);
      }
    });
  });
}

/** Broadcast a queue-state update to everyone watching this vendor. */
function emitQueueUpdate(vendorSlug, payload) {
  if (!ioInstance) return;
  ioInstance.to(`vendor:${vendorSlug}`).emit('queue-update', payload);
}

/** Send a targeted notification (e.g. "you moved up") to one browser session. */
function emitPatientNotification(vendorSlug, tokenId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`vendor:${vendorSlug}`).emit(`token-${tokenId}-notification`, payload);
}

module.exports = { initSockets, emitQueueUpdate, emitPatientNotification };
