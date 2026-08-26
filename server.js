const express = require("express");
const http = require("http");
const path = require("path");
const crypto = require("crypto");
const { WebSocketServer } = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({
  server,
  path: "/ws"
});

const users = new Map();
const peerOf = new Map();

function makeId() {
  for (;;) {
    const id = String(crypto.randomInt(1000, 10000));
    if (!users.has(id)) return id;
  }
}

function send(ws, data) {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

function cleanup(ws) {
  const id = ws.userId;

  if (id && users.get(id) === ws) {
    users.delete(id);
  }

  const peer = peerOf.get(ws);

  if (peer) {
    peerOf.delete(peer);
    send(peer, {
      type: "peer_left"
    });
  }

  peerOf.delete(ws);
}

wss.on("connection", (ws) => {
  const id = makeId();

  ws.userId = id;
  users.set(id, ws);

  send(ws, {
    type: "assigned_id",
    id
  });

  ws.on("message", (raw) => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (msg.type === "call") {
      const target = String(msg.target || "")
        .replace(/\D/g, "")
        .slice(0, 4);

      const peer = users.get(target);

      if (!peer || peer === ws) {
        send(ws, {
          type: "error",
          message: "اليوزر غير موجود أو أنت تحاول الاتصال بنفسك."
        });
        return;
      }

      const oldPeer = peerOf.get(ws);

      if (oldPeer) {
        peerOf.delete(oldPeer);
        peerOf.delete(ws);

        send(oldPeer, {
          type: "peer_left"
        });
      }

      const oldTargetPeer = peerOf.get(peer);

      if (oldTargetPeer) {
        peerOf.delete(oldTargetPeer);
        peerOf.delete(peer);

        send(oldTargetPeer, {
          type: "peer_left"
        });
      }

      peerOf.set(ws, peer);
      peerOf.set(peer, ws);

      send(peer, {
        type: "incoming_call",
        from: id
      });

      send(ws, {
        type: "calling",
        target
      });

      return;
    }

    if (msg.type === "accept") {
      const peer = peerOf.get(ws);

      if (peer) {
        send(peer, {
          type: "call_accepted"
        });
      }

      return;
    }

    if (msg.type === "signal") {
      const peer = peerOf.get(ws);

      if (peer && msg.data) {
        send(peer, {
          type: "signal",
          data: msg.data
        });
      }

      return;
    }

    if (msg.type === "hangup") {
      const peer = peerOf.get(ws);

      if (peer) {
        peerOf.delete(peer);
        peerOf.delete(ws);

        send(peer, {
          type: "hangup"
        });
      }
    }
  });

  ws.on("close", () => cleanup(ws));
  ws.on("error", () => cleanup(ws));
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (_, res) => {
  res.json({
    ok: true
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on ${PORT}`);
});