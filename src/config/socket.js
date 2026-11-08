// src/config/socket.js
const { Server } = require('socket.io');
const signalingController = require('../controllers/signaling.controller');

function configureSocket(io) {
  io.on('connection', (socket) => {
    signalingController.handleConnection(io, socket);
  });
}

module.exports = configureSocket;