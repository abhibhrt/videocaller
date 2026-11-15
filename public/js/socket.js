// public/js/socket.js
export function setupSocketEvents(socket, rtcManager, callbacks) {
  socket.on('rooms-list', (rooms) => {
    callbacks.onRoomsUpdate?.(rooms);
  });

  socket.on('online-users', (usernames) => {
    callbacks.onOnlineUsersUpdate?.(usernames);
  });

  socket.on('participants', ({ count }) => {
    callbacks.onStatusChange(`${count} joined`);
  });

  socket.on('room-full', () => {
    callbacks.onRoomFull?.();
  });

  socket.on('existing-peers', async ({ peers }) => {
    for (const user of peers) {
      await rtcManager.createAndSendOffer(user.peerId, user.name, user.username);
    }
  });

  socket.on('peer-joined', ({ peerId, name, username }) => {
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

  // --- Private 1-to-1 Call & Ringing Events ---
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