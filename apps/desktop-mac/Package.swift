// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "LifecycleMac",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(
      name: "lifecycle-macos",
      targets: ["LifecycleApp"]
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
    .target(
      name: "LifecyclePresentation",
      path: "Sources/LifecyclePresentation"
    ),
    .executableTarget(
      name: "LifecycleApp",
      dependencies: [
        "LifecycleGhosttyHost",
        "LifecyclePresentation",
      ],
      path: "Sources/LifecycleApp",
      resources: [
        .process("Resources"),
      ]
    ),
    .testTarget(
      name: "LifecycleAppTests",
      dependencies: [
        "LifecycleApp",
        "LifecyclePresentation",
      ],
      path: "Tests/LifecycleAppTests"
    ),
  ]
)
