# Video & Voice Caller

```text
# 1-to-1 WebRTC Video & Voice Call

A lightweight, mobile-first 1-to-1 peer-to-peer video and audio calling web application built with **Node.js**, **Express**, **Socket.IO**, and **WebRTC**.

---

## Features

- **Named Rooms**: Join or create any room dynamically using custom room names (e.g., `standup`, `family-chat`).
- **1-to-1 Peer-to-Peer**: Direct media streaming via WebRTC with STUN server NAT traversal.
- **Mobile-First Responsive UI**: Full-screen remote video (`100dvh`), floating mirrored Picture-in-Picture (PiP) local camera preview, and touch-friendly call controls.
- **In-Call Controls**: Mute/unmute microphone, toggle camera on/off, and drop call cleanly.
- **Modular Architecture**: Clean separation of concerns across routes, controllers, services, and ES6 client modules.

---

## Architecture

### System Overview

+-------------------+                              +-------------------+
|     Peer A        |                              |     Peer B        |
|  (Mobile Browser) |                              |  (Mobile Browser) |
+---------+---------+                              +---------+---------+
          |                                                  |
          |  1. Join Room / SDP Offer & Answer / ICE         |
          +---------------------->+  +<----------------------+
                                  |  |
                        +---------v--v---------+
                        |   Signaling Server   |
                        | (Express + Socket.IO)|
                        +----------------------+
                                  |
          2. Direct P2P Media Stream (Audio / Video via SRTP)
          |<================================================>|
                     (STUN: stun.l.google.com:19302)

### Signaling & Connection Flow

1. **Lobby & Media Access**: User enters a room name; the browser requests `getUserMedia` (camera & microphone) and emits `join` with the `roomName`.
2. **Room Tracking**: `room.service.js` tracks active socket IDs per room and enforces a 2-participant limit (`room-full` emitted if `size > 2`).
3. **Offer / Answer Handshake**:
   - When Peer B joins, the server notifies Peer A (`peer-joined`).
   - Peer A creates an `RTCPeerConnection`, generates an SDP **Offer**, and relays it via `signal`.
   - Peer B sets the remote description, generates an SDP **Answer**, and sends it back.
4. **ICE Candidate Exchange**: Both peers gather network candidates via Google's public STUN server and exchange them via `signal` (queuing early candidates until `remoteDescription` is set).
5. **Direct Media Flow**: Once ICE checks succeed, audio and video tracks flow directly between peers without passing through the Node.js server.

---

## Project Structure

├── server.js                          # Entry point: HTTP, Express, & Socket.IO initialization
├── package.json                       # Dependencies & scripts
├── src/
│   ├── config/
│   │   └── socket.js                  # Socket.IO connection binding
│   ├── controllers/
│   │   └── signaling.controller.js    # Socket event handlers (join, signal, leave, disconnect)
│   ├── routes/
│   │   └── index.routes.js            # HTTP health-check endpoint
│   ├── services/
│   │   └── room.service.js            # In-memory room state & participant management
│   └── utils/
│       └── constants.js               # Socket event names & room size limits
└── public/
    ├── index.html                     # Mobile-responsive Lobby & Call UI
    ├── css/
    │   └── style.css                  # Full-viewport layout, PiP styling, & glassmorphic controls
    └── js/
        ├── app.js                     # DOM bindings, screen transitions, & button actions
        ├── socket.js                  # Client Socket.IO listeners
        └── webrtc.js                  # RTCPeerConnection, ICE queue, & track toggles

---

## Getting Started

### Prerequisites

- **Node.js** (v16 or higher)
- **npm**
- **HTTPS** (Required by mobile browsers to access camera/microphone on non-localhost devices; use `ngrok`, `localtunnel`, or a reverse proxy when testing across phones).

### Installation

1. **Initialize and install dependencies:**
   ```bash
   npm init -y
   npm install express socket.io