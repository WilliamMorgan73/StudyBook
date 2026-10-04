//! The bundled StudyBook server (backend/packaging, `app/desktop.py`), for packaged builds. Development
//! skips all of this: the window loads the Vite dev server and the backend is started by hand.
//!
//! The window opens on the splash (`splash/index.html`) while the server starts, then navigates to it.
//! The server serves the API, uploads and the frontend from one origin on 127.0.0.1, so the frontend's
//! relative `/api` URLs work unchanged.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

/// Preferred port. Browser storage (remembered tabs, collapsed sections) is per origin, and the origin
/// includes the port, so a stable port keeps it across launches; a random one is the fallback if it's taken.
const PREFERRED_PORT: u16 = 47613;
/// The first launch on a slow machine (or one scanning the new files) can take a while.
const STARTUP_TIMEOUT: Duration = Duration::from_secs(60);

/// The running server, killed when the app exits. Holding the `Child` also holds its stdin pipe open;
/// the server exits when that closes (`--exit-with-stdin`), so it never outlives a crashed app.
#[derive(Default)]
pub struct Backend(Mutex<Option<Child>>);

impl Backend {
  pub fn stop(&self) {
    if let Some(mut child) = self.0.lock().unwrap().take() {
      let _ = child.kill();
      let _ = child.wait();
    }
  }
}

/// Starts the server on a background thread, then points `window` at it (or shows why it failed).
pub fn start(app: &AppHandle, window: WebviewWindow) {
  let app = app.clone();
  std::thread::spawn(move || {
    let result = launch(&app).and_then(|port| wait_until_ready(&app, port).map(|()| port));
    match result {
      Ok(port) => {
        let url = format!("http://127.0.0.1:{port}/").parse().expect("valid URL");
        if let Err(err) = window.navigate(url) {
          show_error(&window, &format!("Couldn't open StudyBook: {err}"));
        }
      }
      Err(message) => show_error(&window, &message),
    }
  });
}

fn launch(app: &AppHandle) -> Result<u16, String> {
  let resources = app.path().resource_dir().map_err(|e| e.to_string())?;
  let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  fs::create_dir_all(&data_dir).map_err(|e| format!("Couldn't create {}: {e}", data_dir.display()))?;

  let exe = resources
    .join("backend")
    .join(if cfg!(windows) { "studybook-backend.exe" } else { "studybook-backend" });
  let port = free_port();
  let log = File::create(log_path(&data_dir)).map_err(|e| e.to_string())?;

  let mut command = Command::new(&exe);
  command
    .arg("--port")
    .arg(port.to_string())
    .arg("--data-dir")
    .arg(&data_dir)
    .arg("--frontend-dist")
    .arg(resources.join("frontend"))
    .arg("--exit-with-stdin")
    .current_dir(&data_dir)
    .stdin(Stdio::piped())
    .stdout(log.try_clone().map_err(|e| e.to_string())?)
    .stderr(log);
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
  }

  let child = command
    .spawn()
    .map_err(|e| format!("Couldn't start {}: {e}", exe.display()))?;
  *app.state::<Backend>().0.lock().unwrap() = Some(child);
  Ok(port)
}

fn free_port() -> u16 {
  let bind = |port| TcpListener::bind((Ipv4Addr::LOCALHOST, port)).and_then(|l| l.local_addr());
  bind(PREFERRED_PORT)
    .or_else(|_| bind(0))
    .map(|addr| addr.port())
    .unwrap_or(PREFERRED_PORT)
}

fn wait_until_ready(app: &AppHandle, port: u16) -> Result<(), String> {
  let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
  let started = Instant::now();
  while started.elapsed() < STARTUP_TIMEOUT {
    if healthy(port) {
      return Ok(());
    }
    if let Some(child) = app.state::<Backend>().0.lock().unwrap().as_mut() {
      if let Ok(Some(status)) = child.try_wait() {
        return Err(format!(
          "The StudyBook server stopped ({status}). Details are in {}",
          log_path(&data_dir).display()
        ));
      }
    }
    std::thread::sleep(Duration::from_millis(150));
  }
  Err(format!(
    "The StudyBook server didn't start within {} seconds. Details are in {}",
    STARTUP_TIMEOUT.as_secs(),
    log_path(&data_dir).display()
  ))
}

/// `GET /api/health` answered with 200, over a plain socket (no HTTP client needed for one request).
fn healthy(port: u16) -> bool {
  let addr = SocketAddr::from((Ipv4Addr::LOCALHOST, port));
  let attempt = || -> std::io::Result<bool> {
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(300))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.write_all(b"GET /api/health HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n")?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    Ok(response.starts_with("HTTP/1.1 200") || response.starts_with("HTTP/1.0 200"))
  };
  attempt().unwrap_or(false)
}

fn log_path(data_dir: &Path) -> std::path::PathBuf {
  data_dir.join("backend.log")
}

fn show_error(window: &WebviewWindow, message: &str) {
  let message = serde_json::to_string(message).unwrap_or_default();
  let _ = window.eval(format!("window.showStartupError?.({message})"));
}
