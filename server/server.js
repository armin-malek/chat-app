const express = require("express");
const http = require("http");
const app = express();
const server = http.createServer(app);
const cors = require("cors");
const socket = require("socket.io");
// const io = socket(server);

const io = socket(server, {
  cors: {
    origin: ["http://localhost:3000", "http://192.168.1.106:3000"],
    methods: ["GET", "POST"],
  },
});

//app.use(cors({ origin: ["http://localhost:3000"], optionsSuccessStatus: 200 }));

const PORT = process.env.PORT || 8000;

const rooms = {};

io.on("connection", (socket) => {
  console.log("connection");
  socket.on("join room", (roomID) => {
    if (rooms[roomID]) {
      rooms[roomID].push(socket.id);
    } else {
      rooms[roomID] = [socket.id];
    }
    const otherUser = rooms[roomID].find((id) => id !== socket.id);
    if (otherUser) {
      socket.emit("other user", otherUser);
      socket.to(otherUser).emit("user joined", socket.id);
    }
  });

  socket.on("offer", (payload) => {
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    io.to(incoming.target).emit("ice-candidate", incoming.candidate);
  });
});

server.listen(PORT, () => console.log(`server is running on port ${PORT}`));
