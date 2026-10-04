fn main() {
  // tauri.conf.json bundles resources/backend and resources/frontend, which backend/packaging/build.py
  // fills before a packaged build (`beforeBuildCommand`). Dev builds and `cargo check` don't run it, and
  // Tauri refuses a resource path that doesn't exist, so make sure the folders do.
  for dir in ["resources/backend", "resources/frontend"] {
    std::fs::create_dir_all(dir).expect("create resource folder");
  }
  tauri_build::build()
}
