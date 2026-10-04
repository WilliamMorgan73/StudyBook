import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** True inside the Tauri desktop shell (`src-tauri/`), false in a browser. */
export const isDesktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

/**
 * Rounds the frameless window's corners on Linux, where the shell makes the window transparent
 * (`src-tauri/src/lib.rs`); index.css does the drawing from `data-frame` / `data-maximized` on <html>.
 * Corners go square while maximised or fullscreen, against the screen edges. Windows 11 rounds frameless
 * windows itself, and browsers aren't affected.
 */
export function setUpWindowFrame(): void {
  if (!isDesktop || !navigator.userAgent.includes('Linux')) return
  const root = document.documentElement
  root.dataset.frame = 'rounded'
  const appWindow = getCurrentWindow()
  const update = async () => {
    const edgeToEdge = (await appWindow.isMaximized()) || (await appWindow.isFullscreen())
    root.toggleAttribute('data-maximized', edgeToEdge)
  }
  void update()
  void appWindow.onResized(() => void update())
}

/** The `download-finished` event `src-tauri/src/lib.rs` emits once the webview has saved a download. */
export interface DownloadFinished {
  url: string
  /** Where it was saved; may be null even on success. */
  path: string | null
  success: boolean
}

/** Calls `handler` for each finished download in the desktop shell; returns an unsubscribe. No-op in a browser. */
export function onDownloadFinished(handler: (download: DownloadFinished) => void): () => void {
  if (!isDesktop) return () => {}
  const unlisten = listen<DownloadFinished>('download-finished', (event) => handler(event.payload))
  return () => void unlisten.then((stop) => stop())
}

/** The frameless desktop window's own controls (the OS title bar is turned off in tauri.conf.json). */
export const desktopWindow = {
  minimize: () => getCurrentWindow().minimize(),
  toggleMaximize: () => getCurrentWindow().toggleMaximize(),
  close: () => getCurrentWindow().close(),
}
