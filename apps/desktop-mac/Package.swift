// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "LifecycleDesktopMac",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(
      name: "lifecycle-desktop-mac",
      targets: ["LifecycleDesktopMac"]
    ),
  ],
  targets: [
    .binaryTarget(
      name: "GhosttyKit",
      path: ".generated/ghostty/GhosttyKit.xcframework"
    ),
    .target(
      name: "LifecycleGhosttyHost",
      dependencies: ["GhosttyKit"],
      path: "Sources/LifecycleGhosttyHost",
      publicHeadersPath: "include",
      cSettings: [
        .headerSearchPath("include"),
        .headerSearchPath(".generated/ghostty/GhosttyKit.xcframework/macos-arm64/Headers"),
      ],
      linkerSettings: [
        .linkedLibrary("c++"),
        .linkedFramework("AppKit"),
        .linkedFramework("ApplicationServices"),
        .linkedFramework("Carbon"),
        .linkedFramework("CoreGraphics"),
        .linkedFramework("CoreText"),
        .linkedFramework("Foundation"),
        .linkedFramework("IOSurface"),
        .linkedFramework("Metal"),
        .linkedFramework("QuartzCore"),
        .linkedFramework("UniformTypeIdentifiers"),
      ]
    ),
    .executableTarget(
      name: "LifecycleDesktopMac",
      dependencies: ["LifecycleGhosttyHost"],
      path: "Sources/LifecycleDesktopMac",
      resources: [
        .process("Resources"),
      ]
    ),
    .testTarget(
      name: "LifecycleDesktopMacTests",
      dependencies: ["LifecycleDesktopMac"],
      path: "Tests/LifecycleDesktopMacTests"
    ),
  ]
)
