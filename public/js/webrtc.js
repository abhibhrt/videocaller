// public/js/webrtc.js
export class WebRTCManager {
  constructor(socket, localVideo, remoteVideo, onStatusChange) {
    this.socket = socket;
    this.localVideo = localVideo;
    this.remoteVideo = remoteVideo;
    this.onStatusChange = onStatusChange;

    this.pc = null;
    this.localStream = null;
    this.roomName = null;
    this.remoteId = null;
    this.pendingCandidates = [];

    this.config = {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    };
  }

  async initLocalMedia() {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user' },
      audio: true
    });
    this.localVideo.srcObject = this.localStream;
  }

  async createPeerConnection() {
    if (this.pc) return;
    this.pc = new RTCPeerConnection(this.config);

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.remoteId) {
        this.socket.emit('signal', {
          roomId: this.roomName,
          candidate: event.candidate,
          to: this.remoteId
        });
      }
    };

    this.pc.ontrack = (event) => {
      this.remoteVideo.srcObject = event.streams[0];
      this.onStatusChange('Connected');
    };

    this.pc.onconnectionstatechange = () => {
      const state = this.pc.connectionState;
      if (state === 'disconnected' || state === 'failed' || state === 'closed') {
        this.resetRemote();
        this.onStatusChange('Peer disconnected');
      }
    };

    this.addLocalTracks();
  }

  addLocalTracks() {
    if (!this.localStream || !this.pc) return;
    const existingSenders = this.pc.getSenders().map((s) => s.track).filter(Boolean);
    for (const track of this.localStream.getTracks()) {
      if (!existingSenders.includes(track)) {
        this.pc.addTrack(track, this.localStream);
      }
    }
  }

  async createAndSendOffer(peerId) {
    this.remoteId = peerId;
    await this.createPeerConnection();
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    this.socket.emit('signal', {
      roomId: this.roomName,
      description: this.pc.localDescription,
      to: this.remoteId
    });
  }

  async handleSignal({ from, description, candidate }) {
    this.remoteId = from;
    await this.createPeerConnection();

    if (description) {
      if (description.type === 'offer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(description));
        await this.flushCandidates();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this.socket.emit('signal', {
          roomId: this.roomName,
          description: this.pc.localDescription,
          to: from
        });
      } else if (description.type === 'answer') {
        await this.pc.setRemoteDescription(new RTCSessionDescription(description));
        await this.flushCandidates();
      }
    } else if (candidate) {
      if (this.pc.remoteDescription && this.pc.remoteDescription.type) {
        await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        this.pendingCandidates.push(candidate);
      }
    }
  }

  async flushCandidates() {
    for (const c of this.pendingCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c));
    }
    this.pendingCandidates = [];
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
    return false;
  }

  resetRemote() {
    if (this.remoteVideo.srcObject) {
      this.remoteVideo.srcObject.getTracks().forEach((t) => t.stop());
      this.remoteVideo.srcObject = null;
    }
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }
    this.remoteId = null;
    this.pendingCandidates = [];
  }

  cleanup() {
    this.resetRemote();
    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }
    this.localVideo.srcObject = null;
    this.roomName = null;
  }
}