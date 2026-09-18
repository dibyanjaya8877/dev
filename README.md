# Pairly

A mobile-first couples app with product discovery, account creation, private messaging, and peer-to-peer video calls.

## Setup

1. Copy `.env.example` to `.env.local`.
2. Add a MongoDB Atlas URI, a long random `AUTH_SECRET`, and the initial administrator's email as `ADMIN_EMAIL`.
3. Allow your current IP address in Atlas Network Access.
4. Install and start the app:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Create two accounts in separate browsers to test chat and video calls. Camera and microphone access requires HTTPS in production; localhost is allowed during development.

New accounts start in a pending state. The administrator opens **Admin**, approves the account, and the member then uses **Check approval**. Approved members connect through friend requests; messaging and video calls unlock only after the recipient accepts.

## Commands

```bash
npm run lint
npm run build
npm run dev
npm start
```

## Architecture

- Next.js App Router and API routes
- MongoDB for users and messages
- Signed HTTP-only session cookies
- MongoDB-backed roles, approvals, and friend requests
- Socket.IO for live message delivery and WebRTC signaling
- Browser WebRTC for peer-to-peer video/audio

Products are currently a curated sample catalog; checkout and payment processing are not included.

## Deployment note

This project uses a custom Node server for Socket.IO. Deploy it to a host that supports persistent Node processes and WebSockets. For reliable calls across restrictive networks, add a production TURN service alongside the included STUN server.
