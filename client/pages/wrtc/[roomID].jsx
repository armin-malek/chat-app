import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";
import axios from "axios";

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
    // socketRef.current = io.connect("http://localhost:8000");
    init();
  }, [roomID]);

  async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });
    userVideo.current.srcObject = stream;
    const peer = createPeer();
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));
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
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(peer);

    return peer;
  }

  async function handleNegotiationNeededEvent(peer) {
    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const payload = {
      sdp: peer.localDescription,
    };

    const { data } = await axios.post(
      "http://localhost:4000/broadcast",
      payload
    );
    const desc = new RTCSessionDescription(data.sdp);
    peer.setRemoteDescription(desc).catch((e) => console.log(e));
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
