# Raymond & Emma Private Poker

MVP 8-handed No-Limit Texas Hold'em:
- Raymond + Emma on separate phones
- Six simple AI opponents
- $2/$5 blinds, $500 stacks
- Server-side private hole cards
- Socket.IO realtime sync
- Automatic showdown and side-pot distribution

## Local
```bash
npm install
npm start
```
Open http://localhost:10000 on two devices/browser sessions. Use the same room code; one selects Raymond and the other Emma.

## Render
Create a Render Web Service from this repo.
Build command: `npm install`
Start command: `npm start`
The app listens on `process.env.PORT`.

This is a hobby/play-money MVP, not a real-money poker service.
