// public/js/socket.js
export function setupSocketEvents(socket, rtcManager, callbacks) {
  socket.on('rooms-list', (rooms) => {
    callbacks.onRoomsUpdate?.(rooms);
  });

  socket.on('online-users', (usernames) => {
    callbacks.onOnlineUsersUpdate?.(usernames);
  });

  socket.on('participants', ({ count }) => {
    if (count === 1) {
      callbacks.onStatusChange('Waiting for peers...');
    }
  });

  socket.on('room-full', () => {
    callbacks.onRoomFull?.();
  });

  // Received by the user who just joined a room containing existing peers
  socket.on('existing-peers', async ({ peers }) => {
    for (const peer of peers) {
      await rtcManager.createAndSendOffer(peer.peerId, peer.name, peer.username);
    }
  });

  // Received by existing room members when a new peer joins (they will send us an offer)
  socket.on('peer-joined', ({ peerId, name, username }) => {
    callbacks.onStatusChange(`${name || username} joined...`);
    rtcManager.getOrCreatePeerEntry(peerId, name, username);
  });

  socket.on('signal', async (data) => {
    await rtcManager.handleSignal(data);
  });

  socket.on('chat-message', (msg) => {
    callbacks.onChatMessage?.(msg);
  });

  socket.on('peer-left', ({ peerId }) => {
    rtcManager.removePeer(peerId);
  });

  // --- Direct 1-to-1 Call & Ringing Events ---
  socket.on('incoming-call', (data) => {
    callbacks.onIncomingCall?.(data);
  });

  socket.on('call-accepted', (data) => {
    callbacks.onCallAccepted?.(data);
  });

  socket.on('call-rejected', (data) => {
    callbacks.onCallRejected?.(data);
  });

  socket.on('call-canceled', (data) => {
    callbacks.onCallCanceled?.(data);
  });

  socket.on('call-busy', (data) => {
    callbacks.onCallBusy?.(data);
  });

  socket.on('user-offline', (data) => {
    callbacks.onUserOffline?.(data);
  });

  // --- Direct 1-to-1 Text Chat ---
  socket.on('direct-message', (msg) => {
    callbacks.onDirectMessage?.(msg);
  });
}