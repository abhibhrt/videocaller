// public/js/app.js
import { WebRTCManager } from './webrtc.js';
import { setupSocketEvents } from './socket.js';

const socket = io();

const lobbyScreen = document.getElementById('lobby');
const callScreen = document.getElementById('callScreen');
const roomsGrid = document.getElementById('roomsGrid');
const lobbyStatus = document.getElementById('lobbyStatus');

const nameModalOverlay = document.getElementById('nameModalOverlay');
const nameModalInput = document.getElementById('nameModalInput');
const nameModalConfirmBtn = document.getElementById('nameModalConfirmBtn');

const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalRoomInput = document.getElementById('modalRoomInput');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

const roomBadge = document.getElementById('roomBadge');
const callStatus = document.getElementById('callStatus');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

const toggleChatBtn = document.getElementById('toggleChatBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const chatOverlay = document.getElementById('chatOverlay');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

const muteAudioBtn = document.getElementById('muteAudioBtn');
const muteVideoBtn = document.getElementById('muteVideoBtn');
const leaveBtn = document.getElementById('leaveBtn');

let currentUserName = localStorage.getItem('videoCaller_userName') || '';
let pendingRoomToJoin = null;
let isCreatingRoom = false;
let isChatOpen = false;
let isJoining = false;

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
  toggleChatBtn.classList.remove('active');
  chatOverlay.classList.add('hidden');
  chatForm.classList.add('hidden');
  chatMessages.innerHTML = '';
  isChatOpen = false;
  isJoining = false;
  lobbyStatus.textContent = '';
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
  showScreen(lobbyScreen);
  socket.emit('get-rooms');
}

function appendMessage(sender, text, isSelf) {
  const item = document.createElement('div');
  item.className = `chat-msg ${isSelf ? 'self' : 'peer'}`;

  const nameEl = document.createElement('span');
  nameEl.className = 'chat-sender';
  nameEl.textContent = isSelf ? 'You' : sender;

  const textEl = document.createElement('span');
  textEl.className = 'chat-text';
  textEl.textContent = text;

  item.appendChild(nameEl);
  item.appendChild(textEl);
  chatMessages.appendChild(item);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function renderRooms(rooms) {
  roomsGrid.innerHTML = '';

  const createBox = document.createElement('button');
  createBox.type = 'button';
  createBox.className = 'room-box create-box';
  createBox.innerHTML = `
    <span class="plus-icon">+</span>
    <span class="room-box-label">New Room</span>
  `;
  createBox.addEventListener('click', () => {
    openModal(true, '');
  });
  roomsGrid.appendChild(createBox);

  rooms.forEach((room) => {
    const box = document.createElement('button');
    box.type = 'button';
    const isFull = room.count >= 2;
    box.className = `room-box ${isFull ? 'full' : ''}`;
    box.innerHTML = `
      <span class="room-box-name">${room.name}</span>
      <span class="room-box-count">${room.count}/2</span>
    `;
    box.addEventListener('click', () => {
      if (isFull) {
        lobbyStatus.textContent = 'This room is already full (2/2).';
        return;
      }
      openModal(false, room.name);
    });
    roomsGrid.appendChild(box);
  });
}

function checkUserName() {
  if (!currentUserName) {
    nameModalOverlay.classList.remove('hidden');
    setTimeout(() => nameModalInput.focus(), 50);
  } else {
    nameModalOverlay.classList.add('hidden');
  }
}

nameModalConfirmBtn.addEventListener('click', () => {
  const name = nameModalInput.value.trim();
  if (!name) {
    return;
  }
  currentUserName = name;
  localStorage.setItem('videoCaller_userName', currentUserName);
  nameModalOverlay.classList.add('hidden');
});

nameModalInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    nameModalConfirmBtn.click();
  }
});

function openModal(createMode, roomName) {
  isCreatingRoom = createMode;
  pendingRoomToJoin = roomName;
  modalOverlay.classList.remove('hidden');

  if (createMode) {
    modalTitle.textContent = 'Create New Room';
    modalDesc.textContent = 'Enter a room name to create and join';
    modalRoomInput.value = '';
    modalRoomInput.classList.remove('hidden');
    modalConfirmBtn.textContent = 'Create & Join';
    setTimeout(() => modalRoomInput.focus(), 50);
  } else {
    modalTitle.textContent = 'Join Room';
    modalDesc.textContent = `Join "${roomName}" as ${currentUserName}?`;
    modalRoomInput.classList.add('hidden');
    modalConfirmBtn.textContent = 'Confirm Join';
  }
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  pendingRoomToJoin = null;
}

modalCancelBtn.addEventListener('click', closeModal);

modalConfirmBtn.addEventListener('click', async () => {
  const roomName = isCreatingRoom
    ? modalRoomInput.value.trim().toLowerCase()
    : pendingRoomToJoin;

  if (!roomName) {
    modalDesc.textContent = 'Please enter a valid room name.';
    return;
  }

  closeModal();
  await joinRoom(roomName);
});

modalRoomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    modalConfirmBtn.click();
  }
});

async function joinRoom(roomName) {
  if (isJoining) return;
  isJoining = true;
  lobbyStatus.textContent = 'Accessing camera & mic...';

  try {
    await rtcManager.initLocalMedia();
    rtcManager.roomName = roomName;
    roomBadge.textContent = `${roomName} • ${currentUserName}`;

    socket.emit('join', { roomName, userName: currentUserName });
    showScreen(callScreen);
    updateCallStatus('Waiting for peer...');
  } catch (err) {
    lobbyStatus.textContent = 'Camera/Mic permission denied.';
    isJoining = false;
  }
}

setupSocketEvents(socket, rtcManager, {
  onRoomsUpdate: renderRooms,
  onStatusChange: updateCallStatus,
  onRoomFull: () => {
    rtcManager.cleanup();
    resetUI();
    lobbyStatus.textContent = 'Room is full (max 2 people).';
  },
  onChatMessage: ({ sender, text }) => {
    appendMessage(sender, text, false);
    if (!isChatOpen) {
      toggleChatBtn.classList.add('has-unread');
    }
  }
});

toggleChatBtn.addEventListener('click', () => {
  isChatOpen = !isChatOpen;
  toggleChatBtn.classList.toggle('active', isChatOpen);
  toggleChatBtn.classList.remove('has-unread');
  chatOverlay.classList.toggle('hidden', !isChatOpen);
  chatForm.classList.toggle('hidden', !isChatOpen);
  if (isChatOpen) {
    chatInput.focus();
  }
});

fullscreenBtn.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await callScreen.requestFullscreen();
      fullscreenBtn.classList.add('active');
    } else {
      await document.exitFullscreen();
      fullscreenBtn.classList.remove('active');
    }
  } catch (err) {}
});

document.addEventListener('fullscreenchange', () => {
  fullscreenBtn.classList.toggle('active', !!document.fullscreenElement);
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !rtcManager.roomName) return;

  socket.emit('chat-message', {
    roomName: rtcManager.roomName,
    text,
    sender: currentUserName
  });
  appendMessage(currentUserName, text, true);
  chatInput.value = '';
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

checkUserName();
renderRooms([]);