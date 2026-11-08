// src/controllers/signaling.controller.js
const roomService = require('../services/room.service');

const signalingController = {
  handleConnection(io, socket) {
    console.log('socket connected:', socket.id);

    socket.on('join', (roomName) => {
      socket.join(roomName);
      const roomSize = roomService.addPeerToRoom(roomName, socket.id);
      console.log(`${socket.id} joined room: ${roomName} (count=${roomSize})`);

      socket.to(roomName).emit('peer-joined', { peerId: socket.id });
      io.in(roomName).emit('participants', { count: roomSize });

      if (roomSize > 2) {
        socket.emit('room-full');
      }
    });

    socket.on('signal', ({ roomId, description, candidate, to }) => {
      if (to) {
        io.to(to).emit('signal', { from: socket.id, description, candidate });
      } else {
        socket.to(roomId).emit('signal', { from: socket.id, description, candidate });
      }
    });

    socket.on('leave', (roomName) => {
      socket.leave(roomName);
      const roomSize = roomService.removePeerFromRoom(roomName, socket.id);
      io.in(roomName).emit('participants', { count: roomSize });
    });

    socket.on('disconnect', () => {
      console.log('disconnect', socket.id);
      const affectedRooms = roomService.removePeerGlobally(socket.id);

      for (const { roomName, roomSize } of affectedRooms) {
        socket.to(roomName).emit('peer-left', { peerId: socket.id });
        io.in(roomName).emit('participants', { count: roomSize });
      }
    });
  }
};

module.exports = signalingController;