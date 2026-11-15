// src/services/room.service.js
const rooms = {}; // { [roomName]: Map<socketId, { name, username }> }
const onlineUsers = new Map(); // username -> { socketId, name, username, inCall: boolean }

const roomService = {
  // --- Online User Presence ---
  registerOnlineUser(username, name, socketId) {
    onlineUsers.set(username, { socketId, name, username, inCall: false });
  },

  unregisterOnlineUser(username, socketId) {
    const existing = onlineUsers.get(username);
    if (existing && existing.socketId === socketId) {
      onlineUsers.delete(username);
    }
  },

  getOnlineUser(username) {
    return onlineUsers.get(username.toLowerCase()) || null;
  },

  setUserCallStatus(username, inCall) {
    const user = onlineUsers.get(username);
    if (user) {
      user.inCall = inCall;
    }
  },

  getOnlineUsernames() {
    return Array.from(onlineUsers.keys());
  },

  // --- Multi-User Rooms (Max 4) ---
  addPeerToRoom(roomName, socketId, userInfo) {
    if (!rooms[roomName]) {
      rooms[roomName] = new Map();
    }
    rooms[roomName].set(socketId, userInfo);
    return rooms[roomName].size;
  },

  getRoomPeers(roomName, excludeSocketId = null) {
    if (!rooms[roomName]) return [];
    const peers = [];
    for (const [socketId, info] of rooms[roomName].entries()) {
      if (socketId !== excludeSocketId) {
        peers.push({ peerId: socketId, name: info.name, username: info.username });
      }
    }
    return peers;
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
  },

  getRoomsList() {
    return Object.entries(rooms)
      .filter(([name]) => !name.startsWith('dm_call_'))
      .map(([name, peers]) => ({
        name,
        count: peers.size
      }));
  }
};

module.exports = roomService;