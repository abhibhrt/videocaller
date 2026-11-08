// public/js/app.js
import { WebRTCManager } from './webrtc.js';
import { setupSocketEvents } from './socket.js';

const socket = io();

const lobbyScreen = document.getElementById('lobby');
const callScreen = document.getElementById('callScreen');
const roomNameInput = document.getElementById('roomNameInput');
const joinBtn = document.getElementById('joinBtn');
const lobbyStatus = document.getElementById('lobbyStatus');

const roomBadge = document.getElementById('roomBadge');
const callStatus = document.getElementById('callStatus');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const muteAudioBtn = document.getElementById('muteAudioBtn');
const muteVideoBtn = document.getElementById('muteVideoBtn');
const leaveBtn = document.getElementById('leaveBtn');

function updateCallStatus(msg) {
  callStatus.textContent = msg;
}

const rtcManager = new WebRTCManager(socket, localVideo, remoteVideo, updateCallStatus);

function showScreen(screen) {
  lobbyScreen.classList.remove('active');
  callScreen.classList.remove('active');
  screen.classList.add('active');
}

function resetUI() {
  muteAudioBtn.classList.remove('muted');
  muteVideoBtn.classList.remove('muted');
  joinBtn.disabled = false;
  lobbyStatus.textContent = '';
  showScreen(lobbyScreen);
}

setupSocketEvents(socket, rtcManager, {
  onStatusChange: updateCallStatus,
  onRoomFull: () => {
    rtcManager.cleanup();
    resetUI();
    lobbyStatus.textContent = 'Room is full (max 2 people).';
  }
});

joinBtn.addEventListener('click', async () => {
  const roomName = roomNameInput.value.trim().toLowerCase();
  if (!roomName) {
    lobbyStatus.textContent = 'Please enter a room name.';
    return;
  }

  joinBtn.disabled = true;
  lobbyStatus.textContent = 'Accessing camera & mic...';

  try {
    await rtcManager.initLocalMedia();
    rtcManager.roomName = roomName;
    roomBadge.textContent = roomName;

    socket.emit('join', roomName);
    showScreen(callScreen);
    updateCallStatus('Waiting for peer...');
  } catch (err) {
    lobbyStatus.textContent = 'Camera/Mic permission denied.';
    joinBtn.disabled = false;
  }
});

muteAudioBtn.addEventListener('click', () => {
  const isMuted = rtcManager.toggleAudio();
  muteAudioBtn.classList.toggle('muted', isMuted);
});

muteVideoBtn.addEventListener('click', () => {
  const isVideoOff = rtcManager.toggleVideo();
  muteVideoBtn.classList.toggle('muted', isVideoOff);
});

leaveBtn.addEventListener('click', () => {
  if (rtcManager.roomName) {
    socket.emit('leave', rtcManager.roomName);
  }
  rtcManager.cleanup();
  resetUI();
});