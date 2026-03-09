const jwt = require('jsonwebtoken');
const Order = require('./models/Order');

let io = null;

function setIO(socketIO) {
  io = socketIO;
}

function getIO() {
  return io;
}

async function getUnfulfilledCount() {
  const count = await Order.countDocuments({ fulfillmentStatus: 'Unfulfilled' });
  return count;
}

async function emitUnfulfilledCount() {
  if (!io) return;
  try {
    const count = await getUnfulfilledCount();
    io.to('admin').emit('orders:unfulfilled', count);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[socket] emitUnfulfilledCount failed', err.message);
  }
}

function attachSocketServer(server) {
  const { Server } = require('socket.io');
  const socketIO = new Server(server, {
    cors: { origin: '*' },
    path: '/socket.io',
  });

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // eslint-disable-next-line no-console
    console.warn('[socket] JWT_SECRET not set – admin socket auth will reject all');
  }

  socketIO.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Auth required'));
    }
    if (!secret) {
      return next(new Error('Server not configured'));
    }
    try {
      const payload = jwt.verify(token, secret);
      socket.admin = { id: payload.sub, email: payload.email };
      return next();
    } catch (err) {
      return next(new Error('Invalid token'));
    }
  });

  socketIO.on('connection', async (socket) => {
    if (socket.admin) {
      socket.join('admin');
      try {
        const count = await getUnfulfilledCount();
        socket.emit('orders:unfulfilled', count);
      } catch {
        socket.emit('orders:unfulfilled', 0);
      }
    }
    socket.on('disconnect', () => {});
  });

  setIO(socketIO);
  return socketIO;
}

module.exports = {
  setIO,
  getIO,
  getUnfulfilledCount,
  emitUnfulfilledCount,
  attachSocketServer,
};
