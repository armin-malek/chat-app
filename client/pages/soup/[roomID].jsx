import React, { useRef, useEffect, useState } from "react";
import io from "socket.io-client";
import mediasoupClient, { Device } from "mediasoup-client";
import { useRouter } from "next/router";
import { v4 as uuid } from "uuid";

const Room = () => {
  // let socket;
  const RefSocket = useRef();

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
  let producer;
  let consumerTransport;
  let consumer;
  let isProducer = false;

  const RefLocalVideo = useRef();

  useEffect(() => {
    console.log("run");
    RefSocket.current = io("http://localhost:8000/mediasoup");
    // const socket = io.connect("http://localhost:8000");

    RefSocket.current.on(
      "connection-success",
      async ({ socketId, existinProducer }) => {
        console.log("connection-success", socketId, existinProducer);
      }
    );
    return;
  }, []);

  function getLocalStream() {
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
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

  const streamSuccess = (stream) => {
    RefLocalVideo.current.srcObject = stream;
    // RefLocalVideo.current = stream;
    // console.log("stream", stream);
    // console.log(" RefLocalVideo.current", RefLocalVideo.current);
    const track = stream.getVideoTracks()[0];
    params = {
      track,
      ...params,
    };
    goConnect(true);
  };

  const goConnect = (producerOrConsumer) => {
    isProducer = producerOrConsumer;
    device === undefined ? getRtpCapabilities() : goCreateTransport();
  };

  const goConsume = () => {
    goConnect(false);
  };

  const goCreateTransport = () => {
    isProducer ? createSendTransport() : createRecvTransport();
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
      goCreateTransport();
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
    // this is a call from Producer, so sender = true
    RefSocket.current.emit(
      "createWebRtcTransport",
      { sender: true },
      ({ params }) => {
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
        producerTransport = device.createSendTransport(params);

        // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
        // this event is raised when a first call to transport.produce() is made
        // see connectSendTransport() below
        producerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-connect', ...)
              await RefSocket.current.emit("transport-connect", {
                dtlsParameters,
              });

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
                ({ id }) => {
                  // Tell the transport that parameters were transmitted and provide it with the
                  // server side producer's id.
                  callback({ id });
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
    producer = await producerTransport.produce(params);

    producer.on("trackended", () => {
      console.log("track ended");

      // close video track
    });

    producer.on("transportclose", () => {
      console.log("transport ended");

      // close video track
    });
  };

  const createRecvTransport = async () => {
    // see server's socket.on('consume', sender?, ...)
    // this is a call from Consumer, so sender = false
    await RefSocket.current.emit(
      "createWebRtcTransport",
      { sender: false },
      ({ params }) => {
        // The server sends back params needed
        // to create Send Transport on the client side
        if (params.error) {
          console.log(params.error);
          return;
        }

        console.log(params);

        // creates a new WebRTC Transport to receive media
        // based on server's consumer transport params
        // https://mediasoup.org/documentation/v3/mediasoup-client/api/#device-createRecvTransport
        consumerTransport = device.createRecvTransport(params);

        // https://mediasoup.org/documentation/v3/communication-between-client-and-server/#producing-media
        // this event is raised when a first call to transport.produce() is made
        // see connectRecvTransport() below
        consumerTransport.on(
          "connect",
          async ({ dtlsParameters }, callback, errback) => {
            try {
              // Signal local DTLS parameters to the server side transport
              // see server's socket.on('transport-recv-connect', ...)
              await RefSocket.current.emit("transport-recv-connect", {
                dtlsParameters,
              });

              // Tell the transport that parameters were transmitted.
              callback();
            } catch (error) {
              // Tell the transport that something was wrong
              errback(error);
            }
          }
        );

        connectRecvTransport();
      }
    );
  };

  const connectRecvTransport = async () => {
    // for consumer, we need to tell the server first
    // to create a consumer based on the rtpCapabilities and consume
    // if the router can consume, it will send back a set of params as below
    await RefSocket.current.emit(
      "consume",
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }) => {
        if (params.error) {
          console.log("Cannot Consume", params);
          return;
        }

        console.log(params);
        // then consume with the local consumer transport
        // which creates a consumer
        consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters,
        });

        // destructure and retrieve the video track from the producer
        const { track } = consumer;

        remoteVideo.srcObject = new MediaStream([track]);

        // the server consumer started with media paused
        // so we need to inform the server to resume
        RefSocket.current.emit("consumer-resume");
      }
    );
  };

  return (
    <>
      <div id="video">
        <table>
          <thead>
            <tr>
              <th>Local Video</th>
              <th>Remote Video</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div id="sharedBtns">
                  <video
                    id="localVideo"
                    autoPlay
                    className="video"
                    ref={RefLocalVideo}
                  ></video>
                </div>
              </td>
              <td>
                <div id="sharedBtns">
                  <video id="remoteVideo" autoPlay className="video"></video>
                </div>
              </td>
            </tr>
            <tr>
              <td>
                <div id="sharedBtns">
                  <button id="btnLocalVideo" onClick={() => getLocalStream()}>
                    Publish
                  </button>
                </div>
              </td>
              <td>
                <div id="sharedBtns">
                  <button id="btnRecvSendTransport" onClick={() => goConsume()}>
                    Consume
                  </button>
                </div>
              </td>
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
