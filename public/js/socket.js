// public/js/socket.js
export function setupSocketEvents(socket, rtcManager, callbacks) {
  socket.on('rooms-list', (rooms) => {
    if (callbacks.onRoomsUpdate) {
      callbacks.onRoomsUpdate(rooms);
    }
  });

  socket.on('participants', ({ count }) => {
    if (count === 1) {
      callbacks.onStatusChange('Waiting for peer...');
    }
  });

  socket.on('room-full', () => {
    callbacks.onRoomFull();
  });

  socket.on('peer-joined', async ({ peerId, userName }) => {
    callbacks.onStatusChange(`${userName || 'Peer'} joining...`);
    await rtcManager.createAndSendOffer(peerId);
  });

  socket.on('signal', async (data) => {
    await rtcManager.handleSignal(data);
  });

  socket.on('chat-message', (msg) => {
    if (callbacks.onChatMessage) {
      callbacks.onChatMessage(msg);
    }
  });

  socket.on('peer-left', () => {
    rtcManager.resetRemote();
    callbacks.onStatusChange('Peer left. Waiting...');
  });
}