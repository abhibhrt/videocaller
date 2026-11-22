// public/js/webrtc.js
export class WebRTCManager {
  constructor(socket, localVideo, remoteVideosGrid, waitingPlaceholder, onStatusChange) {
    this.socket = socket;
    this.localVideo = localVideo;
    this.remoteVideosGrid = remoteVideosGrid;
    this.waitingPlaceholder = waitingPlaceholder;
    this.onStatusChange = onStatusChange;

    // Map<socketId, { pc, pendingCandidates, tileEl, videoEl, avatarEl, name, username, restartTimer, isRestarting }>
    this.peers = new Map();
    this.localStream = null;
    this.roomName = null;
    this.callMode = 'video'; // 'video' | 'audio'
    this.wakeLock = null;

    // STUN + TURN relay servers so mobile NATs & app switches don't drop P2P connections
    this.config = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ],
      iceCandidatePoolSize: 10
    };

    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  async requestWakeLock() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {}
  }

  releaseWakeLock() {
    if (this.wakeLock) {
      this.wakeLock.release().catch(() => {});
      this.wakeLock = null;
    }
  }

  async handleVisibilityChange() {
    if (!this.roomName) return;

    if (document.visibilityState === 'visible') {
      // Re-acquire Wake Lock when returning to Chrome
      await this.requestWakeLock();

      // Resume paused video elements on mobile Chrome
      if (this.localVideo && this.localVideo.paused) {
        this.localVideo.play().catch(() => {});
      }

      for (const [socketId, entry] of this.peers.entries()) {
        if (entry.videoEl && entry.videoEl.paused) {
          entry.videoEl.play().catch(() => {});
        }
        const iceState = entry.pc.iceConnectionState;
        const connState = entry.pc.connectionState;
        if (
          iceState === 'disconnected' ||
          iceState === 'failed' ||
          connState === 'disconnected' ||
          connState === 'failed'
        ) {
          this.restartIce(socketId);
        }
      }
    }
  }

  async initLocalMedia(mode = 'video') {
    this.callMode = mode;
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: mode === 'video' ? { facingMode: 'user' } : false,
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    this.localVideo.srcObject = this.localStream;
    await this.requestWakeLock();
  }

  updateGridLayout() {
    const remoteCount = this.peers.size;
    const totalJoined = remoteCount + 1;
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
      username,
      restartTimer: null,
      isRestarting: false
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
      videoEl.play().catch(() => {});
      const hasVideo = stream.getVideoTracks().length > 0;
      avatarEl.classList.toggle('hidden', hasVideo);
    };

    // Graceful ICE recovery instead of dropping immediately on brief disconnects
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;

      if (iceState === 'connected' || iceState === 'completed') {
        entry.isRestarting = false;
        if (entry.restartTimer) {
          clearTimeout(entry.restartTimer);
          entry.restartTimer = null;
        }
        this.updateGridLayout();
      } else if (iceState === 'disconnected') {
        this.onStatusChange('Reconnecting...');
        if (!entry.restartTimer) {
          entry.restartTimer = setTimeout(() => {
            entry.restartTimer = null;
            if (
              pc.iceConnectionState === 'disconnected' ||
              pc.iceConnectionState === 'failed'
            ) {
              this.restartIce(socketId);
            }
          }, 3500);
        }
      } else if (iceState === 'failed') {
        this.restartIce(socketId);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      if (state === 'connected') {
        this.updateGridLayout();
      } else if (state === 'failed') {
        this.restartIce(socketId);
      } else if (state === 'closed') {
        this.removePeer(socketId);
      }
    };

    return entry;
  }

  async restartIce(socketId) {
    const entry = this.peers.get(socketId);
    if (!entry || entry.isRestarting || !this.socket.connected) return;

    try {
      entry.isRestarting = true;
      const offer = await entry.pc.createOffer({ iceRestart: true });
      await entry.pc.setLocalDescription(offer);

      this.socket.emit('signal', {
        roomId: this.roomName,
        description: entry.pc.localDescription,
        to: socketId
      });
    } catch {
      entry.isRestarting = false;
    }
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
        // Handle offer collision (glare) gracefully during ICE restarts
        if (pc.signalingState !== 'stable') {
          await Promise.all([
            pc.setLocalDescription({ type: 'rollback' }),
            pc.setRemoteDescription(new RTCSessionDescription(description))
          ]);
        } else {
          await pc.setRemoteDescription(new RTCSessionDescription(description));
        }

        await this.flushCandidates(entry);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('signal', {
          roomId: this.roomName,
          description: pc.localDescription,
          to: from
        });
      } else if (description.type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(description));
          await this.flushCandidates(entry);
        }
      }
    } else if (candidate) {
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
      } else {
        entry.pendingCandidates.push(candidate);
      }
    }
  }

  async flushCandidates(entry) {
    for (const c of entry.pendingCandidates) {
      await entry.pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
    }
    entry.pendingCandidates = [];
  }

  removePeer(socketId) {
    const entry = this.peers.get(socketId);
    if (!entry) return;

    if (entry.restartTimer) {
      clearTimeout(entry.restartTimer);
    }
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
    this.releaseWakeLock();
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