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
  console.log("connection", socket.id);
  socket.on("join room", (roomID) => {
    console.log("roomID", roomID);

    if (rooms[roomID]) {
      console.log("push");
      rooms[roomID].push(socket.id);
    } else {
      console.log("not push");
      rooms[roomID] = [socket.id];
    }
    console.log("rooms", rooms);
    const otherUser = rooms[roomID].find((id) => id !== socket.id);
    console.log("otherUser", otherUser);
    if (otherUser) {
      socket.emit("other user", otherUser);
      socket.to(otherUser).emit("user joined", socket.id);
    }
  });

  socket.on("disconnect", (payload) => {
    console.log("disc", payload);
  });

  socket.on("offer", (payload) => {
    // console.log("offer", payload);
    io.to(payload.target).emit("offer", payload);
  });

  socket.on("answer", (payload) => {
    // console.log("answer", payload);
    io.to(payload.target).emit("answer", payload);
  });

  socket.on("ice-candidate", (incoming) => {
    // console.log("ice-candidate", incoming);
    io.to(incoming.target).emit("ice-candidate", incoming.candidate);
  });
});

server.listen(PORT, () => console.log(`server is running on port ${PORT}`));
