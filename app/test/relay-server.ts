// A local stand-in for the system server's relay and phone sign-in (runners-app-kit docs/relay.md),
// so Split and split-app can be tried before the real server is up.
//
//   pnpm relay                         listens on http://0.0.0.0:8788 (8787 is Monitor's)
//   SPLIT_API_URL=http://localhost:8788 pnpm dev
//
// Any email signs in with a password the system server would take (letters and numbers, 6 to 20);
// the account is the email, so a computer and a phone signed in with the same email see each other.
// Tokens are made up and kept in memory. Answers are wrapped as { code, data } like the system server's.
import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

const PORT = Number(process.env.PORT || 8788);

interface Peer {
  deviceId: string;
  name: string;
  role: "host" | "viewer";
}

interface Client {
  socket: WebSocket;
  account: string;
  peer: Peer | null;
}

/** Access and refresh token → the account (email) it belongs to. */
const tokens = new Map<string, string>();
const clients = new Set<Client>();
/** The last state each host sent, for viewers that join later. */
const lastState = new Map<string, unknown>();

function issue(account: string) {
  const accessToken = `access-${randomUUID()}`;
  const refreshToken = `refresh-${randomUUID()}`;
  tokens.set(accessToken, account);
  tokens.set(refreshToken, account);
  return { accessToken, refreshToken };
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = "";
  for await (const chunk of req) text += chunk;
  try {
    return JSON.parse(text || "{}");
  } catch {
    return {};
  }
}

function reply(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(status < 300 ? { code: status, data: value } : value));
}

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{6,20}$/;

const http = createServer(async (req, res) => {
  const data = await body(req);
  if (req.method === "POST" && (req.url === "/api/mobile/auth/login" || req.url === "/api/mobile/auth/signup")) {
    const email = String(data.email || "");
    if (!email || !PASSWORD_RULE.test(String(data.password || ""))) return reply(res, 400, { message: "bad request" });
    return reply(res, 200, { user: { id: email, email }, tokens: issue(email) });
  }
  if (req.method === "POST" && req.url === "/api/mobile/auth/refresh") {
    const account = tokens.get(String(data.refreshToken || ""));
    return account ? reply(res, 200, issue(account)) : reply(res, 401, { message: "expired" });
  }
  if (req.method === "POST" && req.url === "/api/mobile/auth/logout") return reply(res, 200, {});
  if (req.method === "POST" && req.url === "/api/mobile/devices") return reply(res, 200, {});
  reply(res, 404, { message: "not found" });
});

const relay = new WebSocketServer({ noServer: true });

function sameAccount(client: Client): Client[] {
  return [...clients].filter((other) => other !== client && other.account === client.account && other.peer);
}

function toDevice(account: string, deviceId: unknown): Client | undefined {
  return [...clients].find((c) => c.account === account && c.peer?.deviceId === deviceId);
}

function send(client: Client, message: unknown): void {
  client.socket.send(JSON.stringify(message));
}

http.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname !== "/api/relay") return socket.destroy();
  const token = (req.headers.authorization || "").replace(/^Bearer /, "") || url.searchParams.get("token") || "";
  const account = tokens.get(token);
  relay.handleUpgrade(req, socket, head, (ws) => {
    if (!account || !token.startsWith("access-")) return ws.close(4401, "token");
    const client: Client = { socket: ws, account, peer: null };
    clients.add(client);
    ws.on("message", (raw) => {
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(String(raw));
      } catch {
        return send(client, { type: "error", error: "bad json" });
      }
      if (message.type === "hello") {
        const peer: Peer = { deviceId: String(message.deviceId), name: String(message.name), role: message.role === "host" ? "host" : "viewer" };
        // The same deviceId connecting again replaces the old connection.
        toDevice(account, peer.deviceId)?.socket.close(4409, "replaced");
        client.peer = peer;
        send(client, { type: "peers", peers: sameAccount(client).map((c) => c.peer) });
        for (const other of sameAccount(client)) send(other, { type: "peer-joined", peer });
        if (peer.role === "viewer") {
          for (const other of sameAccount(client)) {
            const state = lastState.get(`${account}/${other.peer!.deviceId}`);
            if (other.peer!.role === "host" && state !== undefined) send(client, { type: "state", from: other.peer!.deviceId, data: state });
          }
        }
        console.log(`hello ${peer.role} ${peer.name} (${account})`);
        return;
      }
      if (!client.peer) return send(client, { type: "error", error: "hello first" });
      const from = client.peer.deviceId;
      if (message.type === "state") {
        lastState.set(`${account}/${from}`, message.data);
        for (const other of sameAccount(client)) if (other.peer!.role === "viewer") send(other, { type: "state", from, data: message.data });
        return;
      }
      if (message.type === "command" || message.type === "result" || message.type === "signal") {
        const target = toDevice(account, message.to);
        if (target) return send(target, { ...message, from });
        if (message.type === "command") send(client, { type: "result", id: message.id, ok: false, data: { error: "offline" } });
        return;
      }
      send(client, { type: "error", error: `unknown type ${String(message.type)}` });
    });
    ws.on("close", () => {
      clients.delete(client);
      if (!client.peer) return;
      for (const other of sameAccount(client)) send(other, { type: "peer-left", deviceId: client.peer.deviceId });
    });
  });
});

http.listen(PORT, "0.0.0.0", () => console.log(`relay listening on http://0.0.0.0:${PORT}`));
