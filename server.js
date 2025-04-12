const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

const rooms = {};

function generateRoomId() {
  return Math.random().toString(36).substr(2, 5).toUpperCase();
}

app.post("/create-room", (req, res) => {
  const roomId = generateRoomId();
  rooms[roomId] = { players: [], host: null };
  res.json({ roomId });
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("joinRoom", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      socket.emit("error", "Room not found");
      return;
    }

    const player = { id: socket.id, name, choice: null, active: true };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    io.to(roomId).emit("playerList", rooms[roomId].players);
  });

socket.on("restartGame", ({ roomId }) => {
  const room = rooms[roomId];
  if (!room) return;

  room.players.forEach(p => {
    p.active = true;
    p.choice = null;
  });

  io.to(roomId).emit("playerList", room.players);
  io.to(roomId).emit("gameRestarted");
});

  socket.on("vote", ({ roomId, choice }) => {
    const room = rooms[roomId];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player && player.active) {
      player.choice = choice;
      io.to(roomId).emit("playerList", room.players);
    }
  });

  socket.on("startRound", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    // Clear previous votes
    room.players.forEach(p => {
      p.choice = null;
    });

    io.to(roomId).emit("roundStarted");

    // 10 second countdown
    setTimeout(() => {
      const redTeam = room.players.filter(p => p.choice === "red" && p.active);
      const blueTeam = room.players.filter(p => p.choice === "blue" && p.active);

      let losers = [];

      if (redTeam.length > blueTeam.length) {
        losers = redTeam;
      } else if (blueTeam.length > redTeam.length) {
        losers = blueTeam;
      }

      losers.forEach(p => {
        const player = room.players.find(x => x.id === p.id);
        if (player) player.active = false;
      });

      room.players.forEach(p => {
        p.choice = null;
      });

      io.to(roomId).emit("playerList", room.players);
      io.to(roomId).emit("revealVotes");
    }, 10000); // 10 seconds
  });

  socket.on("declareWinner", ({ roomId }) => {
    const room = rooms[roomId];
    if (!room) return;

    const winners = room.players.filter(p => p.active);

    if (winners.length >= 1) {
      winners.forEach(p => {
        io.to(p.id).emit("win");
      });

      io.to(roomId).emit("gameOver");
    }
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);
      io.to(roomId).emit("playerList", rooms[roomId].players);
    }
  });
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
