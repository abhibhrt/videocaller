// src/utils/constants.js
module.exports = {
  EVENTS: {
    // Room & Mesh WebRTC Events
    JOIN: 'join',
    LEAVE: 'leave',
    SIGNAL: 'signal',
    EXISTING_PEERS: 'existing-peers',
    PEER_JOINED: 'peer-joined',
    PEER_LEFT: 'peer-left',
    PARTICIPANTS: 'participants',
    ROOM_FULL: 'room-full',
    ROOMS_LIST: 'rooms-list',
    GET_ROOMS: 'get-rooms',
    CHAT_MESSAGE: 'chat-message',

    // Direct 1-to-1 Call & Ringing Events
    CALL_USER: 'call-user',
    INCOMING_CALL: 'incoming-call',
    CALL_ACCEPTED: 'call-accepted',
    CALL_REJECTED: 'call-rejected',
    CALL_CANCELED: 'call-canceled',
    CALL_BUSY: 'call-busy',
    USER_OFFLINE: 'user-offline',

    // Direct Chat & Presence
    DIRECT_MESSAGE: 'direct-message',
    ONLINE_USERS: 'online-users'
  },
  MAX_ROOM_SIZE: 4
};