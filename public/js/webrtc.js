// public/js/webrtc.js
export class WebRTCManager {
  constructor(socket, localVideo, remoteVideosGrid, waitingPlaceholder, onStatusChange) {
    this.socket = socket;
    this.localVideo = localVideo;
    this.remoteVideosGrid = remoteVideosGrid;
    this.waitingPlaceholder = waitingPlaceholder;
    this.onStatusChange = onStatusChange;

    // Map<socketId, { pc, pendingCandidates, tileEl, videoEl, avatarEl, name, username }>
    this.peers = new Map();
    this.localStream = null;
    this.roomName = null;
    this.callMode = 'video'; // 'video' | 'audio'

    this.config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
  }

  async initLocalMedia(mode = 'video') {
    this.callMode = mode;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: mode === 'video' ? { facingMode: 'user' } : false,
      audio: true
    });
    this.localVideo.srcObject = this.localStream;
  }

  updateGridLayout() {
    const remoteCount = this.peers.size;
    const totalJoined = remoteCount + 1; // Includes current user
    this.remoteVideosGrid.className = `remote-grid count-${Math.min(remoteCount, 3)}`;

    if (remoteCount === 0) {
      this.waitingPlaceholder.classList.remove('hidden');
    } else {
      this.waitingPlaceholder.classList.add('hidden');
    }

    this.onStatusChange(`${totalJoined} joined`);
  }

  getOrCreatePeerEntry(socketId, name = 'User', username = '') {
    if (this.peers.has(socketId)) {
      const existing = this.peers.get(socketId);
      if (name && name !== 'User') existing.name = name;
      if (username) existing.username = username;
      return existing;
    }

    const pc = new RTCPeerConnection(this.config);

    const tileEl = document.createElement('div');
    tileEl.className = 'remote-tile';
    tileEl.dataset.peerId = socketId;

    const videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;

    const avatarEl = document.createElement('div');
    avatarEl.className = 'audio-avatar';
    avatarEl.textContent = (name || username || 'U')[0].toUpperCase();

    const labelEl = document.createElement('span');
    labelEl.className = 'video-label';
    labelEl.textContent = username ? `${name} (@${username})` : name;

    tileEl.appendChild(videoEl);
    tileEl.appendChild(avatarEl);
    tileEl.appendChild(labelEl);
    this.remoteVideosGrid.appendChild(tileEl);

    const entry = {
      pc,
      pendingCandidates: [],
      tileEl,
      videoEl,
      avatarEl,
      name,
      username
    };
    this.peers.set(socketId, entry);
    this.updateGridLayout();

    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.socket.emit('signal', {
          roomId: this.roomName,
          candidate: event.candidate,
          to: socketId
        });
      }
    };

    pc.ontrack = (event) => {
      const stream = event.streams[0];
      videoEl.srcObject = stream;
      const hasVideo = stream.getVideoTracks().length > 0;
      avatarEl.classList.toggle('hidden', hasVideo);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.removePeer(socketId);
      }
    };

    return entry;
  }

  async createAndSendOffer(socketId, name, username) {
    const entry = this.getOrCreatePeerEntry(socketId, name, username);
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);

    this.socket.emit('signal', {
      roomId: this.roomName,
      description: entry.pc.localDescription,
      to: socketId
    });
  }

  async handleSignal({ from, fromName, fromUsername, description, candidate }) {
    const entry = this.getOrCreatePeerEntry(from, fromName, fromUsername);
    const { pc } = entry;

    if (description) {
      if (description.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        await this.flushCandidates(entry);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('signal', {
          roomId: this.roomName,
          description: pc.localDescription,
          to: from
        });
      } else if (description.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(description));
        await this.flushCandidates(entry);
      }
    } else if (candidate) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        entry.pendingCandidates.push(candidate);
      }
    }
  }

  async flushCandidates(entry) {
    for (const c of entry.pendingCandidates) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(c));
    }
    entry.pendingCandidates = [];
  }

  removePeer(socketId) {
    const entry = this.peers.get(socketId);
    if (!entry) return;

    if (entry.videoEl.srcObject) {
      entry.videoEl.srcObject.getTracks().forEach((t) => t.stop());
      entry.videoEl.srcObject = null;
    }
    entry.pc.close();
    entry.tileEl.remove();
    this.peers.delete(socketId);
    this.updateGridLayout();
  }

  toggleAudio() {
    if (!this.localStream) return false;
    const audioTrack = this.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled;
    }
    return false;
  }

  toggleVideo() {
    if (!this.localStream) return false;
    const videoTrack = this.localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      return !videoTrack.enabled;
    }
    return true;
  }

  cleanup() {
    for (const socketId of Array.from(this.peers.keys())) {
      this.removePeer(socketId);
    }
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.localVideo.srcObject = null;
    this.roomName = null;
    this.updateGridLayout();
  }
}