import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import mediasoupClient, { Device } from "mediasoup-client";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

const Room = () => {
  // let socket;
  const RefSocket = useRef();

  const { roomName } = useRouter();

  let params = {
    // mediasoup params
    encodings: [
      {
        rid: "r0",
        maxBitrate: 100000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r1",
        maxBitrate: 300000,
        scalabilityMode: "S1T3",
      },
      {
        rid: "r2",
        maxBitrate: 900000,
        scalabilityMode: "S1T3",
      },
    ],
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#ProducerCodecOptions
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };
  let device;
  let rtpCapabilities;
  let producerTransport;
  let audioProducer;
  let videoProducer;
  // let producer;
  let consumerTransports = [];
  // let consumer;
  let isProducer = false;
  let transportConnected = false;
  const RefLocalVideo = useRef();

  useEffect(() => {
    console.log("run");
    RefSocket.current = io("http://localhost:8000/mediasoup");
    // const socket = io.connect("http://localhost:8000");

    RefSocket.current.on(
      "connection-success",
      async ({ socketId, existinProducer }) => {
        console.log("connection-success", socketId, existinProducer);
        getLocalStream();
      }
    );

    // server informs the client of a new producer just joined
    RefSocket.current.on("new-producer", ({ producerId }) =>
      signalNewConsumerTransport(producerId)
    );

    RefSocket.current.on("producer-closed", ({ remoteProducerId }) => {
      // server notification is received when a producer is closed
      // we need to close the client-side consumer and associated transport
      const producerToClose = consumerTransports.find(
        (transportData) => transportData.producerId === remoteProducerId
      );
      producerToClose.consumerTransport.close();
      producerToClose.consumer.close();

      // remove the consumer transport from the list
      consumerTransports = consumerTransports.filter(
        (transportData) => transportData.producerId !== remoteProducerId
      );

      // remove the video div element
      videoContainer.removeChild(
        document.getElementById(`td-${remoteProducerId}`)
      );
    });

    return;
  }, [roomName]);

  function getLocalStream() {
    navigator.mediaDevices
      .getUserMedia({
        audio: true,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      })
      .then(streamSuccess)
      .catch((error) => {
        console.log(error.message);
      });
  }

  let audioParams;
  let videoParams = { params };
  let consumingTransports = [];

  const streamSuccess = (stream) => {
    RefLocalVideo.current.srcObject = stream;
    // RefLocalVideo.current = stream;
    // console.log("stream", stream);
    // console.log(" RefLocalVideo.current", RefLocalVideo.current);
    // const track = stream.getVideoTracks()[0];
    // params = {
    //   track,
    //   ...params,
    // };

    audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
    videoParams = { track: stream.getVideoTracks()[0], ...videoParams };
    console.log("audioParams", audioParams);
    console.log("videoParams", videoParams);
    joinRoom();
  };

  const joinRoom = () => {
    RefSocket.current.emit("joinRoom", { roomName }, (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);
      // we assign to local variable and will be used when
      // loading the client Device (see createDevice above)
      rtpCapabilities = data.rtpCapabilities;

      // once we have rtpCapabilities from the Router, create Device
      createDevice();
    });
  };

  const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer;
    device === undefined ? getRtpCapabilities() : goCreateTransport();
  };

  const goConsume = () => {
    goConnect(false);
  };

  const goCreateTransport = () => {
    isProducer ? createSendTransport() : signalNewConsumerTransport();
  };

  const createDevice = async () => {
    try {
      console.log("create");
      device = new Device();
      // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-load
      // Loads the device with RTP capabilities of the Router (server side)
      await device.load({
        // see getRtpCapabilities() below
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log("RTP Capabilities", device.rtpCapabilities);
      // once the device loads, create transport
      createSendTransport();
    } catch (error) {
      console.log(error);
      if (error.name === "UnsupportedError")
        console.warn("browser not supported");
    }
  };

  const getRtpCapabilities = () => {
    // make a request to the server for Router RTP Capabilities
    // see server's socket.on('getRtpCapabilities', ...)
    // the server sends back data object which contains rtpCapabilities
    RefSocket.current.emit("createRoom", (data) => {
      console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

      // we assign to local variable and will be used when
      // loading the client Device (see createDevice above)
      rtpCapabilities = data.rtpCapabilities;

      // once we have thr RtpCapabilities from the router, create Device
      createDevice();
    });
  };

  const createSendTransport = () => {
    // see server's socket.on('createWebRtcTransport', sender?, ...)
    RefSocket.current.emit(
      "createWebRtcTransport",
      { consumer: false },
      async ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params);
          return;
        }

        console.log(params);

        // creates a new WebRTC Transport to send media
        // based on the server's producer transport params
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#TransportOptions
        console.log("device", device);
        if (device.loaded == false) {
          console.log("not loaded");
          await sleep(5000);
        }
        producerTransport = device.createSendTransport(params);

        // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
        // this event is raised when a first call to transport.produce() is made
        // see connectSendTransport() below
        producerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              if (transportConnected == true) return;
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-connect', ...)
              await RefSocket.current.emit("transport-connect", {
                dtlsParameters,
              });

              transportConnected = true;

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error) {
              errback(error);
            }
          }
        );

        producerTransport.on(
          "produce",
          async (parameters, callback, errback) => {
            console.log(parameters);

            try {
              // tell the server to create a Producer
              // with the following parameters and produce
              // and expect back a server side producer id
              // see server's socket.on('transport-produce', ...)
              await RefSocket.current.emit(
                "transport-produce",
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                },
                ({ id, producersExist }) => {
                  // Tell the transport that parameters were transmitted and provide it with the
                  // server side producer's id.
                  callback({ id });

                  // if producers exist, then join room
                  if (producersExist) getProducers();
                }
              );
            } catch (error) {
              errback(error);
            }
          }
        );
        connectSendTransport();
      }
    );
  };

  const connectSendTransport = async () => {
    // we now call produce() to instruct the producer transport
    // to send media to the Router
    // https://mediasoup.org/documentation/v3/mediasoup-client/api/#transport-produce
    // this action will trigger the 'connect' and 'produce' events above
    console.log("producerTransport", producerTransport);
    audioProducer = await producerTransport.produce(audioParams);
    videoProducer = await producerTransport.produce(videoParams);

    audioProducer.on("trackended", () => {
      console.log("audio track ended");

      // close audio track
    });

    audioProducer.on("transportclose", () => {
      console.log("audio transport ended");

      // close audio track
    });

    videoProducer.on("trackended", () => {
      console.log("video track ended");

      // close video track
    });

    videoProducer.on("transportclose", () => {
      console.log("video transport ended");

      // close video track
    });
  };

  const signalNewConsumerTransport = async (remoteProducerId) => {
    //check if we are already consuming the remoteProducerId
    if (consumingTransports.includes(remoteProducerId)) return;
    consumingTransports.push(remoteProducerId);

    await RefSocket.current.emit(
      "createWebRtcTransport",
      { consumer: true },
      ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }

        console.log(params);

        let consumerTransport;

        try {
          consumerTransport = device.createRecvTransport(params);
        } catch (error) {
          // exceptions:
          // {InvalidStateError} if not loaded
          // {TypeError} if wrong arguments.
          console.log(error);
          return;
        }

        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await RefSocket.current.emit("transport-recv-connect", {
                dtlsParameters,
                serverConsumerTransportId: params.id,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error) {
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );

        connectRecvTransport(consumerTransport, remoteProducerId, params.id);
      }
    );
  };

  const getProducers = () => {
    RefSocket.current.emit("getProducers", (producerIds) => {
      console.log(producerIds);
      // for each of the producer create a consumer
      // producerIds.forEach(id => signalNewConsumerTransport(id))
      producerIds.forEach(signalNewConsumerTransport);
    });
  };

  const connectRecvTransport = async (
    consumerTransport,
    remoteProducerId,
    serverConsumerTransportId
  ) => {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await RefSocket.current.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId,
        serverConsumerTransportId,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume", params);
          return;
        }

        console.log(params);
        // then consume with the local consumer transport
        // which creates a consumer
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        // append the consumer to the consumerTransports array
        consumerTransports = [
          ...consumerTransports,
          {
            consumerTransport,
            serverConsumerTransportId: params.id,
            producerId: remoteProducerId,
            consumer,
          },
        ];

        // create a new div element for the new consumer media
        const newElem = document.createElement("div");
        newElem.setAttribute("id", `td-${remoteProducerId}`);

        if (params.kind == "audio") {
          //append to the audio container
          newElem.innerHTML =
            '<audio id="' + remoteProducerId + '" autoplay></audio>';
        } else {
          //append to the video container
          newElem.setAttribute("class", "remoteVideo");
          newElem.innerHTML =
            '<video id="' +
            remoteProducerId +
            '" autoplay class="video" ></video>';
        }

        videoContainer.appendChild(newElem);

        // destructure and retrieve the video track from the producer
        const { track } = consumer;

        document.getElementById(remoteProducerId).srcObject = new MediaStream([
          track,
        ]);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        RefSocket.current.emit("consumer-resume", {
          serverConsumerId: params.serverConsumerId,
        });
      }
    );
  };

  // socket.on("producer-closed", ({ remoteProducerId }) => {
  //   // server notification is received when a producer is closed
  //   // we need to close the client-side consumer and associated transport
  //   const producerToClose = consumerTransports.find(
  //     (transportData) => transportData.producerId === remoteProducerId
  //   );
  //   producerToClose.consumerTransport.close();
  //   producerToClose.consumer.close();

  //   // remove the consumer transport from the list
  //   consumerTransports = consumerTransports.filter(
  //     (transportData) => transportData.producerId !== remoteProducerId
  //   );

  //   // remove the video div element
  //   videoContainer.removeChild(
  //     document.getElementById(`td-${remoteProducerId}`)
  //   );
  // });

  // // server informs the client of a new producer just joined
  // socket.on("new-producer", ({ producerId }) =>
  //   signalNewConsumerTransport(producerId)
  // );

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  return (
    <>
      <div id="video">
        <table className="mainTable">
          <tbody>
            <tr>
              <td className="localColumn">
                <video
                  id="localVideo"
                  autoPlay
                  className="video"
                  muted
                  ref={RefLocalVideo}
                ></video>
              </td>
              <td className="remoteColumn">
                <div id="videoContainer"></div>
              </td>
            </tr>
          </tbody>
        </table>
        <table>
          <tbody>
            <tr>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>
      <style>
        {`
        tr {
          vertical-align: top;
      }

      .video {
          width: 360px;
          background-color: black;
          margin: 2px 0;
          border: 1px solid red;
      }

      button {
          margin: 2;
      }

      #sharedBtns {
          padding: 5;
          background-color: papayawhip;
          display: flex;
          justify-content: center;
      }
      `}
      </style>
    </>
  );
};

export default Room;
