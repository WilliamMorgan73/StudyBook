use serde::Serialize;
use tauri::webview::DownloadEvent;
use tauri::{Emitter, WebviewWindowBuilder};

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
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // The main window is built here rather than from the config (`create: false`) only so it can
      // have a download handler; its size, title and frameless look still come from tauri.conf.json.
      let config = app
        .config()
        .app
        .windows
        .first()
        .expect("tauri.conf.json defines the main window")
        .clone();
      WebviewWindowBuilder::from_config(app.handle(), &config)?
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
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
