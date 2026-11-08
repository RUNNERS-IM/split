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

/** Set SPLIT_API_URL to try a local relay (test/relay-server.ts). Why not when packaged: the password and tokens go to this address. */
const API_URL = ((!app.isPackaged && process.env.SPLIT_API_URL) || "https://server.system.runners.im").replace(/\/$/, "");
const RELAY_URL = `${API_URL.replace(/^http/, "ws")}/api/relay`;
/** Where usage counts go. Why null: a debug run without a local server must not report to the real one. */
export const USAGE_URL = app.isPackaged || process.env.SPLIT_API_URL ? `${API_URL}/api/mobile/usage` : null;
/** The relay closes with this code when the access token is wrong or ran out. */
const TOKEN_REFUSED = 4401;
/** Closes after which connecting again would not help: another connection took this device's place, or the app name was refused. */
const NO_RETRY = new Set([4403, 4409]);
const FIRST_RETRY_MS = 2000;
const LAST_RETRY_MS = 60_000;
/** Why: the relay checks open connections every minute and closes them once the 1-hour access token runs out, so a
 * fresh token is fetched a little before and handed over with `auth` on the same connection. */
const REFRESH_AHEAD_MS = 5 * 60_000;
const REFRESH_RETRY_MS = 60_000;

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
let refreshTimer: NodeJS.Timeout | null = null;
/** True from a refresh after 4401 until the relay answers hello, so a token it keeps refusing is not refreshed without a pause. */
let refreshedOnce = false;
/** The refresh under way. Why one: the timer and a 4401 can ask at the same moment, and the refresh token is only good once. */
let refreshing: Promise<boolean> | null = null;
/** Why: where the system has no keychain (Linux without a secret store) encrypting throws. The tokens then stay only until Split quits, never on disk as plain text. */
let unsealedTokens: Tokens | null = null;

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

// Why debug runs skip the keychain: the dev copy of Electron has no stable signature, so macOS asks for the keychain
// password on every run and again after each Electron update. Debug runs keep tokens in memory only, like a system
// without a key store, and never read what an installed Split sealed. The same rule as Remote.
const KEYCHAIN = app.isPackaged;

function readTokens(): Tokens | null {
  if (unsealedTokens) return unsealedTokens;
  const sealed = loadAccount().tokens;
  if (!sealed || !KEYCHAIN) return null;
  try {
    return JSON.parse(safeStorage.decryptString(Buffer.from(sealed, "base64"))) as Tokens;
  } catch {
    return null;
  }
}

function writeTokens(tokens: Tokens | null, email?: string | null): void {
  const current = loadAccount();
  const seal = tokens !== null && KEYCHAIN && safeStorage.isEncryptionAvailable();
  unsealedTokens = tokens && !seal ? tokens : null;
  current.tokens = seal ? safeStorage.encryptString(JSON.stringify(tokens)).toString("base64") : null;
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

export function phoneAccessToken(): string | null {
  return readTokens()?.accessToken ?? null;
}

export function phoneView(): PhoneView {
  return { status, email: status === "signedOut" ? null : loadAccount().email, name: deviceName() };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const said = await response.text().catch(() => "");
    throw Object.assign(new Error(`${path} ${response.status}`), { status: response.status, said });
  }
  // Why: mailing a code answers 204 with no body; the system server wraps every other answer as { code, data }.
  const text = await response.text();
  const answer = (text ? JSON.parse(text) : null) as { code?: unknown; data?: T } | T;
  return (answer && typeof answer === "object" && "code" in answer && "data" in answer ? answer.data : answer) as T;
}

/**
 * What the shared sign-in sheet (src/renderer/runners-account, SignInProblem) shows for a failed request, as
 * runners-app-kit desktop/main/account.ts makes it. A 401 that says "User not found" is an email with no account.
 */
type Problem = "bad" | "none" | "format" | "exists" | "code" | "many" | "network";

function problem(error: unknown): Problem {
  const { status, said } = error as { status?: number; said?: string };
  if (status === 404 || (status === 401 && said?.includes("User not found"))) return "none";
  const codes: Partial<Record<number, Problem>> = { 400: "format", 401: "bad", 409: "exists", 422: "code", 429: "many" };
  return (status && codes[status]) || "network";
}

type SignedIn = { user: { email: string }; tokens: Tokens };

function startSignedIn(answer: SignedIn, email: string): void {
  writeTokens(answer.tokens, answer.user?.email ?? email);
  retryMs = FIRST_RETRY_MS;
  refreshedOnce = false;
  connect();
}

/**
 * Signs in (or makes the account with the code `sendCode` mailed) and connects. Returns null when it worked,
 * otherwise a `Problem`.
 */
export async function signIn(mode: "login" | "signup", email: string, password: string, code?: string): Promise<Problem | null> {
  try {
    // The system server takes the password as typed (letters and numbers, 6 to 20), as runners-app-kit sends it.
    const answer = await post<SignedIn>(`/api/mobile/auth/${mode}`, {
      email,
      password,
      projectName: "SPLIT",
      ...(code ? { code } : {}),
    });
    startSignedIn(answer, email);
    return null;
  } catch (error) {
    return problem(error);
  }
}

/** Mails a six-digit code: `signup` to make the account ("exists" when there is one), `reset` for a new password
 *  ("none" when there is no account). The mail is written in `locale`. */
export async function sendCode(purpose: "signup" | "reset", email: string, locale: string): Promise<Problem | null> {
  try {
    await post(purpose === "signup" ? "/api/mobile/auth/email-code" : "/api/mobile/auth/password-reset", {
      email,
      projectName: "SPLIT",
      locale,
    });
    return null;
  } catch (error) {
    return problem(error);
  }
}

/** Sets a new password with the mailed code, then signs in with it. The RUNNERS apps share the password. */
export async function resetPassword(email: string, code: string, password: string): Promise<Problem | null> {
  try {
    const answer = await post<SignedIn>("/api/mobile/auth/password-reset/confirm", {
      email,
      code,
      password,
      projectName: "SPLIT",
    });
    startSignedIn(answer, email);
    return null;
  } catch (error) {
    return problem(error);
  }
}

export function signOut(): void {
  const tokens = readTokens();
  if (tokens) void post("/api/mobile/auth/logout", { refreshToken: tokens.refreshToken }).catch(() => {});
  writeTokens(null, null);
  disconnect();
  setStatus("signedOut");
}

function refreshTokens(): Promise<boolean> {
  refreshing ??= refreshOnce().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function refreshOnce(): Promise<boolean> {
  const tokens = readTokens();
  if (!tokens) return false;
  // Why: signing out or in while the answer is on its way must not bring the old sign-in back or end the new one.
  const sameSignIn = () => readTokens()?.refreshToken === tokens.refreshToken;
  try {
    const next = await post<Tokens>("/api/mobile/auth/refresh", { refreshToken: tokens.refreshToken });
    if (!sameSignIn()) return false;
    writeTokens(next);
    return true;
  } catch (error) {
    // A refused refresh token means the account was signed out elsewhere; a network error keeps it.
    if ((error as { status?: number }).status === 401 && sameSignIn()) {
      writeTokens(null, null);
      setStatus("signedOut");
    }
    return false;
  }
}

/** When the access token runs out, read from the token itself; null when it cannot be read. */
function tokenExpiry(token: string | undefined): number | null {
  try {
    const { exp } = JSON.parse(Buffer.from(token?.split(".")[1] ?? "", "base64url").toString()) as { exp?: unknown };
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function stopRefreshTimer(): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = null;
}

/** Fetches a fresh token before this one runs out and hands it to the open connection. */
function scheduleRefresh(wait?: number): void {
  stopRefreshTimer();
  const expiry = tokenExpiry(readTokens()?.accessToken);
  if (wait === undefined && expiry === null) return;
  // Why the floor: a token that is already short-lived must not start a refresh without a pause.
  const delay = wait ?? Math.max(REFRESH_RETRY_MS, expiry! - REFRESH_AHEAD_MS - Date.now());
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const ws = socket;
    void refreshTokens().then((fresh) => {
      if (!ws || socket !== ws) return;
      const tokens = readTokens();
      if (!tokens) {
        disconnect();
      } else if (fresh) {
        send({ type: "auth", token: tokens.accessToken });
        scheduleRefresh();
      } else {
        scheduleRefresh(REFRESH_RETRY_MS);
      }
    });
  }, delay);
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
  stopRefreshTimer();
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
  // Node's WebSocket (undici) takes headers, which the browser one does not.
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${tokens.accessToken}` } } as unknown as string[]);
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    send({ type: "hello", deviceId: loadAccount().deviceId, projectName: "SPLIT", name: deviceName(), role: "host" });
  });
  ws.addEventListener("message", (event) => {
    let message: { type?: unknown };
    try {
      message = JSON.parse(String(event.data));
    } catch {
      return;
    }
    // Why: the relay answers hello with `peers` only after it took the token and the app name. Counting the connection
    // as made only then keeps a server that accepts and then drops every connection from being retried without a pause.
    if (message.type === "peers" && socket === ws) {
      retryMs = FIRST_RETRY_MS;
      refreshedOnce = false;
      setStatus("connected");
      announceState();
      scheduleRefresh();
      return;
    }
    if (message.type === "command") answer(message as Parameters<typeof answer>[0]);
  });
  ws.addEventListener("close", (event) => {
    if (socket !== ws) return;
    socket = null;
    stopRefreshTimer();
    // Why: connecting again after "replaced" would push the other connection out in turn, forever.
    if (NO_RETRY.has(event.code)) {
      setStatus("offline");
      return;
    }
    // Why once: a token the relay still refuses after a refresh waits like any other failure. A refresh that did not
    // reach the server may try again next time.
    if (event.code === TOKEN_REFUSED && !refreshedOnce) {
      refreshedOnce = true;
      void refreshTokens().then((fresh) => {
        if (socket || retryTimer) return;
        if (fresh) return connect();
        refreshedOnce = false;
        retryLater();
      });
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
