// src/config/socket.js
const signalingController = require('../controllers/signaling.controller');
const { verifyToken } = require('../utils/jwt');

function configureSocket(io) {
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error: Token required'));
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return next(new Error('Authentication error: Invalid token'));
    }

    socket.user = {
      id: payload.id,
      username: payload.username,
      email: payload.email || `${payload.username}@closemiles.in`,
      name: payload.name
    };
    next();
  });

  io.on('connection', (socket) => {
    signalingController.handleConnection(io, socket);
  });
}

module.exports = configureSocket;