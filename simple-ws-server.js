import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;
  if (body.length < 126) {
    header = Buffer.allocUnsafe(2);
    header[1] = body.length;
  } else if (body.length <= 0xffff) {
    header = Buffer.allocUnsafe(4);
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

export class SimpleWebSocketConnection extends EventEmitter {
  constructor(socket, head = Buffer.alloc(0)) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.closed = false;
    this.fragmentOpcode = null;
    this.fragmentParts = [];

    socket.on('data', (chunk) => this.#consume(chunk));
    socket.on('close', () => this.#finish());
    socket.on('end', () => this.#finish());
    socket.on('error', (error) => this.emit('error', error));
    if (head.length) this.#consume(head);
  }

  sendText(text) {
    if (!this.closed) this.socket.write(encodeFrame(0x1, Buffer.from(String(text))));
  }

  sendJson(value) {
    this.sendText(JSON.stringify(value));
  }

  close(code = 1000, reason = '') {
    if (this.closed) return;
    const reasonBuffer = Buffer.from(String(reason));
    const payload = Buffer.allocUnsafe(2 + Math.min(reasonBuffer.length, 123));
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2, 0, payload.length - 2);
    this.socket.write(encodeFrame(0x8, payload));
    this.socket.end();
    this.#finish();
  }

  #finish() {
    if (this.closed) return;
    this.closed = true;
    this.emit('close');
  }

  #consume(chunk) {
    if (this.closed) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = Boolean(first & 0x80);
      const opcode = first & 0x0f;
      const masked = Boolean(second & 0x80);
      let payloadLength = second & 0x7f;
      let offset = 2;

      if (payloadLength === 126) {
        if (this.buffer.length < 4) return;
        payloadLength = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (this.buffer.length < 10) return;
        const length64 = this.buffer.readBigUInt64BE(2);
        if (length64 > BigInt(MAX_MESSAGE_BYTES)) {
          this.close(1009, 'Message too large');
          return;
        }
        payloadLength = Number(length64);
        offset = 10;
      }

      if (payloadLength > MAX_MESSAGE_BYTES) {
        this.close(1009, 'Message too large');
        return;
      }

      const maskLength = masked ? 4 : 0;
      if (this.buffer.length < offset + maskLength + payloadLength) return;

      let mask;
      if (masked) {
        mask = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLength));
      this.buffer = this.buffer.subarray(offset + payloadLength);

      if (masked) {
        for (let index = 0; index < payload.length; index += 1) {
          payload[index] ^= mask[index % 4];
        }
      }

      if (opcode === 0x8) {
        if (!this.closed) this.socket.write(encodeFrame(0x8, payload));
        this.socket.end();
        this.#finish();
        return;
      }
      if (opcode === 0x9) {
        this.socket.write(encodeFrame(0xA, payload));
        continue;
      }
      if (opcode === 0xA) continue;

      if (opcode === 0x0) {
        if (this.fragmentOpcode === null) {
          this.close(1002, 'Unexpected continuation');
          return;
        }
        this.fragmentParts.push(payload);
        if (fin) {
          const complete = Buffer.concat(this.fragmentParts);
          const completeOpcode = this.fragmentOpcode;
          this.fragmentOpcode = null;
          this.fragmentParts = [];
          this.#emitMessage(completeOpcode, complete);
        }
        continue;
      }

      if (opcode !== 0x1 && opcode !== 0x2) {
        this.close(1002, 'Unsupported opcode');
        return;
      }

      if (!fin) {
        this.fragmentOpcode = opcode;
        this.fragmentParts = [payload];
        continue;
      }

      this.#emitMessage(opcode, payload);
    }
  }

  #emitMessage(opcode, payload) {
    if (opcode === 0x1) this.emit('message', payload.toString('utf8'));
    else this.emit('binary', payload);
  }
}

export function acceptWebSocket(req, socket, head = Buffer.alloc(0)) {
  const key = req.headers['sec-websocket-key'];
  const version = req.headers['sec-websocket-version'];
  if (!key || version !== '13') {
    socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return null;
  }

  const accept = createHash('sha1').update(`${key}${WS_GUID}`).digest('base64');
  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '\r\n'
  ].join('\r\n'));

  return new SimpleWebSocketConnection(socket, head);
}
