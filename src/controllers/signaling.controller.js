// src/controllers/signaling.controller.js
const roomService = require('../services/room.service');

const signalingController = {
  handleConnection(io, socket) {
    socket.emit('rooms-list', roomService.getRoomsList());

    socket.on('get-rooms', () => {
      socket.emit('rooms-list', roomService.getRoomsList());
    });

    socket.on('join', (payload) => {
      const roomName = typeof payload === 'string' ? payload : payload.roomName;
      const userName = typeof payload === 'string' ? 'Guest' : (payload.userName || 'Guest');

      if (roomService.getRoomSize(roomName) >= 2) {
        socket.emit('room-full');
        return;
      }

      socket.join(roomName);
      socket.data.userName = userName;
      socket.data.roomName = roomName;

      const roomSize = roomService.addPeerToRoom(roomName, socket.id, userName);

      socket.to(roomName).emit('peer-joined', { peerId: socket.id, userName });
      io.in(roomName).emit('participants', { count: roomSize });
      io.emit('rooms-list', roomService.getRoomsList());
    });

    socket.on('signal', ({ roomId, description, candidate, to }) => {
      if (to) {
        io.to(to).emit('signal', { from: socket.id, description, candidate });
      } else {
        socket.to(roomId).emit('signal', { from: socket.id, description, candidate });
      }
    });

    socket.on('chat-message', ({ roomName, text, sender }) => {
      socket.to(roomName).emit('chat-message', {
        text,
        sender: sender || socket.data.userName || 'Peer',
        timestamp: Date.now()
      });
    });

    socket.on('leave', (roomName) => {
      socket.leave(roomName);
      const roomSize = roomService.removePeerFromRoom(roomName, socket.id);
      socket.to(roomName).emit('peer-left', { peerId: socket.id });
      io.in(roomName).emit('participants', { count: roomSize });
      io.emit('rooms-list', roomService.getRoomsList());
    });

    socket.on('disconnect', () => {
      const affectedRooms = roomService.removePeerGlobally(socket.id);

      for (const { roomName, roomSize } of affectedRooms) {
        socket.to(roomName).emit('peer-left', { peerId: socket.id });
        io.in(roomName).emit('participants', { count: roomSize });
      }
      if (affectedRooms.length > 0) {
        io.emit('rooms-list', roomService.getRoomsList());
      }
    });
  }
};

module.exports = signalingController;