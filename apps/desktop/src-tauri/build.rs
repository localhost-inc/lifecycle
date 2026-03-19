use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

#[cfg(target_os = "macos")]
const GENERATED_GHOSTTYKIT_XCFRAMEWORK: &str = ".generated/ghostty/GhosttyKit.xcframework";

fn main() {
    println!("cargo:rerun-if-env-changed=LIFECYCLE_GHOSTTYKIT_PATH");
    println!("cargo:rustc-check-cfg=cfg(has_ghosttykit)");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=native/lifecycle_native_terminal.m");
    println!("cargo:rerun-if-changed=native/lifecycle_native_platform.m");
    println!("cargo:rerun-if-changed=../../../scripts/prepare-ghosttykit.sh");
    println!("cargo:rerun-if-changed=../../../vendor/ghostty.lock");

    #[cfg(target_os = "macos")]
    {
        cc::Build::new()
            .file("native/lifecycle_native_platform.m")
            .flag("-fobjc-arc")
            .compile("lifecycle_native_platform");
    }

    #[cfg(target_os = "macos")]
    {
        let slice_dir = prepare_ghosttykit().unwrap_or_else(|error| {
            panic!("GhosttyKit is required for macOS desktop builds: {error}");
        });
        const GHOSTTY_MIN_MACOS_VERSION: &str = "13.0";
        let headers_dir = slice_dir.join("Headers");
        let native_dir = PathBuf::from("native");

        cc::Build::new()
            .file(native_dir.join("lifecycle_native_terminal.m"))
            .include(&headers_dir)
            .flag("-fobjc-arc")
            .flag(&format!("-mmacosx-version-min={GHOSTTY_MIN_MACOS_VERSION}"))
            .compile("lifecycle_native_terminal");

        println!("cargo:rustc-link-arg=-mmacosx-version-min={GHOSTTY_MIN_MACOS_VERSION}");
        println!("cargo:rustc-link-search=native={}", slice_dir.display());
        println!("cargo:rustc-link-lib=static=ghostty-fat");
        println!("cargo:rustc-link-lib=c++");
        println!("cargo:rustc-link-lib=framework=AppKit");
        println!("cargo:rustc-link-lib=framework=ApplicationServices");
        println!("cargo:rustc-link-lib=framework=Carbon");
        println!("cargo:rustc-link-lib=framework=CoreText");
        println!("cargo:rustc-link-lib=framework=Foundation");
        println!("cargo:rustc-link-lib=framework=CoreGraphics");
        println!("cargo:rustc-link-lib=framework=IOSurface");
        println!("cargo:rustc-link-lib=framework=Metal");
        println!("cargo:rustc-link-lib=framework=QuartzCore");
        println!("cargo:rustc-link-lib=framework=UniformTypeIdentifiers");
        println!("cargo:rustc-cfg=has_ghosttykit");
    }

    tauri_build::build()
}

#[cfg(target_os = "macos")]
fn prepare_ghosttykit() -> Result<PathBuf, String> {
    if let Some(path) = env::var_os("LIFECYCLE_GHOSTTYKIT_PATH").map(PathBuf::from) {
        return resolve_ghosttykit_slice(&path).map_err(|error| {
            format!(
                "invalid LIFECYCLE_GHOSTTYKIT_PATH '{}': {error}",
                path.display()
            )
        });
    }

    if let Some(path) = cached_ghosttykit_xcframework_path() {
        match resolve_ghosttykit_slice(&path) {
            Ok(slice_dir) => return Ok(slice_dir),
            Err(error) => {
                println!(
                    "cargo:warning=Ignoring cached GhosttyKit at {}: {}",
                    path.display(),
                    error
                );
            }
        }
    }

    let xcframework_path = build_ghosttykit_via_script()?;
    resolve_ghosttykit_slice(&xcframework_path)
}

#[cfg(target_os = "macos")]
fn cached_ghosttykit_xcframework_path() -> Option<PathBuf> {
    let path = PathBuf::from(GENERATED_GHOSTTYKIT_XCFRAMEWORK);
    path.exists().then_some(path)
}

#[cfg(target_os = "macos")]
fn resolve_ghosttykit_slice(xcframework_path: &Path) -> Result<PathBuf, String> {
    if is_ghosttykit_slice_dir(xcframework_path) {
        return Ok(xcframework_path.to_path_buf());
    }

    let arch = env::var("CARGO_CFG_TARGET_ARCH")
        .map_err(|error| format!("failed to resolve Cargo target arch: {error}"))?;
    let slice_dir = match arch.as_str() {
        "aarch64" => xcframework_path.join("macos-arm64"),
        "x86_64" => xcframework_path.join("macos-x86_64"),
        other => {
            return Err(format!(
                "unsupported macOS target arch for GhosttyKit slice selection: {other}"
            ));
        }
    };

    let lib_path = slice_dir.join("libghostty-fat.a");
    let header_path = slice_dir.join("Headers").join("ghostty.h");
    if !lib_path.exists() || !header_path.exists() {
        return Err(format!(
            "GhosttyKit slice is incomplete at {}",
            slice_dir.display()
        ));
    }

    Ok(slice_dir)
}

#[cfg(target_os = "macos")]
fn is_ghosttykit_slice_dir(path: &Path) -> bool {
    path.join("libghostty-fat.a").exists() && path.join("Headers").join("ghostty.h").exists()
}

#[cfg(target_os = "macos")]
fn build_ghosttykit_via_script() -> Result<PathBuf, String> {
    let script = Path::new("../../../scripts/prepare-ghosttykit.sh");
    if !script.exists() {
        return Err(format!(
            "GhosttyKit bootstrap script not found: {}",
            script.display()
        ));
    }

    let output = Command::new(script)
        .output()
        .map_err(|error| format!("failed to run GhosttyKit bootstrap script: {error}"))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Err("GhosttyKit bootstrap script returned an empty output path".to_string());
    }

    Ok(PathBuf::from(path))
}
