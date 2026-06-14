import crypto from "node:crypto";

function encodeTextFrame(message) {
  const payload = Buffer.from(String(message), "utf8");
  const length = payload.length;
  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }
  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }
  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

export function createWebSocketHub() {
  const clients = new Set();

  function send(socket, payload) {
    if (!socket || socket.destroyed || !socket.writable) return;
    try {
      socket.write(encodeTextFrame(JSON.stringify(payload)));
    } catch {
      clients.delete(socket);
    }
  }

  function broadcast(payload) {
    const message = JSON.stringify(payload);
    for (const socket of clients) send(socket, JSON.parse(message));
  }

  function remove(socket) {
    clients.delete(socket);
  }

  function handleUpgrade(req, socket, head, { verify = () => true, onOpen = () => {} } = {}) {
    if (!verify(req)) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return false;
    }

    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return false;
    }

    const accept = crypto.createHash("sha1").update(`${key}258EAFA5-E914-47CA-9545-85A08541EA57`).digest("base64");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: " +
        accept +
        "\r\n\r\n",
    );
    clients.add(socket);
    onOpen(socket);

    socket.on("data", (buffer) => {
      if (buffer.length < 2) return;
      const opcode = buffer[0] & 0x0f;
      if (opcode === 0x8) {
        clients.delete(socket);
        socket.end();
      }
      if (opcode === 0x9) {
        send(socket, { type: "pong", at: new Date().toISOString() });
      }
    });

    socket.on("close", () => clients.delete(socket));
    socket.on("error", () => clients.delete(socket));
    return true;
  }

  return { clients, send, broadcast, remove, handleUpgrade, encodeTextFrame };
}
