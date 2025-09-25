// Simple Express + Socket.IO signaling server for 1-to-1 WebRTC
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from public
app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

const rooms = {}; // { roomId: Set(socketId) }

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on('join', (roomId) => {
    socket.join(roomId);
    if (!rooms[roomId]) rooms[roomId] = new Set();
    rooms[roomId].add(socket.id);
    console.log(`${socket.id} joined ${roomId} (count=${rooms[roomId].size})`);

    // Inform others in the room that a new user joined
    socket.to(roomId).emit('peer-joined', { peerId: socket.id });

    // Send current participants count
    io.in(roomId).emit('participants', { count: rooms[roomId].size });

    // If more than 2, you may choose to reject or allow (this sample is for 1-1)
    if (rooms[roomId].size > 2) {
      // optional: inform the new peer that room is full
      socket.emit('room-full');
    }
  });

  socket.on('signal', ({ roomId, description, candidate, to }) => {
    // Relay signaling data: if 'to' provided send to specific socket, else broadcast to room
    if (to) {
      io.to(to).emit('signal', { from: socket.id, description, candidate });
    } else {
      socket.to(roomId).emit('signal', { from: socket.id, description, candidate });
    }
  });

  socket.on('leave', (roomId) => {
    socket.leave(roomId);
    if (rooms[roomId]) {
      rooms[roomId].delete(socket.id);
      io.in(roomId).emit('participants', { count: rooms[roomId].size });
    }
  });

  socket.on('disconnect', () => {
    console.log('disconnect', socket.id);
    // cleanup from rooms
    for (const roomId of Object.keys(rooms)) {
      if (rooms[roomId].has(socket.id)) {
        rooms[roomId].delete(socket.id);
        socket.to(roomId).emit('peer-left', { peerId: socket.id });
        io.in(roomId).emit('participants', { count: rooms[roomId].size });
      }
      if (rooms[roomId].size === 0) delete rooms[roomId];
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});