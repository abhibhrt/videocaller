// public/js/app.js
import { WebRTCManager } from './webrtc.js';
import { setupSocketEvents } from './socket.js';

// --- DOM Elements ---
const authScreen = document.getElementById('authScreen');
const lobbyScreen = document.getElementById('lobby');
const callScreen = document.getElementById('callScreen');

// Toast Notification DOM
const toastNotification = document.getElementById('toastNotification');
const toastAvatar = document.getElementById('toastAvatar');
const toastTitle = document.getElementById('toastTitle');
const toastText = document.getElementById('toastText');

// Auth DOM
const tabLogin = document.getElementById('tabLogin');
const tabRegister = document.getElementById('tabRegister');
const authForm = document.getElementById('authForm');
const registerNameGroup = document.getElementById('registerNameGroup');
const authNameInput = document.getElementById('authNameInput');
const authUsernameInput = document.getElementById('authUsernameInput');
const authPasswordInput = document.getElementById('authPasswordInput');
const authError = document.getElementById('authError');
const authSubmitBtn = document.getElementById('authSubmitBtn');

// Dashboard / Lobby DOM
const userAvatarCircle = document.getElementById('userAvatarCircle');
const currentUserNameDisplay = document.getElementById('currentUserNameDisplay');
const currentUsernameDisplay = document.getElementById('currentUsernameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const expandableSearchWrap = document.getElementById('expandableSearchWrap');
const toggleSearchBtn = document.getElementById('toggleSearchBtn');
const closeSearchBtn = document.getElementById('closeSearchBtn');
const userSearchInput = document.getElementById('userSearchInput');
const searchResultsSection = document.getElementById('searchResultsSection');
const searchResultsList = document.getElementById('searchResultsList');
const roomsGrid = document.getElementById('roomsGrid');
const lobbyStatus = document.getElementById('lobbyStatus');

// Room Modal DOM
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle = document.getElementById('modalTitle');
const modalDesc = document.getElementById('modalDesc');
const modalRoomInput = document.getElementById('modalRoomInput');
const modalCancelBtn = document.getElementById('modalCancelBtn');
const modalConfirmBtn = document.getElementById('modalConfirmBtn');

// DM Modal DOM
const dmModalOverlay = document.getElementById('dmModalOverlay');
const dmTargetAvatar = document.getElementById('dmTargetAvatar');
const dmTargetName = document.getElementById('dmTargetName');
const dmTargetUsername = document.getElementById('dmTargetUsername');
const dmVoiceCallBtn = document.getElementById('dmVoiceCallBtn');
const dmVideoCallBtn = document.getElementById('dmVideoCallBtn');
const closeDmBtn = document.getElementById('closeDmBtn');
const dmMessagesList = document.getElementById('dmMessagesList');
const dmForm = document.getElementById('dmForm');
const dmInput = document.getElementById('dmInput');

// Ringing Modal DOM
const ringingOverlay = document.getElementById('ringingOverlay');
const ringingTitle = document.getElementById('ringingTitle');
const ringingPeerInfo = document.getElementById('ringingPeerInfo');
const ringingSubStatus = document.getElementById('ringingSubStatus');
const incomingCallActions = document.getElementById('incomingCallActions');
const outgoingCallActions = document.getElementById('outgoingCallActions');
const acceptCallBtn = document.getElementById('acceptCallBtn');
const rejectCallBtn = document.getElementById('rejectCallBtn');
const cancelCallBtn = document.getElementById('cancelCallBtn');

// Call Screen DOM
const roomBadge = document.getElementById('roomBadge');
const callStatus = document.getElementById('callStatus');
const remoteVideosGrid = document.getElementById('remoteVideosGrid');
const waitingPlaceholder = document.getElementById('waitingPlaceholder');
const waitingPlaceholderText = document.getElementById('waitingPlaceholderText');
const localVideoWrapper = document.getElementById('localVideoWrapper');
const localVideo = document.getElementById('localVideo');
const toggleChatBtn = document.getElementById('toggleChatBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const chatOverlay = document.getElementById('chatOverlay');
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const muteAudioBtn = document.getElementById('muteAudioBtn');
const muteVideoBtn = document.getElementById('muteVideoBtn');
const leaveBtn = document.getElementById('leaveBtn');

// --- App State ---
let authMode = 'login';
let authToken = localStorage.getItem('vc_token') || '';
let currentUser = null; // { id, name, username, email }
let socket = null;
let rtcManager = null;

let onlineUsernames = new Set();
let unreadFromUsers = new Set();
let lastSearchUsers = [];
let activeDmUser = null;
let toastSenderUser = null;
let toastTimer = null;

let pendingRoomToJoin = null;
let isCreatingRoom = false;
let isChatOpen = false;
let isJoining = false;

let activeCallInvite = null;
let ringInterval = null;
let audioCtx = null;

// --- Subtle Message Notification Sound ---
function playMessageChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.setValueAtTime(1040, now + 0.09);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  } catch {}
}

function showMessageNotification(senderUser, text) {
  toastSenderUser = senderUser;
  toastAvatar.textContent = (senderUser.name || senderUser.username || 'U')[0].toUpperCase();
  toastTitle.textContent = `${senderUser.name} (@${senderUser.username})`;
  toastText.textContent = text;
  toastNotification.classList.remove('hidden');
  playMessageChime();

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastNotification.classList.add('hidden');
  }, 4500);
}

toastNotification.addEventListener('click', () => {
  toastNotification.classList.add('hidden');
  if (toastSenderUser) {
    openDirectChat(toastSenderUser);
  }
});

// --- Ringtone Synthesizer ---
function startRingtone(isIncoming = true) {
  stopRingtone();
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const playTone = () => {
      if (!audioCtx) return;
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(isIncoming ? 520 : 440, now);
      if (isIncoming) {
        osc.frequency.setValueAtTime(660, now + 0.25);
      }
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.6);
    };
    playTone();
    ringInterval = setInterval(playTone, 1800);
  } catch {}
}

function stopRingtone() {
  if (ringInterval) {
    clearInterval(ringInterval);
    ringInterval = null;
  }
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
}

// --- Deterministic Vibrant Color per Username ---
const USER_COLORS = [
  '#60a5fa', '#4ade80', '#c084fc', '#fb923c',
  '#f87171', '#38bdf8', '#34d399', '#f472b6', '#facc15'
];

function getUsernameColor(username) {
  if (!username) return '#60a5fa';
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length];
}

// --- Screen Switching ---
function showScreen(screen) {
  authScreen.classList.remove('active');
  lobbyScreen.classList.remove('active');
  callScreen.classList.remove('active');
  screen.classList.add('active');
}

function updateCallStatus(msg) {
  callStatus.textContent = msg;
}

// --- AUTH FLOW ---
tabLogin.addEventListener('click', () => {
  authMode = 'login';
  tabLogin.classList.add('active');
  tabRegister.classList.remove('active');
  registerNameGroup.classList.add('hidden');
  authSubmitBtn.textContent = 'Login';
  authError.textContent = '';
});

tabRegister.addEventListener('click', () => {
  authMode = 'register';
  tabRegister.classList.add('active');
  tabLogin.classList.remove('active');
  registerNameGroup.classList.remove('hidden');
  authSubmitBtn.textContent = 'Create Account';
  authError.textContent = '';
});

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.textContent = '';

  const name = authNameInput.value.trim();
  const username = authUsernameInput.value.trim().toLowerCase();
  const password = authPasswordInput.value;

  const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';
  const body = authMode === 'register' ? { name, username, password } : { username, password };

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!res.ok) {
      authError.textContent = data.error || 'Authentication failed';
      return;
    }

    authToken = data.token;
    currentUser = data.user;
    localStorage.setItem('vc_token', authToken);
    enterApp();
  } catch {
    authError.textContent = 'Network error. Please try again.';
  }
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('vc_token');
  authToken = '';
  currentUser = null;
  if (rtcManager) rtcManager.cleanup();
  if (socket) socket.disconnect();
  showScreen(authScreen);
});

async function checkExistingSession() {
  if (!authToken) {
    showScreen(authScreen);
    return;
  }
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    if (!res.ok) {
      localStorage.removeItem('vc_token');
      showScreen(authScreen);
      return;
    }
    const data = await res.json();
    currentUser = data.user;
    enterApp();
  } catch {
    showScreen(authScreen);
  }
}

// --- EXPANDABLE SEARCH BAR ---
toggleSearchBtn.addEventListener('click', () => {
  const isExpanded = expandableSearchWrap.classList.contains('expanded');
  if (!isExpanded) {
    expandableSearchWrap.classList.add('expanded');
    closeSearchBtn.classList.remove('hidden');
    userSearchInput.focus();
  } else {
    userSearchInput.focus();
  }
});

closeSearchBtn.addEventListener('click', () => {
  expandableSearchWrap.classList.remove('expanded');
  closeSearchBtn.classList.add('hidden');
  userSearchInput.value = '';
  lastSearchUsers = [];
  searchResultsList.innerHTML = '';
  searchResultsSection.classList.add('hidden');
});

// --- INITIALIZE SOCKET & DASHBOARD ---
function enterApp() {
  userAvatarCircle.textContent = (currentUser.name || currentUser.username || 'U')[0].toUpperCase();
  currentUserNameDisplay.textContent = currentUser.name;
  currentUsernameDisplay.textContent = currentUser.email || `${currentUser.username}@closemiles.in`;
  showScreen(lobbyScreen);

  socket = io({ auth: { token: authToken } });
  rtcManager = new WebRTCManager(
    socket,
    localVideo,
    remoteVideosGrid,
    waitingPlaceholder,
    updateCallStatus
  );

  setupSocketEvents(socket, rtcManager, {
    onRoomsUpdate: renderRooms,
    onOnlineUsersUpdate: (usernames) => {
      onlineUsernames = new Set(usernames);
      renderSearchResults(lastSearchUsers);
    },
    onStatusChange: updateCallStatus,
    onRoomFull: () => {
      rtcManager.cleanup();
      resetCallUI();
      lobbyStatus.textContent = 'Group call is full (max 4 users).';
    },
    onChatMessage: ({ senderUsername, text }) => {
      appendCallChatMessage(senderUsername, text, false);
      if (!isChatOpen) {
        toggleChatBtn.classList.add('has-unread');
      }
    },
    onIncomingCall: ({ fromUsername, fromName, fromSocketId, callType, roomName }) => {
      activeCallInvite = {
        direction: 'incoming',
        peerUsername: fromUsername,
        peerName: fromName,
        peerSocketId: fromSocketId,
        callType,
        roomName
      };
      ringingTitle.textContent = `Incoming Private ${callType === 'audio' ? 'Voice' : 'Video'} Call`;
      ringingPeerInfo.textContent = `${fromName} (@${fromUsername})`;
      ringingSubStatus.textContent = 'Ringing...';
      incomingCallActions.classList.remove('hidden');
      outgoingCallActions.classList.add('hidden');
      ringingOverlay.classList.remove('hidden');
      startRingtone(true);
    },
    onCallAccepted: async ({ byName, byUsername, roomName, callType }) => {
      stopRingtone();
      ringingOverlay.classList.add('hidden');
      activeCallInvite = null;
      await joinRoom(roomName, callType, true, `${byName} (@${byUsername})`);
    },
    onCallRejected: ({ byName, byUsername }) => {
      stopRingtone();
      ringingOverlay.classList.add('hidden');
      activeCallInvite = null;
      lobbyStatus.textContent = `${byName} (@${byUsername}) declined the private call.`;
    },
    onCallCanceled: () => {
      stopRingtone();
      ringingOverlay.classList.add('hidden');
      activeCallInvite = null;
    },
    onCallBusy: ({ targetUsername }) => {
      stopRingtone();
      ringingOverlay.classList.add('hidden');
      activeCallInvite = null;
      lobbyStatus.textContent = `@${targetUsername} is currently in another call.`;
    },
    onUserOffline: ({ targetUsername }) => {
      stopRingtone();
      ringingOverlay.classList.add('hidden');
      activeCallInvite = null;
      lobbyStatus.textContent = `@${targetUsername} is offline.`;
    },
    onDirectMessage: (msg) => {
      const isFromMe = msg.from === currentUser.username;
      if (
        activeDmUser &&
        !dmModalOverlay.classList.contains('hidden') &&
        (msg.from === activeDmUser.username || msg.to === activeDmUser.username)
      ) {
        appendDmBubble(msg.text, isFromMe);
      } else if (!isFromMe) {
        // Notify recipient of new message
        unreadFromUsers.add(msg.from);
        renderSearchResults(lastSearchUsers);
        showMessageNotification(
          { name: msg.fromName || msg.from, username: msg.from },
          msg.text
        );
      }
    }
  });
}

// --- USER SEARCH ---
let searchTimeout = null;
userSearchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  const q = userSearchInput.value.trim();
  if (!q) {
    lastSearchUsers = [];
    searchResultsList.innerHTML = '';
    searchResultsSection.classList.add('hidden');
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      const data = await res.json();
      lastSearchUsers = data.users || [];
      renderSearchResults(lastSearchUsers);
    } catch {}
  }, 220);
});

function renderSearchResults(users) {
  searchResultsList.innerHTML = '';
  if (!users || users.length === 0) {
    if (userSearchInput.value.trim()) {
      searchResultsSection.classList.remove('hidden');
      searchResultsList.innerHTML = `<div style="color:var(--text-muted);font-size:0.86rem;">No users found.</div>`;
    } else {
      searchResultsSection.classList.add('hidden');
    }
    return;
  }

  searchResultsSection.classList.remove('hidden');
  users.forEach((u) => {
    const isOnline = onlineUsernames.has(u.username);
    const hasUnread = unreadFromUsers.has(u.username);
    const displayEmail = u.email || `${u.username}@closemiles.in`;

    const row = document.createElement('div');
    row.className = 'user-result-item';
    row.innerHTML = `
      <div class="user-result-meta">
        <span class="status-dot ${isOnline ? 'online' : ''}" title="${isOnline ? 'Online' : 'Offline'}"></span>
        <div>
          <div style="font-weight:600;font-size:0.93rem;">${u.name}</div>
          <div style="font-size:0.8rem;color:#60a5fa;">${displayEmail}</div>
        </div>
      </div>
      <div class="user-result-actions">
        <button type="button" class="action-chip btn-chat ${hasUnread ? 'has-unread' : ''}">Chat</button>
        <button type="button" class="action-chip btn-voice">Voice</button>
        <button type="button" class="action-chip btn-video">Video</button>
      </div>
    `;

    row.querySelector('.btn-chat').addEventListener('click', () => openDirectChat(u));
    row.querySelector('.btn-voice').addEventListener('click', () => initiateDirectCall(u, 'audio'));
    row.querySelector('.btn-video').addEventListener('click', () => initiateDirectCall(u, 'video'));

    searchResultsList.appendChild(row);
  });
}

// --- PRIVATE 1-TO-1 CALL & RINGING ---
function initiateDirectCall(targetUser, callType) {
  dmModalOverlay.classList.add('hidden');
  activeCallInvite = {
    direction: 'outgoing',
    peerUsername: targetUser.username,
    peerName: targetUser.name,
    callType
  };

  ringingTitle.textContent = `Private ${callType === 'audio' ? 'Voice' : 'Video'} Call`;
  ringingPeerInfo.textContent = `${targetUser.name} (@${targetUser.username})`;
  ringingSubStatus.textContent = 'Ringing...';
  incomingCallActions.classList.add('hidden');
  outgoingCallActions.classList.remove('hidden');
  ringingOverlay.classList.remove('hidden');
  startRingtone(false);

  socket.emit('call-user', {
    targetUsername: targetUser.username,
    callType
  });
}

acceptCallBtn.addEventListener('click', async () => {
  if (!activeCallInvite || activeCallInvite.direction !== 'incoming') return;
  stopRingtone();
  ringingOverlay.classList.add('hidden');

  const { peerSocketId, peerName, peerUsername, roomName, callType } = activeCallInvite;
  activeCallInvite = null;

  socket.emit('call-accepted', {
    toSocketId: peerSocketId,
    roomName,
    callType
  });

  await joinRoom(roomName, callType, true, `${peerName} (@${peerUsername})`);
});

rejectCallBtn.addEventListener('click', () => {
  if (!activeCallInvite || activeCallInvite.direction !== 'incoming') return;
  stopRingtone();
  ringingOverlay.classList.add('hidden');
  socket.emit('call-rejected', { toSocketId: activeCallInvite.peerSocketId });
  activeCallInvite = null;
});

cancelCallBtn.addEventListener('click', () => {
  if (!activeCallInvite || activeCallInvite.direction !== 'outgoing') return;
  stopRingtone();
  ringingOverlay.classList.add('hidden');
  socket.emit('call-canceled', { targetUsername: activeCallInvite.peerUsername });
  activeCallInvite = null;
});

// --- DIRECT MESSAGING MODAL ---
async function openDirectChat(user) {
  activeDmUser = user;
  unreadFromUsers.delete(user.username);
  renderSearchResults(lastSearchUsers);

  dmTargetAvatar.textContent = (user.name || user.username || 'U')[0].toUpperCase();
  dmTargetName.textContent = user.name;
  dmTargetUsername.textContent = user.email || `${user.username}@closemiles.in`;
  dmMessagesList.innerHTML = '';
  dmModalOverlay.classList.remove('hidden');

  try {
    const res = await fetch(`/api/messages/${encodeURIComponent(user.username)}`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    (data.messages || []).forEach((m) => {
      appendDmBubble(m.text, m.from === currentUser.username);
    });
  } catch {}
}

function appendDmBubble(text, isSelf) {
  const div = document.createElement('div');
  div.className = `dm-bubble ${isSelf ? 'self' : 'peer'}`;
  div.textContent = text;
  dmMessagesList.appendChild(div);
  dmMessagesList.scrollTop = dmMessagesList.scrollHeight;
}

closeDmBtn.addEventListener('click', () => {
  dmModalOverlay.classList.add('hidden');
  activeDmUser = null;
});

dmVoiceCallBtn.addEventListener('click', () => {
  if (activeDmUser) initiateDirectCall(activeDmUser, 'audio');
});

dmVideoCallBtn.addEventListener('click', () => {
  if (activeDmUser) initiateDirectCall(activeDmUser, 'video');
});

dmForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = dmInput.value.trim();
  if (!text || !activeDmUser) return;
  socket.emit('direct-message', {
    targetUsername: activeDmUser.username,
    text
  });
  dmInput.value = '';
});

// --- GROUP CALL ROOMS (MAX 4) ---
function renderRooms(rooms) {
  roomsGrid.innerHTML = '';

  const createBox = document.createElement('button');
  createBox.type = 'button';
  createBox.className = 'room-box create-box';
  createBox.innerHTML = `
    <span class="plus-icon">+</span>
    <span class="room-box-label">New Group Call</span>
  `;
  createBox.addEventListener('click', () => openRoomModal(true, ''));
  roomsGrid.appendChild(createBox);

  rooms.forEach((room) => {
    const box = document.createElement('button');
    box.type = 'button';
    const isFull = room.count >= 4;
    box.className = `room-box ${isFull ? 'full' : ''}`;
    box.innerHTML = `
      <span class="room-box-name">${room.name}</span>
      <span class="room-box-count">${room.count}/4 joined</span>
    `;
    box.addEventListener('click', () => {
      if (isFull) {
        lobbyStatus.textContent = 'This group call is already full (4/4).';
        return;
      }
      openRoomModal(false, room.name);
    });
    roomsGrid.appendChild(box);
  });
}

function openRoomModal(createMode, roomName) {
  isCreatingRoom = createMode;
  pendingRoomToJoin = roomName;
  modalOverlay.classList.remove('hidden');

  if (createMode) {
    modalTitle.textContent = 'Create Group Call';
    modalDesc.textContent = 'Enter a room name (max 4 users)';
    modalRoomInput.value = '';
    modalRoomInput.classList.remove('hidden');
    modalConfirmBtn.textContent = 'Create & Join';
    setTimeout(() => modalRoomInput.focus(), 50);
  } else {
    modalTitle.textContent = 'Join Group Call';
    modalDesc.textContent = `Join "${roomName}" as @${currentUser.username}?`;
    modalRoomInput.classList.add('hidden');
    modalConfirmBtn.textContent = 'Confirm Join';
  }
}

modalCancelBtn.addEventListener('click', () => {
  modalOverlay.classList.add('hidden');
  pendingRoomToJoin = null;
});

modalConfirmBtn.addEventListener('click', async () => {
  const roomName = isCreatingRoom
    ? modalRoomInput.value.trim().toLowerCase()
    : pendingRoomToJoin;

  if (!roomName) {
    modalDesc.textContent = 'Please enter a valid room name.';
    return;
  }

  modalOverlay.classList.add('hidden');
  await joinRoom(roomName, 'video', false, null);
});

async function joinRoom(roomName, callType = 'video', isPrivateCall = false, privatePeerLabel = null) {
  if (isJoining) return;
  isJoining = true;
  lobbyStatus.textContent = 'Accessing media devices...';

  try {
    await rtcManager.initLocalMedia(callType);
    rtcManager.roomName = roomName;

    localVideoWrapper.classList.toggle('hidden', callType === 'audio');
    muteVideoBtn.classList.toggle('muted', callType === 'audio');

    if (isPrivateCall) {
      roomBadge.textContent = privatePeerLabel
        ? `Private Call • ${privatePeerLabel}`
        : 'Private Call';
      waitingPlaceholderText.textContent = privatePeerLabel
        ? `Waiting for ${privatePeerLabel} to join...`
        : 'Waiting for user to join...';
    } else {
      roomBadge.textContent = `Group Call • ${roomName}`;
      waitingPlaceholderText.textContent = 'Waiting for users to join...';
    }

    socket.emit('join', { roomName });
    showScreen(callScreen);
    updateCallStatus('1 joined');
  } catch {
    lobbyStatus.textContent = 'Microphone/Camera permission denied.';
    isJoining = false;
  }
}

// --- IN-CALL TRANSPARENT COLORFUL CHAT & CONTROLS ---
function appendCallChatMessage(senderUsername, text, isSelf) {
  const item = document.createElement('div');
  item.className = 'chat-msg';

  const nameEl = document.createElement('span');
  nameEl.className = 'chat-sender';
  const label = isSelf ? 'you' : senderUsername;
  nameEl.textContent = `${label}: `;
  nameEl.style.color = getUsernameColor(isSelf ? currentUser.username : senderUsername);

  const textEl = document.createElement('span');
  textEl.className = 'chat-text';
  textEl.textContent = text;

  item.appendChild(nameEl);
  item.appendChild(textEl);
  chatMessages.appendChild(item);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

toggleChatBtn.addEventListener('click', () => {
  isChatOpen = !isChatOpen;
  toggleChatBtn.classList.toggle('active', isChatOpen);
  toggleChatBtn.classList.remove('has-unread');
  chatOverlay.classList.toggle('hidden', !isChatOpen);
  chatForm.classList.toggle('hidden', !isChatOpen);
  if (isChatOpen) chatInput.focus();
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text || !rtcManager.roomName) return;

  socket.emit('chat-message', {
    roomName: rtcManager.roomName,
    text
  });
  appendCallChatMessage(currentUser.username, text, true);
  chatInput.value = '';
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
  } catch {}
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
  resetCallUI();
});

function resetCallUI() {
  muteAudioBtn.classList.remove('muted');
  muteVideoBtn.classList.remove('muted');
  toggleChatBtn.classList.remove('active', 'has-unread');
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

// Start App
checkExistingSession();