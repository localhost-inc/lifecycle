// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Lifecycle",
  platforms: [
    .macOS(.v13),
  ],
  products: [
    .executable(
      name: "Lifecycle",
      targets: ["Lifecycle"]
    ),
  ],
  dependencies: [
    .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.11.1"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.11.0"),
    .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.2.0"),
  ],
  targets: [
    .binaryTarget(
      name: "GhosttyKit",
      path: ".generated/ghostty/GhosttyKit.xcframework"
    ),
    .target(
      name: "LifecycleTerminalHost",
      dependencies: ["GhosttyKit"],
      path: "Sources/LifecycleTerminalHost",
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
      name: "Lifecycle",
      dependencies: [
        "LifecycleTerminalHost",
        "LifecyclePresentation",
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
      ],
      path: "Sources/Lifecycle",
      resources: [
        .process("Resources"),
      ],
      plugins: [
        .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
      ]
    ),
    .testTarget(
      name: "LifecycleTests",
      dependencies: [
        "Lifecycle",
        "LifecyclePresentation",
      ],
      path: "Tests/LifecycleTests"
    ),
  ]
)
