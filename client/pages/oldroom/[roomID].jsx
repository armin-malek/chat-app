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
  /*
  useEffect(()=>{
    router.
  },[])
  useEffect(() => {
    if (roomID) router.push(`room/${roomID}`);
  }, [roomID]);
*/
  useEffect(() => {
    if (!roomID) return;
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: true })
      .then((stream) => {
        userVideo.current.srcObject = stream;
        userStream.current = stream;

        socketRef.current = io.connect("http://localhost:8000");

        const uniqueID = getUniqueID();
        // console.log("join room", roomID);
        socketRef.current.emit("join room", { roomID, uniqueID });

        socketRef.current.on("other user", (userID) => {
          console.log("other", userID);
          callUser(userID.sid);
          otherUser.current = userID.sid;
        });

        socketRef.current.on("user joined", (userID) => {
          console.log("other join", userID);

          otherUser.current = userID.sid;
        });

        socketRef.current.on("offer", handleRecieveCall);

        socketRef.current.on("answer", handleAnswer);

        socketRef.current.on("ice-candidate", handleNewICECandidateMsg);
      });
  }, [roomID]);

  function callUser(userID) {
    console.log("callUser", userID);

    peerRef.current = createPeer(userID);
    userStream.current
      .getTracks()
      .forEach((track) => peerRef.current.addTrack(track, userStream.current));
  }

  function createPeer(userID) {
    console.log("createPeer", userID);
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.stunprotocol.org",
          // urls: "stun:localhost:3478",
          // urls: "stun:stun.frozenmountain.com:3478",
        },
        // {
        //   urls: "turn:numb.viagenie.ca",
        //   credential: "muazkh",
        //   username: "webrtc@live.com",
        // },
      ],
    });

    peer.onicecandidate = handleICECandidateEvent;
    peer.ontrack = handleTrackEvent;
    peer.onnegotiationneeded = () => handleNegotiationNeededEvent(userID);

    return peer;
  }

  function handleNegotiationNeededEvent(userID) {
    console.log("handleNegotiationNeededEvent", userID);
    peerRef.current
      .createOffer()
      .then((offer) => {
        return peerRef.current.setLocalDescription(offer);
      })
      .then(() => {
        const payload = {
          target: userID,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("offer", payload);
      })
      .catch((e) => console.log(e));
  }

  function handleRecieveCall(incoming) {
    console.log("handleRecieveCall", incoming);
    peerRef.current = createPeer();
    const desc = new RTCSessionDescription(incoming.sdp);
    peerRef.current
      .setRemoteDescription(desc)
      .then(() => {
        userStream.current
          .getTracks()
          .forEach((track) =>
            peerRef.current.addTrack(track, userStream.current)
          );
      })
      .then(() => {
        return peerRef.current.createAnswer();
      })
      .then((answer) => {
        return peerRef.current.setLocalDescription(answer);
      })
      .then(() => {
        const payload = {
          target: incoming.caller,
          caller: socketRef.current.id,
          sdp: peerRef.current.localDescription,
        };
        socketRef.current.emit("answer", payload);
      });
  }

  function handleAnswer(message) {
    console.log("handleAnswer", message);
    const desc = new RTCSessionDescription(message.sdp);
    peerRef.current.setRemoteDescription(desc).catch((e) => console.log(e));
  }

  function handleICECandidateEvent(e) {
    console.log("handleICECandidateEvent", handleICECandidateEvent);
    if (e.candidate) {
      const payload = {
        target: otherUser.current,
        candidate: e.candidate,
      };
      socketRef.current.emit("ice-candidate", payload);
    }
  }

  function handleNewICECandidateMsg(incoming) {
    console.log("handleNewICECandidateMsg", incoming);
    const candidate = new RTCIceCandidate(incoming);

    peerRef.current.addIceCandidate(candidate).catch((e) => console.log(e));
  }

  function handleTrackEvent(e) {
    console.log("handleTrackEvent", e);
    console.log("streams", e.streams);
    partnerVideo.current.srcObject = e.streams[0];
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
