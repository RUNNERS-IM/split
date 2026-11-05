// The phone app (split-app) arranges this computer's windows through the system server's relay.
// Split signs in with a RUNNERS account, keeps one WebSocket open to the relay and answers four
// commands: layouts.list, shape.apply, layout.apply (a saved layout) and layout.restore (undo).
//
// The messages are in runners-app-kit docs/relay.md. The ones Split uses:
//   computer → relay  {type:'hello', deviceId, projectName:'SPLIT', name, role:'host'}
//                     {type:'state', data}                 whenever monitors or saved layouts change
//   phone → computer  {type:'command', from, id, name, args}
//   computer → phone  {type:'result', to, id, ok, data}
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { app, safeStorage } from "electron";

/** Set SPLIT_API_URL to try a local relay (test/relay-server.ts). */
const API_URL = (process.env.SPLIT_API_URL || "https://server.system.runners.im").replace(/\/$/, "");
const RELAY_URL = `${API_URL.replace(/^http/, "ws")}/api/relay`;
/** The relay closes with this code when the access token is wrong or ran out. */
const TOKEN_REFUSED = 4401;
/** Closes after which connecting again would not help: another connection took this device's place, or the app name was refused. */
const NO_RETRY = new Set([4403, 4409]);
const FIRST_RETRY_MS = 2000;
const LAST_RETRY_MS = 60_000;

export type PhoneStatus = "signedOut" | "connecting" | "connected" | "offline";

export interface PhoneView {
  status: PhoneStatus;
  email: string | null;
  /** The name the phone shows for this computer. */
  name: string;
}

export interface PhoneHooks {
  /** What the phone needs to draw this computer: monitors, shapes and saved layouts. */
  state(): unknown;
  /** Runs one command and returns what goes back in `data`; throws to answer ok: false. */
  run(name: string, args: Record<string, unknown>): unknown;
  /** The status or account changed, so open pages should be told. */
  changed(): void;
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface Account {
  deviceId: string;
  email: string | null;
  /** Both tokens, encrypted with the system keychain (safeStorage), base64. */
  tokens: string | null;
}

let hooks: PhoneHooks | null = null;
let account: Account | null = null;
let socket: WebSocket | null = null;
let status: PhoneStatus = "signedOut";
let retryMs = FIRST_RETRY_MS;
let retryTimer: NodeJS.Timeout | null = null;

function accountFile(): string {
  return join(app.getPath("userData"), "Account.json");
}

function loadAccount(): Account {
  if (account) return account;
  try {
    const raw = JSON.parse(readFileSync(accountFile(), "utf8")) as Partial<Account>;
    account = { deviceId: raw.deviceId || randomUUID(), email: raw.email ?? null, tokens: raw.tokens ?? null };
  } catch {
    account = { deviceId: randomUUID(), email: null, tokens: null };
  }
  if (!existsSync(accountFile())) saveAccount();
  return account;
}

function saveAccount(): void {
  const file = accountFile();
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, `${JSON.stringify(account, null, 2)}\n`);
  renameSync(temp, file);
}

function readTokens(): Tokens | null {
  const sealed = loadAccount().tokens;
  if (!sealed) return null;
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(sealed, "base64"))) as Tokens;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null, email?: string | null): void {
  const current = loadAccount();
  current.tokens = tokens ? safeStorage.encryptString(JSON.stringify(tokens)).toString("base64") : null;
  if (email !== undefined) current.email = email;
  saveAccount();
}

/** The computer name without ".local", as Finder shows it. */
function deviceName(): string {
  return hostname().replace(/\.local$/i, "");
}

function setStatus(next: PhoneStatus): void {
  if (status === next) return;
  status = next;
  hooks?.changed();
}

export function phoneView(): PhoneView {
  return { status, email: loadAccount().email, name: deviceName() };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw Object.assign(new Error(`${path} ${response.status}`), { status: response.status });
  // Why: the system server wraps every successful answer as { code, data }.
  const answer = (await response.json()) as { code?: unknown; data?: T } | T;
  return (answer && typeof answer === "object" && "code" in answer && "data" in answer ? answer.data : answer) as T;
}

/**
 * Signs in and connects. Returns null when it worked, otherwise the string key of the reason
 * ("PhoneSignInWrong" for a wrong email or password, "PhoneSignInFailed" for anything else).
 */
export async function signIn(email: string, password: string): Promise<string | null> {
  try {
    // The system server takes the password as typed (letters and numbers, 6 to 20), as runners-app-kit sends it.
    const answer = await post<{ user: { email: string }; tokens: Tokens }>("/api/mobile/auth/login", {
      email,
      password,
      projectName: "SPLIT",
    });
    writeTokens(answer.tokens, answer.user?.email ?? email);
    retryMs = FIRST_RETRY_MS;
    connect();
    return null;
  } catch (error) {
    const code = (error as { status?: number }).status;
    return code === 400 || code === 401 || code === 404 ? "PhoneSignInWrong" : "PhoneSignInFailed";
  }
}

export function signOut(): void {
  const tokens = readTokens();
  if (tokens) void post("/api/mobile/auth/logout", { refreshToken: tokens.refreshToken }).catch(() => {});
  writeTokens(null, null);
  disconnect();
  setStatus("signedOut");
}

async function refreshTokens(): Promise<boolean> {
  const tokens = readTokens();
  if (!tokens) return false;
  try {
    writeTokens(await post<Tokens>("/api/mobile/auth/refresh", { refreshToken: tokens.refreshToken }));
    return true;
  } catch (error) {
    // A refused refresh token means the account was signed out elsewhere; a network error keeps it.
    if ((error as { status?: number }).status === 401) {
      writeTokens(null, null);
      setStatus("signedOut");
    }
    return false;
  }
}

function send(message: unknown): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/** Tells the phones what this computer looks like now. */
export function announceState(): void {
  if (status !== "connected" || !hooks) return;
  send({ type: "state", data: hooks.state() });
}

function answer(message: { from?: unknown; id?: unknown; name?: unknown; args?: unknown }): void {
  if (!hooks || typeof message.id !== "string" || typeof message.name !== "string") return;
  const to = message.from;
  const args = message.args && typeof message.args === "object" ? (message.args as Record<string, unknown>) : {};
  try {
    send({ type: "result", to, id: message.id, ok: true, data: hooks.run(message.name, args) ?? null });
  } catch (error) {
    send({ type: "result", to, id: message.id, ok: false, data: { error: (error as Error).message } });
  }
}

function disconnect(): void {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  const old = socket;
  socket = null;
  old?.close();
}

function retryLater(): void {
  if (retryTimer || !readTokens()) return;
  setStatus("offline");
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
}

function connect(): void {
  disconnect();
  const tokens = readTokens();
  if (!tokens) {
    setStatus("signedOut");
    return;
  }
  setStatus("connecting");
  let opened = false;
  // Node's WebSocket (undici) takes headers, which the browser one does not.
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${tokens.accessToken}` } } as unknown as string[]);
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    opened = true;
    retryMs = FIRST_RETRY_MS;
    send({ type: "hello", deviceId: loadAccount().deviceId, projectName: "SPLIT", name: deviceName(), role: "host" });
    setStatus("connected");
    announceState();
  });
  ws.addEventListener("message", (event) => {
    let message: { type?: unknown };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    if (message.type === "command") answer(message as Parameters<typeof answer>[0]);
  });
  ws.addEventListener("close", (event) => {
    if (socket !== ws) return;
    socket = null;
    // Why: connecting again after "replaced" would push the other connection out in turn, forever.
    if (NO_RETRY.has(event.code)) {
      setStatus("offline");
      return;
    }
    // Why: a handshake refused before it opens is most often an access token that ran out, too.
    if (event.code === TOKEN_REFUSED || !opened) {
      void refreshTokens().then((fresh) => (fresh ? connect() : retryLater()));
      return;
    }
    retryLater();
  });
  ws.addEventListener("error", () => {
    // "close" follows and decides what to do.
  });
}

/** Call once when Split starts; connects at once when an account is already signed in. */
export function setupPhone(given: PhoneHooks): void {
  hooks = given;
  if (readTokens()) connect();
}
