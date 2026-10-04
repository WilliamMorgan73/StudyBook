mod backend;

use serde::Serialize;
use tauri::webview::DownloadEvent;
use tauri::{Emitter, Manager, RunEvent, WebviewWindowBuilder};

/// Sent to the page as `download-finished`: the webview saves downloads (to ~/Downloads on Linux)
/// without any visible sign, so the page shows its own "Saved to …" message.
#[derive(Clone, Serialize)]
struct DownloadFinished {
  url: String,
  path: Option<String>,
  success: bool,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // First, so a second launch just focuses this window: two servers on one database would conflict.
    .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.set_focus();
      }
    }))
    .manage(backend::Backend::default())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // The main window is built here rather than from the config (`create: false`) so it can have a
      // download handler; its size, title and frameless look still come from tauri.conf.json.
      let config = app
        .config()
        .app
        .windows
        .first()
        .expect("tauri.conf.json defines the main window")
        .clone();
      let window = WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_download(|webview, event| {
          if let DownloadEvent::Finished { url, path, success } = event {
            let _ = webview.emit(
              "download-finished",
              DownloadFinished {
                url: url.to_string(),
                path: path.map(|p| p.display().to_string()),
                success,
              },
            );
          }
          true // keep the default destination
        })
        .build()?;

      // Packaged builds start the bundled server; `tauri dev` uses the Vite dev server instead.
      if !cfg!(debug_assertions) {
        backend::start(app.handle(), window);
      }
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let RunEvent::Exit = event {
        app.state::<backend::Backend>().stop();
      }
    });
}
