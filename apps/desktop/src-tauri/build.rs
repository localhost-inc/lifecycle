use std::env;
use std::path::{Path, PathBuf};
use std::process::Command;

fn main() {
    println!("cargo:rerun-if-env-changed=LIFECYCLE_GHOSTTYKIT_PATH");
    println!("cargo:rustc-check-cfg=cfg(has_ghosttykit)");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-changed=native/lifecycle_native_terminal.m");
    println!("cargo:rerun-if-changed=../../../scripts/prepare-ghosttykit.sh");
    println!("cargo:rerun-if-changed=../../../vendor/ghostty.lock");

    #[cfg(target_os = "macos")]
    if let Some(slice_dir) = prepare_ghosttykit() {
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
fn prepare_ghosttykit() -> Option<PathBuf> {
    let xcframework_path = env::var_os("LIFECYCLE_GHOSTTYKIT_PATH")
        .map(PathBuf::from)
        .or_else(|| build_ghosttykit_via_script().ok().flatten())?;

    if is_ghosttykit_slice_dir(&xcframework_path) {
        return Some(xcframework_path);
    }

    let arch = env::var("CARGO_CFG_TARGET_ARCH").ok()?;
    let slice_dir = match arch.as_str() {
        "aarch64" => xcframework_path.join("macos-arm64"),
        "x86_64" => xcframework_path.join("macos-x86_64"),
        other => {
            println!(
                "cargo:warning=Unsupported macOS target arch for GhosttyKit slice selection: {other}"
            );
            return None;
        }
    };

    let lib_path = slice_dir.join("libghostty-fat.a");
    let header_path = slice_dir.join("Headers").join("ghostty.h");
    if !lib_path.exists() || !header_path.exists() {
        println!(
            "cargo:warning=GhosttyKit slice is incomplete at {}",
            slice_dir.display()
        );
        return None;
    }

    Some(slice_dir)
}

#[cfg(target_os = "macos")]
fn is_ghosttykit_slice_dir(path: &Path) -> bool {
    path.join("libghostty-fat.a").exists() && path.join("Headers").join("ghostty.h").exists()
}

#[cfg(target_os = "macos")]
fn build_ghosttykit_via_script() -> Result<Option<PathBuf>, String> {
    let script = Path::new("../../../scripts/prepare-ghosttykit.sh");
    if !script.exists() {
        return Ok(None);
    }

    let output = Command::new(script)
        .output()
        .map_err(|error| format!("failed to run GhosttyKit bootstrap script: {error}"))?;

    if !output.status.success() {
        println!(
            "cargo:warning=GhosttyKit bootstrap failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        );
        return Ok(None);
    }

    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        return Ok(None);
    }

    Ok(Some(PathBuf::from(path)))
}
