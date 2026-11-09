// Gives every Split page `window.split` (see src/shared/types.ts) and nothing else from Node.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { OverlayPayload, PanelView, SettingsTab, SheetPayload, SplitApi, UpdateProgress, ViewState } from "../shared/types";

function listen<T>(channel: string, listener: (value: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, value: T) => listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api: SplitApi = {
  getState: () => ipcRenderer.invoke("state:get"),
  phoneSignIn: (mode, email, password, code) => ipcRenderer.invoke("phone:signIn", mode, email, password, code),
  phoneSendCode: (purpose, email) => ipcRenderer.invoke("phone:sendCode", purpose, email),
  phoneResetPassword: (email, code, password) => ipcRenderer.invoke("phone:resetPassword", email, code, password),
  phoneSignOut: () => ipcRenderer.invoke("phone:signOut"),
  saveSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  restoreDefaultShortcuts: () => ipcRenderer.invoke("shortcuts:restore"),
  setRecording: (recording) => ipcRenderer.invoke("shortcuts:recording", recording),
  previewFeedback: () => ipcRenderer.invoke("feedback:preview"),
  openLink: (kind) => ipcRenderer.invoke("link:open", kind),
  requestTrust: () => ipcRenderer.invoke("trust:request"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  onSettingsTab: (listener) => {
    const handler = (_event: IpcRendererEvent, tab: SettingsTab, signIn: boolean) => listener(tab, signIn);
    ipcRenderer.on("settings:tab", handler);
    return () => ipcRenderer.removeListener("settings:tab", handler);
  },
  answerUpdate: (install) => ipcRenderer.invoke("update:answer", install),
  answerLayoutSave: (answer) => ipcRenderer.invoke("layout:answer", answer),
  showPro: () => ipcRenderer.invoke("pro:show"),
  guideLater: () => ipcRenderer.invoke("guide:later"),
  guideReset: () => ipcRenderer.invoke("guide:reset"),
  onState: (listener) => listen<ViewState>("state:changed", listener),
  onOverlay: (listener) => listen<OverlayPayload | null>("overlay:show", listener),
  onSheet: (listener) => listen<SheetPayload>("sheet:show", listener),
  onUpdateProgress: (listener) => listen<UpdateProgress>("update:progress", listener),
  panelView: () => ipcRenderer.invoke("panel:view"),
  panelRun: (id) => ipcRenderer.invoke("panel:run", id),
  panelChoose: (chosen) => ipcRenderer.invoke("panel:choose", chosen),
  panelSettings: (tab, signIn) => ipcRenderer.invoke("panel:settings", tab, signIn),
  panelFit: (height) => ipcRenderer.send("panel:fit", height),
  panelClose: () => ipcRenderer.send("panel:close"),
  onPanelShown: (listener) => listen<PanelView>("panel:shown", listener),
};

contextBridge.exposeInMainWorld("split", api);
