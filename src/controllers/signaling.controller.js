// src/controllers/signaling.controller.js
const roomService = require('../services/room.service');
const Message = require('../models/Message');
const { EVENTS, MAX_ROOM_SIZE } = require('../utils/constants');

// Grace timers for brief mobile background disconnects: Map<username, Timeout>
const disconnectTimers = new Map();

const signalingController = {
  handleConnection(io, socket) {
    const { username, name } = socket.user;

    // Cancel any pending disconnect grace timer if user reconnected quickly
    if (disconnectTimers.has(username)) {
      clearTimeout(disconnectTimers.get(username));
      disconnectTimers.delete(username);
    }

    // Register user online
    roomService.registerOnlineUser(username, name, socket.id);
    io.emit(EVENTS.ONLINE_USERS, roomService.getOnlineUsernames());
    socket.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());

    socket.on(EVENTS.GET_ROOMS, () => {
      socket.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
    });

    // --- Join Room (Up to 4 Users Mesh) ---
    socket.on(EVENTS.JOIN, (payload) => {
      const roomName = typeof payload === 'string' ? payload : payload.roomName;
      if (!roomName) return;

      // Clean up any stale entry for this same username in the room (e.g., after mobile reconnect)
      const existingPeersInRoom = roomService.getRoomPeers(roomName, socket.id);
      for (const p of existingPeersInRoom) {
        if (p.username === username) {
          roomService.removePeerFromRoom(roomName, p.peerId);
          socket.to(roomName).emit(EVENTS.PEER_LEFT, { peerId: p.peerId, username });
        }
      }

      if (roomService.getRoomSize(roomName) >= MAX_ROOM_SIZE) {
        socket.emit(EVENTS.ROOM_FULL);
        return;
      }

      const existingPeers = roomService.getRoomPeers(roomName, socket.id);

      socket.join(roomName);
      socket.data.roomName = roomName;

      const roomSize = roomService.addPeerToRoom(roomName, socket.id, { name, username });
      roomService.setUserCallStatus(username, true);

      socket.emit(EVENTS.EXISTING_PEERS, { peers: existingPeers });

      socket.to(roomName).emit(EVENTS.PEER_JOINED, {
        peerId: socket.id,
        name,
        username
      });

      io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
      io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
    });

    // --- WebRTC Signaling (Supports SDP Offer/Answer, ICE Restart, & Candidates) ---
    socket.on(EVENTS.SIGNAL, ({ roomId, description, candidate, to }) => {
      const payload = {
        from: socket.id,
        fromUsername: username,
        fromName: name,
        description,
        candidate
      };

      if (to) {
        io.to(to).emit(EVENTS.SIGNAL, payload);
      } else if (roomId) {
        socket.to(roomId).emit(EVENTS.SIGNAL, payload);
      }
    });

    // --- In-Call Room Chat ---
    socket.on(EVENTS.CHAT_MESSAGE, ({ roomName, text }) => {
      if (!roomName || !text) return;
      socket.to(roomName).emit(EVENTS.CHAT_MESSAGE, {
        text,
        senderName: name,
        senderUsername: username,
        timestamp: Date.now()
      });
    });

    // --- Direct 1-to-1 Call & Ringing ---
    socket.on(EVENTS.CALL_USER, ({ targetUsername, callType }) => {
      const target = roomService.getOnlineUser(targetUsername);

      if (!target) {
        socket.emit(EVENTS.USER_OFFLINE, { targetUsername });
        return;
      }

      if (target.inCall) {
        socket.emit(EVENTS.CALL_BUSY, { targetUsername });
        return;
      }

      const privateRoom = `dm_call_${[username, target.username].sort().join('_')}_${Date.now()}`;

      io.to(target.socketId).emit(EVENTS.INCOMING_CALL, {
        fromUsername: username,
        fromName: name,
        fromSocketId: socket.id,
        callType: callType || 'video',
        roomName: privateRoom
      });
    });

    socket.on(EVENTS.CALL_ACCEPTED, ({ toSocketId, roomName, callType }) => {
      io.to(toSocketId).emit(EVENTS.CALL_ACCEPTED, {
        byUsername: username,
        byName: name,
        roomName,
        callType
      });
    });

    socket.on(EVENTS.CALL_REJECTED, ({ toSocketId }) => {
      io.to(toSocketId).emit(EVENTS.CALL_REJECTED, {
        byUsername: username,
        byName: name
      });
    });

    socket.on(EVENTS.CALL_CANCELED, ({ targetUsername }) => {
      const target = roomService.getOnlineUser(targetUsername);
      if (target) {
        io.to(target.socketId).emit(EVENTS.CALL_CANCELED, {
          byUsername: username
        });
      }
    });

    // --- Direct 1-to-1 Text Messaging ---
    socket.on(EVENTS.DIRECT_MESSAGE, async ({ targetUsername, text }) => {
      if (!targetUsername || !text || !text.trim()) return;
      const cleanTarget = targetUsername.toLowerCase();

      try {
        const saved = await Message.create({
          from: username,
          to: cleanTarget,
          text: text.trim()
        });

        const msgPayload = {
          _id: saved._id,
          from: username,
          fromName: name,
          to: cleanTarget,
          text: saved.text,
          createdAt: saved.createdAt
        };

        socket.emit(EVENTS.DIRECT_MESSAGE, msgPayload);

        const target = roomService.getOnlineUser(cleanTarget);
        if (target) {
          io.to(target.socketId).emit(EVENTS.DIRECT_MESSAGE, msgPayload);
        }
      } catch (err) {
        console.error('Direct message save error:', err);
      }
    });

    // --- Explicit Leave Room ---
    socket.on(EVENTS.LEAVE, (roomName) => {
      socket.leave(roomName);
      socket.data.roomName = null;
      roomService.setUserCallStatus(username, false);

      const roomSize = roomService.removePeerFromRoom(roomName, socket.id);
      socket.to(roomName).emit(EVENTS.PEER_LEFT, { peerId: socket.id, username });
      io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
      io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
    });

    // --- Disconnect with 15s Grace Period for Mobile Backgrounding ---
    socket.on('disconnect', () => {
      const staleSocketId = socket.id;

      const timer = setTimeout(() => {
        disconnectTimers.delete(username);
        roomService.unregisterOnlineUser(username, staleSocketId);
        io.emit(EVENTS.ONLINE_USERS, roomService.getOnlineUsernames());

        const affectedRooms = roomService.removePeerGlobally(staleSocketId);
        for (const { roomName, roomSize } of affectedRooms) {
          socket.to(roomName).emit(EVENTS.PEER_LEFT, { peerId: staleSocketId, username });
          io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
        }
        if (affectedRooms.length > 0) {
          io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
        }
      }, 15000);

      disconnectTimers.set(username, timer);
    });
  }
};

module.exports = signalingController;