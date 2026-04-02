fn main() {
    // The libghostty-vt-sys build script emits:
    //   cargo:rustc-link-search=native=<path>/ghostty-install/lib
    //   cargo:rustc-link-lib=dylib=ghostty-vt
    // But it doesn't set an rpath, so we need to find the dylib and set one.
    //
    // DEP_ env vars use the crate's link name. libghostty-vt-sys links as "ghostty-vt"
    // so the var would be DEP_GHOSTTY_VT_INCLUDE if the sys crate emits cargo:include=...
    // But we can also just scan the build directory.

    // Add header padding so install_name_tool can work, and set rpath via linker
    println!("cargo:rustc-link-arg=-Wl,-headerpad_max_install_names");

    // Try to get the lib path from the DEP env var
    if let Ok(include) = std::env::var("DEP_GHOSTTY-VT_INCLUDE") {
        let lib_dir = include.replace("/include", "/lib");
        println!("cargo:rustc-link-arg=-Wl,-rpath,{lib_dir}");
        return;
    }

    // Fallback: scan OUT_DIR parents for the ghostty-install directory
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let build_dir = std::path::Path::new(&out_dir)
            .ancestors()
            .find(|p| p.file_name().map_or(false, |n| n == "build"))
            .map(|p| p.to_path_buf());

        if let Some(build_dir) = build_dir {
            // Look for any libghostty-vt-sys-* directory
            if let Ok(entries) = std::fs::read_dir(&build_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("libghostty-vt-sys-") {
                        let lib_dir = entry.path().join("out/ghostty-install/lib");
                        if lib_dir.exists() {
                            println!("cargo:rustc-link-arg=-Wl,-rpath,{}", lib_dir.display());
                            return;
                        }
                    }
                }
            }
        }
    }
}
