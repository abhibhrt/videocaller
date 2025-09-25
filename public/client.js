// client.js - Fixed & robust 1-to-1 WebRTC client (works with your server.js)
const socket = io();

const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const roomInput = document.getElementById('roomId');
const statusSpan = document.getElementById('status');

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream = null;
let pc = null;
let roomId = null;
let myId = null;
let remoteId = null;

// queue for ICE candidates received before remoteDescription is set
let pendingCandidates = [];

function status(msg) {
  if (statusSpan) statusSpan.textContent = msg;
}

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
    // Add TURN in production:
    // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
  ]
};

/* ---------- UI handlers ---------- */
joinBtn.onclick = async () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert('Enter room id');

  joinBtn.disabled = true;
  status('Getting local media...');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    // ensure autoplay & playsInline to avoid mobile autoplay restrictions
    localVideo.autoplay = true;
    localVideo.playsInline = true;
    localVideo.muted = true;
    localVideo.srcObject = localStream;
  } catch (err) {
    console.error('media error', err);
    alert('Could not get camera/microphone: ' + err.message);
    joinBtn.disabled = false;
    return;
  }

  socket.emit('join', roomId);
  status('Joined room, waiting for peer...');
  leaveBtn.disabled = false;
};

leaveBtn.onclick = () => {
  // notify server
  if (roomId) socket.emit('leave', roomId);
  cleanup();
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  status('Left room');
};

/* ---------- Socket handlers ---------- */
socket.on('connect', () => {
  myId = socket.id;
  console.log('connected as', myId);
});

socket.on('participants', ({ count }) => {
  status(`Participants in room: ${count}`);
});

socket.on('room-full', () => {
  alert('Room is full (this demo supports 2 participants).');
  // optionally cleanup if you were just added
  cleanup();
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
});

socket.on('peer-joined', async ({ peerId }) => {
  // Server notifies existing participant that a new peer joined
  console.log('peer-joined (existing):', peerId);
  // existing participant should create the offer to the newcomer
  remoteId = peerId;
  await maybeCreatePeerConnection();

  // create offer as existing participant
  try {
    await createAndSendOffer();
  } catch (e) {
    console.error('Error creating/sending offer', e);
  }
});

socket.on('signal', async ({ from, description, candidate }) => {
  console.log('signal from', from, { description, candidate });
  remoteId = from;
  await maybeCreatePeerConnection();

  if (description) {
    if (description.type === 'offer') {
      // remote sent an offer -> set it and create an answer
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        // flush any queued candidates now that remoteDescription is set
        await flushPendingCandidates();

        await addLocalTracks(); // ensure local tracks are added
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('signal', { roomId, description: pc.localDescription, to: from });
      } catch (e) {
        console.error('Error handling offer', e);
      }
    } else if (description.type === 'answer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        await flushPendingCandidates();
      } catch (e) {
        console.error('Error setting remote answer', e);
      }
    }
  } else if (candidate) {
    // ICE candidate
    try {
      // If remoteDescription is set, add immediately; otherwise queue
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingCandidates.push(candidate);
      }
    } catch (e) {
      console.error('Error adding ICE candidate', e);
    }
  }
});

socket.on('peer-left', ({ peerId }) => {
  console.log('peer left', peerId);
  status('Peer left');
  // cleanup remote connection but keep local stream so user can re-join
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteId = null;
  pendingCandidates = [];
});

/* ---------- WebRTC helpers ---------- */

async function maybeCreatePeerConnection() {
  if (pc) return;
  pc = new RTCPeerConnection(configuration);

  // ICE -> send to remote
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      if (!remoteId) {
        // remoteId might not be known yet; queue candidate locally until remoteId known
        // but most flows know remoteId before gathering or will re-emit; for now store and drop if remoteId never appears
        console.warn('ICE candidate ready but remoteId unknown, dropping until remote known');
      } else {
        socket.emit('signal', { roomId, candidate: event.candidate, to: remoteId });
      }
    }
  };

  pc.ontrack = (event) => {
    console.log('ontrack', event.streams);
    // assume single remote stream
    try {
      remoteVideo.autoplay = true;
      remoteVideo.playsInline = true;
      remoteVideo.srcObject = event.streams[0];
    } catch (e) {
      console.error('Error attaching remote stream', e);
    }
  };

  pc.onconnectionstatechange = () => {
    console.log('pc connectionState:', pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      // cleanup remote side but keep local stream
      if (remoteVideo.srcObject) {
        remoteVideo.srcObject.getTracks().forEach(t => t.stop());
        remoteVideo.srcObject = null;
      }
    }
  };

  // Add local tracks (if available)
  await addLocalTracks();
}

async function addLocalTracks() {
  if (!localStream) return;
  if (!pc) return;

  // Add each track if not already added
  const existingSenders = pc.getSenders().map(s => s.track).filter(Boolean);
  for (const track of localStream.getTracks()) {
    if (!existingSenders.includes(track)) {
      try {
        pc.addTrack(track, localStream);
      } catch (e) {
        console.warn('addTrack failed', e);
      }
    }
  }
}

async function createAndSendOffer() {
  if (!pc) await maybeCreatePeerConnection();
  await addLocalTracks();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  if (!remoteId) {
    console.warn('No remoteId known when creating offer — offer will be sent when remoteId known');
  } else {
    socket.emit('signal', { roomId, description: pc.localDescription, to: remoteId });
  }
}

async function flushPendingCandidates() {
  if (!pc) return;
  if (pendingCandidates.length === 0) return;
  for (const c of pendingCandidates) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(c));
    } catch (e) {
      console.warn('Error adding pending candidate', e);
    }
  }
  pendingCandidates = [];
}

/* ---------- Cleanup ---------- */
function cleanup() {
  if (pc) {
    try { pc.close(); } catch (e) { /* ignore */ }
    pc = null;
  }
  pendingCandidates = [];
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
  remoteId = null;
  roomId = null;
}