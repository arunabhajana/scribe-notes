fn main() {
  println!("cargo:rerun-if-changed=icons/scribe-v2");
  tauri_build::build()
}
