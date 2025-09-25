// client.js - browser side signaling + WebRTC
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

const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    // Add TURN server here in production:
    // { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
  ]
};

joinBtn.onclick = async () => {
  roomId = roomInput.value.trim();
  if (!roomId) return alert('Enter room id');

  joinBtn.disabled = true;
  status('Getting local media...');
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
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

// Leave
leaveBtn.onclick = () => {
  cleanup();
  socket.emit('leave', roomId);
  joinBtn.disabled = false;
  leaveBtn.disabled = true;
  status('Left room');
};

socket.on('connect', () => {
  myId = socket.id;
  console.log('connected as', myId);
});

socket.on('participants', ({ count }) => {
  status(`Participants in room: ${count}`);
});

socket.on('room-full', () => {
  alert('Room is full (this simple demo supports 2 participants).');
});

socket.on('peer-joined', async ({ peerId }) => {
  // A peer joined after you. If you already have localStream, create offer
  console.log('peer-joined', peerId);
  remoteId = peerId;
  await maybeCreatePeerConnection();

  // If we have localStream and pc and we are the one who should create an offer:
  // For simplicity we'll let the peer who joined later create the offer OR you can use logic:
  // Here: existing participant (the one already in the room) will create the offer.
  // We'll assume server notifies both; to ensure one side creates offer,
  // the side that receives 'peer-joined' will NOT create offer. Instead, the new joiner should create offer.
  // To make deterministic: if myId < remoteId then create offer (simple arbitrary rule)
  if (myId && remoteId && myId < remoteId) {
    await createAndSendOffer();
  }
});

socket.on('signal', async ({ from, description, candidate }) => {
  console.log('signal from', from, { description, candidate });
  remoteId = from;
  await maybeCreatePeerConnection();

  if (description) {
    if (description.type === 'offer') {
      // Set remote description and create answer
      await pc.setRemoteDescription(new RTCSessionDescription(description));
      await addLocalTracks();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { roomId, description: pc.localDescription, to: from });
    } else if (description.type === 'answer') {
      await pc.setRemoteDescription(new RTCSessionDescription(description));
    }
  } else if (candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) {
      console.error('Error adding received ICE candidate', e);
    }
  }
});

socket.on('peer-left', ({ peerId }) => {
  console.log('peer left', peerId);
  status('Peer left');
  // cleanup remote video / connection
  if (remoteVideo.srcObject) {
    remoteVideo.srcObject.getTracks().forEach(t => t.stop());
    remoteVideo.srcObject = null;
  }
  if (pc) {
    pc.close();
    pc = null;
  }
  remoteId = null;
});

// Helpers

function status(text) {
  statusSpan.innerText = text;
}

async function maybeCreatePeerConnection() {
  if (pc) return;
  pc = new RTCPeerConnection(configuration);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { roomId, candidate: event.candidate, to: remoteId });
    }
  };

  pc.ontrack = (event) => {
    console.log('ontrack', event.streams);
    // For simple demo: assume single remote stream
    remoteVideo.srcObject = event.streams[0];
  };

  // If browser supports onnegotiationneeded you can use that for creating offers
  pc.onnegotiationneeded = async () => {
    console.log('onnegotiationneeded');
    // We will rely on explicit offer creation in our flow to avoid double-offers
  };

  // Add local tracks (if available)
  await addLocalTracks();
}

async function addLocalTracks() {
  if (!localStream) return;
  if (!pc) return;
  // Remove existing senders first (defensive)
  localStream.getTracks().forEach(track => {
    // check not already added
    const senders = pc.getSenders().map(s => s.track).filter(Boolean);
    if (!senders.includes(track)) pc.addTrack(track, localStream);
  });
}

async function createAndSendOffer() {
  if (!pc) await maybeCreatePeerConnection();
  await addLocalTracks();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { roomId, description: pc.localDescription, to: remoteId });
}

// Cleanup local resources
function cleanup() {
  if (pc) {
    pc.close();
    pc = null;
  }
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }
  localStream = null;
  localVideo.srcObject = null;
  remoteVideo.srcObject = null;
}
