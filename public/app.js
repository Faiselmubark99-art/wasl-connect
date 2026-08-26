const socket = io();

let myId = null;
let currentTarget = null;
let currentName = null;

let localStream = null;
let peer = null;

let muted = false;

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};

const loginScreen =
  document.getElementById("loginScreen");

const appScreen =
  document.getElementById("appScreen");

const username =
  document.getElementById("username");

const joinButton =
  document.getElementById("joinButton");

const error =
  document.getElementById("error");

const users =
  document.getElementById("users");

const myName =
  document.getElementById("myName");

const incomingCall =
  document.getElementById("incomingCall");

const callerName =
  document.getElementById("callerName");

const activeCall =
  document.getElementById("activeCall");

const activeName =
  document.getElementById("activeName");

const callStatus =
  document.getElementById("callStatus");

const remoteAudio =
  document.getElementById("remoteAudio");

const acceptButton =
  document.getElementById("acceptButton");

const rejectButton =
  document.getElementById("rejectButton");

const muteButton =
  document.getElementById("muteButton");

const endButton =
  document.getElementById("endButton");


joinButton.onclick = join;

username.onkeydown = (event) => {

  if (event.key === "Enter") {
    join();
  }

};


async function join() {

  const name =
    username.value.trim();

  if (!name) {

    error.textContent =
      "اكتب اسمك أولاً";

    return;
  }

  joinButton.disabled = true;

  try {

    localStream =
      await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      });

    socket.emit(
      "register",
      name
    );

  } catch (err) {

    console.error(err);

    error.textContent =
      "اسمح للموقع باستخدام الميكروفون.";

    joinButton.disabled = false;
  }

}


socket.on("registered", (data) => {

  myId = data.id;

  myName.textContent =
    `أنت: ${data.username}`;

  loginScreen.classList.add("hidden");

  appScreen.classList.remove("hidden");

});


socket.on("users", (list) => {

  users.innerHTML = "";

  const others =
    list.filter(
      user => user.id !== myId
    );

  if (others.length === 0) {

    users.innerHTML =
      "<p>ما فيه مستخدمين متصلين حاليًا.</p>";

    return;
  }

  others.forEach(user => {

    const row =
      document.createElement("div");

    row.className = "user";

    const name =
      document.createElement("span");

    name.className = "userName";

    name.textContent =
      `🟢 ${user.username}`;

    const button =
      document.createElement("button");

    button.textContent =
      "📞 اتصال";

    button.onclick = () => {

      startCall(
        user.id,
        user.username
      );

    };

    row.appendChild(name);
    row.appendChild(button);

    users.appendChild(row);

  });

});


async function startCall(id, name) {

  if (currentTarget) return;

  currentTarget = id;
  currentName = name;

  showActiveCall(name);

  createPeer(id);

  socket.emit(
    "call-user",
    {
      target: id
    }
  );

}


socket.on("incoming-call", (data) => {

  if (currentTarget) {

    socket.emit(
      "call-rejected",
      {
        target: data.from
      }
    );

    return;
  }

  currentTarget =
    data.from;

  currentName =
    data.username;

  callerName.textContent =
    data.username;

  incomingCall.classList.remove(
    "hidden"
  );

});


acceptButton.onclick =
  async () => {

    incomingCall.classList.add(
      "hidden"
    );

    showActiveCall(
      currentName
    );

    createPeer(
      currentTarget
    );

    socket.emit(
      "call-accepted",
      {
        target: currentTarget
      }
    );

  };


rejectButton.onclick =
  () => {

    socket.emit(
      "call-rejected",
      {
        target: currentTarget
      }
    );

    resetCall();

  };


socket.on("call-accepted", async (data) => {

  if (!peer) {

    createPeer(
      data.from
    );

  }

  const offer =
    await peer.createOffer();

  await peer.setLocalDescription(
    offer
  );

  socket.emit(
    "webrtc-offer",
    {
      target: data.from,
      offer
    }
  );

  callStatus.textContent =
    "جاري إنشاء الاتصال...";

});


socket.on("webrtc-offer", async (data) => {

  if (!peer) {

    createPeer(
      data.from
    );

  }

  await peer.setRemoteDescription(
    new RTCSessionDescription(
      data.offer
    )
  );

  const answer =
    await peer.createAnswer();

  await peer.setLocalDescription(
    answer
  );

  socket.emit(
    "webrtc-answer",
    {
      target: data.from,
      answer
    }
  );

});


socket.on("webrtc-answer", async (data) => {

  if (!peer) return;

  await peer.setRemoteDescription(
    new RTCSessionDescription(
      data.answer
    )
  );

});


socket.on("ice-candidate", async (data) => {

  if (!peer) return;

  try {

    await peer.addIceCandidate(
      new RTCIceCandidate(
        data.candidate
      )
    );

  } catch (error) {

    console.error(error);

  }

});


function createPeer(target) {

  peer =
    new RTCPeerConnection(
      rtcConfig
    );

  if (localStream) {

    localStream
      .getTracks()
      .forEach(track => {

        peer.addTrack(
          track,
          localStream
        );

      });

  }

  peer.onicecandidate =
    (event) => {

      if (!event.candidate) return;

      socket.emit(
        "ice-candidate",
        {
          target,
          candidate:
            event.candidate
        }
      );

    };

  peer.ontrack =
    (event) => {

      remoteAudio.srcObject =
        event.streams[0];

      remoteAudio
        .play()
        .catch(() => {});

    };

  peer.onconnectionstatechange =
    () => {

      if (
        peer.connectionState ===
        "connected"
      ) {

        callStatus.textContent =
          "🟢 المكالمة متصلة";

      }

      if (
        peer.connectionState ===
          "failed" ||
        peer.connectionState ===
          "disconnected"
      ) {

        callStatus.textContent =
          "انقطع الاتصال";

      }

    };

}


function showActiveCall(name) {

  activeName.textContent =
    `📞 ${name}`;

  activeCall.classList.remove(
    "hidden"
  );

}


muteButton.onclick =
  () => {

    if (!localStream) return;

    muted = !muted;

    localStream
      .getAudioTracks()
      .forEach(track => {

        track.enabled =
          !muted;

      });

    muteButton.textContent =
      muted
        ? "🔇 تشغيل الميكروفون"
        : "🎙️ كتم";

  };


endButton.onclick =
  endCall;


socket.on("call-rejected", () => {

  callStatus.textContent =
    "تم رفض المكالمة";

  setTimeout(
    resetCall,
    1000
  );

});


socket.on("call-ended", () => {

  resetCall();

});


function endCall() {

  if (currentTarget) {

    socket.emit(
      "end-call",
      {
        target:
          currentTarget
      }
    );

  }

  resetCall();

}


function resetCall() {

  if (peer) {

    peer.close();

    peer = null;

  }

  currentTarget = null;
  currentName = null;

  incomingCall.classList.add(
    "hidden"
  );

  activeCall.classList.add(
    "hidden"
  );

  muted = false;

  muteButton.textContent =
    "🎙️ كتم";

}