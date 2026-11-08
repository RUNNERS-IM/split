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
import { createAccount, type Account } from "./runners/account";

/** Set SPLIT_API_URL to try a local relay (test/relay-server.ts). Why not when packaged: the password and tokens go to this address. */
const API_URL = ((!app.isPackaged && process.env.SPLIT_API_URL) || "https://server.system.runners.im").replace(/\/$/, "");
const RELAY_URL = `${API_URL.replace(/^http/, "ws")}/api/relay`;
/** The name the system server sees for Split's requests; without it they say node. */
export const USER_AGENT = `Split/${app.getVersion()}`;
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

/** Account.json: this computer's id for the relay. A Split from before the kit account also kept the sign-in here. */
interface DeviceFile {
  deviceId?: string;
  email?: string | null;
  /** Both tokens, encrypted with the system keychain (safeStorage), base64. */
  tokens?: string | null;
}

let hooks: PhoneHooks | null = null;
let account: Account | null = null;
let deviceId: string | null = null;
let socket: WebSocket | null = null;
let status: PhoneStatus = "signedOut";
let retryMs = FIRST_RETRY_MS;
let retryTimer: NodeJS.Timeout | null = null;
let refreshTimer: NodeJS.Timeout | null = null;
/** True from a refresh after 4401 until the relay answers hello, so a token it keeps refusing is not refreshed without a pause. */
let refreshedOnce = false;
/** The refresh under way. Why one: the timer and a 4401 can ask at the same moment, and the refresh token is only good once. */
let refreshing: Promise<boolean> | null = null;

function userFile(name: string): string {
  return join(app.getPath("userData"), name);
}

function readDeviceFile(): DeviceFile {
  try {
    return JSON.parse(readFileSync(userFile("Account.json"), "utf8")) as DeviceFile;
  } catch {
    return {};
  }
}

function replaceFile(file: string, data: string | Buffer, mode?: number): void {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  writeFileSync(temp, data, { mode });
  renameSync(temp, file);
}

function saveDeviceFile(id: string): void {
  replaceFile(userFile("Account.json"), `${JSON.stringify({ deviceId: id }, null, 2)}\n`);
}

function thisDeviceId(): string {
  if (deviceId) return deviceId;
  deviceId = readDeviceFile().deviceId || randomUUID();
  if (!existsSync(userFile("Account.json"))) saveDeviceFile(deviceId);
  return deviceId;
}

/**
 * Moves the sign-in of a Split from before the kit account into account.bin, so an update keeps people signed in and
 * the device id keeps the phone from listing this computer twice. Remove a few releases on.
 * Why it writes the file itself: the kit has no import, and handing it plain text would put the tokens on disk unencrypted.
 */
function moveOldSignIn(): void {
  // Why debug runs skip this: they stay off the keychain, as createAccount does with isPackaged false.
  if (!app.isPackaged || !safeStorage.isEncryptionAvailable()) return;
  const old = readDeviceFile();
  if (!old.tokens) return;
  try {
    if (!existsSync(userFile("account.bin"))) {
      const tokens = JSON.parse(safeStorage.decryptString(Buffer.from(old.tokens, "base64"))) as unknown;
      replaceFile(userFile("account.bin"), safeStorage.encryptString(JSON.stringify({ email: old.email ?? "", tokens })), 0o600);
    }
    saveDeviceFile(old.deviceId || randomUUID());
  } catch {
    // The keychain said no this time. The old file stays, so the next start tries again.
  }
}

/** Why not at load: on Linux the keychain answers only once the app is ready. */
function runnersAccount(): Account {
  if (account) return account;
  moveOldSignIn();
  account = createAccount({
    project: "SPLIT",
    filePath: userFile("account.bin"),
    apiUrl: API_URL,
    safeStorage,
    isPackaged: app.isPackaged,
    userAgent: USER_AGENT,
  });
  return account;
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
  return runnersAccount().accessToken();
}

export function phoneView(): PhoneView {
  return { status, email: status === "signedOut" ? null : runnersAccount().current(), name: deviceName() };
}

/** The codes the shared sign-in sheet (src/renderer/runners-account, SignInProblem) shows. The kit throws them as messages. */
const PROBLEMS = ["bad", "none", "format", "exists", "code", "many", "network"] as const;
type Problem = (typeof PROBLEMS)[number];

function problem(error: unknown): Problem {
  return PROBLEMS.find((code) => code === (error as Error).message) ?? "network";
}

/** Runs a kit call that signs in, then connects. Returns null when it worked, otherwise a `Problem`. */
async function startSignedIn(call: (account: Account) => Promise<void>): Promise<Problem | null> {
  try {
    await call(runnersAccount());
  } catch (error) {
    return problem(error);
  }
  retryMs = FIRST_RETRY_MS;
  refreshedOnce = false;
  connect();
  return null;
}

/** Signs in (or makes the account with the code `sendCode` mailed) and connects. */
export function signIn(mode: "login" | "signup", email: string, password: string, code?: string): Promise<Problem | null> {
  return startSignedIn((account) => account.signIn(mode, email, password, code));
}

/** Mails a six-digit code: `signup` to make the account ("exists" when there is one), `reset` for a new password
 *  ("none" when there is no account). The mail is written in `locale`. */
export async function sendCode(purpose: "signup" | "reset", email: string, locale: string): Promise<Problem | null> {
  try {
    await runnersAccount().sendCode(purpose, email, locale);
    return null;
  } catch (error) {
    return problem(error);
  }
}

/** Sets a new password with the mailed code, then signs in with it. The RUNNERS apps share the password. */
export function resetPassword(email: string, code: string, password: string): Promise<Problem | null> {
  return startSignedIn((account) => account.resetPassword(email, code, password));
}

export function signOut(): void {
  void runnersAccount().signOut();
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
  const result = await runnersAccount().refresh();
  // A refused refresh token means the account was signed out elsewhere; a network error keeps it.
  if (!result.ok && result.reason === "rejected") setStatus("signedOut");
  return result.ok;
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
  const expiry = tokenExpiry(phoneAccessToken() ?? undefined);
  if (wait === undefined && expiry === null) return;
  // Why the floor: a token that is already short-lived must not start a refresh without a pause.
  const delay = wait ?? Math.max(REFRESH_RETRY_MS, expiry! - REFRESH_AHEAD_MS - Date.now());
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    const ws = socket;
    void refreshTokens().then((fresh) => {
      if (!ws || socket !== ws) return;
      const token = phoneAccessToken();
      if (!token) {
        disconnect();
      } else if (fresh) {
        send({ type: "auth", token });
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
  if (retryTimer || !phoneAccessToken()) return;
  setStatus("offline");
  retryTimer = setTimeout(() => {
    retryTimer = null;
    connect();
  }, retryMs);
  retryMs = Math.min(retryMs * 2, LAST_RETRY_MS);
}

function connect(): void {
  disconnect();
  const token = phoneAccessToken();
  if (!token) {
    setStatus("signedOut");
    return;
  }
  setStatus("connecting");
  // Node's WebSocket (undici) takes headers, which the browser one does not.
  const ws = new WebSocket(RELAY_URL, { headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT } } as unknown as string[]);
  socket = ws;
  ws.addEventListener("open", () => {
    if (socket !== ws) return;
    send({ type: "hello", deviceId: thisDeviceId(), projectName: "SPLIT", name: deviceName(), role: "host" });
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
  if (phoneAccessToken()) connect();
}
