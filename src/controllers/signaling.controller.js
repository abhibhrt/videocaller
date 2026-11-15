// src/controllers/signaling.controller.js
const roomService = require('../services/room.service');
const Message = require('../models/Message');
const { EVENTS, MAX_ROOM_SIZE } = require('../utils/constants');

const signalingController = {
  handleConnection(io, socket) {
    const { username, name } = socket.user;

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

      if (roomService.getRoomSize(roomName) >= MAX_ROOM_SIZE) {
        socket.emit(EVENTS.ROOM_FULL);
        return;
      }

      // Get peers already in the room BEFORE adding the new peer
      const existingPeers = roomService.getRoomPeers(roomName, socket.id);

      socket.join(roomName);
      socket.data.roomName = roomName;

      const roomSize = roomService.addPeerToRoom(roomName, socket.id, { name, username });
      roomService.setUserCallStatus(username, true);

      // Tell the joining user who is already there so they can send offers to each
      socket.emit(EVENTS.EXISTING_PEERS, { peers: existingPeers });

      // Notify existing peers that a new peer joined
      socket.to(roomName).emit(EVENTS.PEER_JOINED, {
        peerId: socket.id,
        name,
        username
      });

      io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
      io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
    });

    // --- WebRTC Signaling (Mesh-aware via `to`) ---
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

      // Generate a private room ID for this 1-to-1 call
      const privateRoom = `dm_call_${[username, target.username].sort().join('_')}_${Date.now()}`;

      io.to(target.socketId).emit(EVENTS.INCOMING_CALL, {
        fromUsername: username,
        fromName: name,
        fromSocketId: socket.id,
        callType: callType || 'video', // 'video' | 'audio'
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

    // --- Direct 1-to-1 Text Messaging (Persisted in MongoDB) ---
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

        // Echo back to sender
        socket.emit(EVENTS.DIRECT_MESSAGE, msgPayload);

        // Deliver to recipient if online
        const target = roomService.getOnlineUser(cleanTarget);
        if (target) {
          io.to(target.socketId).emit(EVENTS.DIRECT_MESSAGE, msgPayload);
        }
      } catch (err) {
        console.error('Direct message save error:', err);
      }
    });

    // --- Leave Room ---
    socket.on(EVENTS.LEAVE, (roomName) => {
      socket.leave(roomName);
      socket.data.roomName = null;
      roomService.setUserCallStatus(username, false);

      const roomSize = roomService.removePeerFromRoom(roomName, socket.id);
      socket.to(roomName).emit(EVENTS.PEER_LEFT, { peerId: socket.id, username });
      io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
      io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      roomService.unregisterOnlineUser(username, socket.id);
      io.emit(EVENTS.ONLINE_USERS, roomService.getOnlineUsernames());

      const affectedRooms = roomService.removePeerGlobally(socket.id);
      for (const { roomName, roomSize } of affectedRooms) {
        socket.to(roomName).emit(EVENTS.PEER_LEFT, { peerId: socket.id, username });
        io.in(roomName).emit(EVENTS.PARTICIPANTS, { count: roomSize });
      }
      if (affectedRooms.length > 0) {
        io.emit(EVENTS.ROOMS_LIST, roomService.getRoomsList());
      }
    });
  }
};

module.exports = signalingController;