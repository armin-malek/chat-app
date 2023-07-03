import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

const Room = () => {
  const userVideo = useRef();
  const partnerVideo = useRef();
  const peerRef = useRef();
  const socketRef = useRef();
  const otherUser = useRef();
  const userStream = useRef();

  //const [roomID, setRoomID] = useState();
  const router = useRouter();
  const { roomID } = router.query;

  useEffect(() => {
    if (!roomID) return;
    socketRef.current = io.connect("http://localhost:8000");
    init();
  }, [roomID]);

  async function init() {
    const uniqueID = getUniqueID();
    socketRef.current.emit("join room", { roomID, uniqueID });

    socketRef.current.on("start peer", async (payload) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      userVideo.current.srcObject = stream;
      createPeer();
      stream
        .getTracks()
        .forEach((track) => peerRef.current.addTrack(track, stream));
    });

    socketRef.current.on("connectPeer", async (payload) => {
      // const { data } = await axios.post("/broadcast", payload);
      const desc = new RTCSessionDescription(payload.sdp);
      peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
    });
  }

  function createPeer() {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
        },
        // {
        //   urls: "turn:numb.viagenie.ca",
        //   credential: "muazkh",
        //   username: "webrtc@live.com",
        // },
      ],
    });
    peerRef.current = peer;
    peerRef.current.onnegotiationneeded = () => handleNegotiationNeededEvent();

    // return peer;
  }

  async function handleNegotiationNeededEvent() {
    const offer = await peerRef.current.createOffer();
    await peerRef.current.setLocalDescription(offer);
    const payload = {
      sdp: peerRef.current.localDescription,
    };
    socketRef.current.emit("beginPeer", payload);
  }

  function getUniqueID() {
    let pass = localStorage.getItem("uniqueID");
    if (!pass) {
      pass = uuid();
      localStorage.setItem("uniqueID", pass);
    }
    return pass;
  }

  return (
    <div>
      <video
        autoPlay
        ref={userVideo}
        muted={true}
        style={{ border: "5px solid red" }}
      />
      <video autoPlay ref={partnerVideo} style={{ border: "5px solid blue" }} />
    </div>
  );
};

export default Room;
