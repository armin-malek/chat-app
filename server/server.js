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
  socket.on("join room", (payload) => {
    console.log("payload", payload);

    if (rooms[payload.roomID]) {
      console.log("push");
      let lastSession = rooms[payload.roomID].findIndex(
        (item) => item.uniqueID == payload.uniqueID
      );
      console.log("lastSession", lastSession);
      if (lastSession >= 0) {
        rooms[payload.roomID][lastSession] = {
          uniqueID: payload.uniqueID,
          sid: socket.id,
        };
        // rooms[payload.roomID] = [...new Set(rooms[payload.roomID].map(item => item.uniqueID))]
      } else {
        rooms[payload.roomID].push({
          uniqueID: payload.uniqueID,
          sid: socket.id,
        });
      }
    } else {
      console.log("not push");
      rooms[payload.roomID] = [{ uniqueID: payload.uniqueID, sid: socket.id }];
    }
    console.log("rooms", rooms);
    const otherUser = rooms[payload.roomID].find(
      (item) => item.uniqueID !== payload.uniqueID
    );
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
