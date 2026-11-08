// src/services/room.service.js
const rooms = {};

const roomService = {
  addPeerToRoom(roomName, socketId) {
    if (!rooms[roomName]) {
      rooms[roomName] = new Set();
    }
    rooms[roomName].add(socketId);
    return rooms[roomName].size;
  },

  removePeerFromRoom(roomName, socketId) {
    if (rooms[roomName]) {
      rooms[roomName].delete(socketId);
      const size = rooms[roomName].size;
      if (size === 0) {
        delete rooms[roomName];
        return 0;
      }
      return size;
    }
    return 0;
  },

  removePeerGlobally(socketId) {
    const affectedRooms = [];

    for (const roomName of Object.keys(rooms)) {
      if (rooms[roomName].has(socketId)) {
        rooms[roomName].delete(socketId);
        const roomSize = rooms[roomName].size;

        if (roomSize === 0) {
          delete rooms[roomName];
          affectedRooms.push({ roomName, roomSize: 0 });
        } else {
          affectedRooms.push({ roomName, roomSize });
        }
      }
    }

    return affectedRooms;
  },

  getRoomSize(roomName) {
    return rooms[roomName] ? rooms[roomName].size : 0;
  }
};

module.exports = roomService;