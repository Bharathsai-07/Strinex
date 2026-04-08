# Strinex Backend

Node.js + Express + MongoDB backend for Strinex.

## Features
- Clerk JWT auth on protected routes
- Run storage with GPS route coordinates
- Weekly/total leaderboard aggregation
- Daily streak tracking (current + longest)
- Google Gemini run analysis endpoint
- Socket.io realtime chat with MongoDB persistence

## API
- `POST /runs` (protected)
- `GET /runs` (protected)
- `GET /leaderboard?period=total|weekly` (protected)
- `POST /ai-analysis` (protected)
- `GET /chat/messages/:userId` (protected)
- `GET /health` (public)

## Socket.io
Connect with a Clerk JWT via either:
- `auth.token` in socket handshake
- `Authorization: Bearer <token>` header

Events:
- Client -> Server: `chat:send` with `{ receiverId, content }`
- Server -> Client: `chat:message`

## Frontend integration notes
Include Clerk session token in every protected API call:

```js
const token = await window.Clerk.session?.getToken();
await fetch("http://localhost:5000/runs", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify(payload),
});
```
