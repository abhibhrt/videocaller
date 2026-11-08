// public/js/socket.js
export function setupSocketEvents(socket, rtcManager, callbacks) {
  socket.on('participants', ({ count }) => {
    if (count === 1) {
      callbacks.onStatusChange('Waiting for peer...');
    }
  });

  socket.on('room-full', () => {
    callbacks.onRoomFull();
  });

  socket.on('peer-joined', async ({ peerId }) => {
    callbacks.onStatusChange('Peer joining...');
    await rtcManager.createAndSendOffer(peerId);
  });

  socket.on('signal', async (data) => {
    await rtcManager.handleSignal(data);
  });

  socket.on('peer-left', () => {
    rtcManager.resetRemote();
    callbacks.onStatusChange('Peer left. Waiting...');
  });
}