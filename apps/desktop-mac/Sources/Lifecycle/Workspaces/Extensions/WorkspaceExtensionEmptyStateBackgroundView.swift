import AppKit
import Metal
import MetalKit
import QuartzCore
import SwiftUI

struct WorkspaceExtensionEmptyStateVisualConfiguration: Equatable {
  let accentHex: String
  let backgroundHex: String
  let animationSpeed: Float
  let intensity: Float
}

func workspaceExtensionEmptyStateVisualConfiguration(
  theme: AppTheme,
  tone: WorkspaceExtensionEmptyStateTone,
  reduceMotion: Bool
) -> WorkspaceExtensionEmptyStateVisualConfiguration {
  let accentHex: String
  let animationSpeed: Float
  let intensity: Float

  switch tone {
  case .neutral:
    accentHex = theme.accent
    animationSpeed = 0.72
    intensity = 0.7
  case .warning:
    accentHex = theme.statusWarning
    animationSpeed = 0.9
    intensity = 0.94
  case .error:
    accentHex = theme.statusDanger
    animationSpeed = 0.64
    intensity = 0.82
  }

  return WorkspaceExtensionEmptyStateVisualConfiguration(
    accentHex: accentHex,
    backgroundHex: theme.background.chromeHex,
    animationSpeed: reduceMotion ? 0 : animationSpeed,
    intensity: intensity
  )
}

struct WorkspaceExtensionEmptyStateBackgroundView: NSViewRepresentable {
  let configuration: WorkspaceExtensionEmptyStateVisualConfiguration

  func makeCoordinator() -> Coordinator {
    Coordinator(configuration: configuration)
  }

  func makeNSView(context: Context) -> MTKView {
    let view = MTKView(frame: .zero, device: context.coordinator.device)
    context.coordinator.configure(view)
    return view
  }

  func updateNSView(_ nsView: MTKView, context: Context) {
    context.coordinator.update(view: nsView, configuration: configuration)
  }

  final class Coordinator: NSObject, MTKViewDelegate {
    let device: MTLDevice?

    private let configurationLock = NSLock()
    private let commandQueue: MTLCommandQueue?
    private let pipelineState: MTLRenderPipelineState?

    private var configuration: WorkspaceExtensionEmptyStateVisualConfiguration
    private var startTime = CACurrentMediaTime()

    init(configuration: WorkspaceExtensionEmptyStateVisualConfiguration) {
      self.configuration = configuration
      device = MTLCreateSystemDefaultDevice()
      commandQueue = device?.makeCommandQueue()
      pipelineState = Self.makePipelineState(device: device)
      super.init()
    }

    func configure(_ view: MTKView) {
      view.device = device
      view.delegate = self
      view.colorPixelFormat = .bgra8Unorm
      view.clearColor = clearColor(for: configuration)
      view.framebufferOnly = true
      view.enableSetNeedsDisplay = configuration.animationSpeed == 0
      view.isPaused = configuration.animationSpeed == 0
      view.preferredFramesPerSecond = 30
      view.autoResizeDrawable = true
      view.layerContentsRedrawPolicy = .duringViewResize

      if configuration.animationSpeed == 0 {
        view.draw()
      }
    }

    func update(
      view: MTKView,
      configuration nextConfiguration: WorkspaceExtensionEmptyStateVisualConfiguration
    ) {
      let previousConfiguration = currentConfiguration()

      configurationLock.lock()
      configuration = nextConfiguration
      configurationLock.unlock()

      view.clearColor = clearColor(for: nextConfiguration)

      if previousConfiguration.animationSpeed == 0, nextConfiguration.animationSpeed > 0 {
        startTime = CACurrentMediaTime()
      }

      let shouldPause = nextConfiguration.animationSpeed == 0
      view.enableSetNeedsDisplay = shouldPause
      view.isPaused = shouldPause

      if shouldPause {
        view.setNeedsDisplay(view.bounds)
        view.draw()
      }
    }

    func mtkView(_ view: MTKView, drawableSizeWillChange size: CGSize) {
      if currentConfiguration().animationSpeed == 0 {
        view.draw()
      }
    }

    func draw(in view: MTKView) {
      guard
        let pipelineState,
        let commandQueue,
        let descriptor = view.currentRenderPassDescriptor,
        let drawable = view.currentDrawable
      else {
        return
      }

      let configuration = currentConfiguration()
      var uniforms = WorkspaceExtensionEmptyStateUniforms(
        resolution: SIMD2(
          Float(max(view.drawableSize.width, 1)),
          Float(max(view.drawableSize.height, 1))
        ),
        time: configuration.animationSpeed > 0
          ? Float(CACurrentMediaTime() - startTime) * configuration.animationSpeed
          : 0,
        intensity: configuration.intensity,
        accentColor: rgbaVector(hex: configuration.accentHex),
        backgroundColor: rgbaVector(hex: configuration.backgroundHex)
      )

      descriptor.colorAttachments[0].clearColor = clearColor(for: configuration)

      guard
        let commandBuffer = commandQueue.makeCommandBuffer(),
        let encoder = commandBuffer.makeRenderCommandEncoder(descriptor: descriptor)
      else {
        return
      }

      encoder.setRenderPipelineState(pipelineState)
      encoder.setFragmentBytes(
        &uniforms,
        length: MemoryLayout<WorkspaceExtensionEmptyStateUniforms>.stride,
        index: 0
      )
      encoder.drawPrimitives(type: .triangleStrip, vertexStart: 0, vertexCount: 4)
      encoder.endEncoding()

      commandBuffer.present(drawable)
      commandBuffer.commit()
    }

    private func currentConfiguration() -> WorkspaceExtensionEmptyStateVisualConfiguration {
      configurationLock.lock()
      defer { configurationLock.unlock() }
      return configuration
    }

    private func clearColor(
      for configuration: WorkspaceExtensionEmptyStateVisualConfiguration
    ) -> MTLClearColor {
      let color = NSColor(themeHex: configuration.backgroundHex).usingColorSpace(.deviceRGB)
        ?? NSColor(themeHex: configuration.backgroundHex)
      return MTLClearColor(
        red: color.redComponent,
        green: color.greenComponent,
        blue: color.blueComponent,
        alpha: 1
      )
    }

    private func rgbaVector(hex: String, alpha: CGFloat = 1) -> SIMD4<Float> {
      let color = NSColor(themeHex: hex, alpha: alpha).usingColorSpace(.deviceRGB)
        ?? NSColor(themeHex: hex, alpha: alpha)
      return SIMD4(
        Float(color.redComponent),
        Float(color.greenComponent),
        Float(color.blueComponent),
        Float(color.alphaComponent)
      )
    }

    private static func makePipelineState(device: MTLDevice?) -> MTLRenderPipelineState? {
      guard let device else {
        return nil
      }

      do {
        let library = try device.makeLibrary(
          source: workspaceExtensionEmptyStateMetalShaderSource,
          options: nil
        )
        let descriptor = MTLRenderPipelineDescriptor()
        descriptor.vertexFunction = library.makeFunction(name: "workspaceExtensionEmptyStateVertex")
        descriptor.fragmentFunction = library.makeFunction(name: "workspaceExtensionEmptyStateFragment")
        descriptor.colorAttachments[0].pixelFormat = .bgra8Unorm
        return try device.makeRenderPipelineState(descriptor: descriptor)
      } catch {
        return nil
      }
    }
  }
}

private struct WorkspaceExtensionEmptyStateUniforms {
  var resolution: SIMD2<Float>
  var time: Float
  var intensity: Float
  var accentColor: SIMD4<Float>
  var backgroundColor: SIMD4<Float>
}

private let workspaceExtensionEmptyStateMetalShaderSource = #"""
#include <metal_stdlib>

using namespace metal;

struct VertexOut {
  float4 position [[position]];
  float2 uv;
};

struct Uniforms {
  float2 resolution;
  float time;
  float intensity;
  float4 accentColor;
  float4 backgroundColor;
};

vertex VertexOut workspaceExtensionEmptyStateVertex(uint vertexId [[vertex_id]]) {
  float2 positions[4] = {
    float2(-1.0, -1.0),
    float2( 1.0, -1.0),
    float2(-1.0,  1.0),
    float2( 1.0,  1.0)
  };

  VertexOut out;
  out.position = float4(positions[vertexId], 0.0, 1.0);
  out.uv = positions[vertexId] * 0.5 + 0.5;
  return out;
}

float hash21(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 34.45);
  return fract(p.x * p.y);
}

float noise21(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);

  float a = hash21(i);
  float b = hash21(i + float2(1.0, 0.0));
  float c = hash21(i + float2(0.0, 1.0));
  float d = hash21(i + float2(1.0, 1.0));

  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float lineMask(float2 p, float2 a, float2 b, float width) {
  float2 pa = p - a;
  float2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.0001), 0.0, 1.0);
  float d = length(pa - ba * h);
  return 1.0 - smoothstep(width, width + 0.03, d);
}

float pointMask(float2 p, float2 center, float radius) {
  return 1.0 - smoothstep(radius, radius + 0.04, length(p - center));
}

float ringMask(float2 p, float radius, float width) {
  return 1.0 - smoothstep(width, width + 0.03, abs(length(p) - radius));
}

float glyphShape(uint glyphIndex, float2 local) {
  float2 p = local * 2.0 - 1.0;
  float glyph = 0.0;

  if (glyphIndex == 0u) {
    glyph = pointMask(p, float2(0.0, -0.58), 0.14);
  } else if (glyphIndex == 1u) {
    glyph = pointMask(p, float2(0.0, 0.32), 0.12);
    glyph += pointMask(p, float2(0.0, -0.32), 0.12);
  } else if (glyphIndex == 2u) {
    glyph = lineMask(p, float2(-0.68, 0.0), float2(0.68, 0.0), 0.09);
  } else if (glyphIndex == 3u) {
    glyph = lineMask(p, float2(-0.68, 0.0), float2(0.68, 0.0), 0.09);
    glyph += lineMask(p, float2(0.0, -0.68), float2(0.0, 0.68), 0.09);
  } else if (glyphIndex == 4u) {
    glyph = lineMask(p, float2(-0.7, -0.7), float2(0.7, 0.7), 0.08);
  } else if (glyphIndex == 5u) {
    glyph = lineMask(p, float2(-0.7, 0.7), float2(0.7, -0.7), 0.08);
  } else if (glyphIndex == 6u) {
    glyph = lineMask(p, float2(-0.7, -0.7), float2(0.7, 0.7), 0.08);
    glyph += lineMask(p, float2(-0.7, 0.7), float2(0.7, -0.7), 0.08);
  } else if (glyphIndex == 7u) {
    glyph = lineMask(p, float2(-0.62, -0.36), float2(0.62, -0.36), 0.08);
    glyph += lineMask(p, float2(-0.62, 0.36), float2(0.62, 0.36), 0.08);
    glyph += lineMask(p, float2(-0.32, -0.7), float2(-0.32, 0.7), 0.08);
    glyph += lineMask(p, float2(0.32, -0.7), float2(0.32, 0.7), 0.08);
  } else if (glyphIndex == 8u) {
    glyph = ringMask(p, 0.58, 0.11);
    glyph += pointMask(p, float2(0.12, 0.02), 0.11);
    glyph += lineMask(p, float2(0.08, 0.02), float2(0.44, 0.02), 0.08);
  } else {
    glyph = lineMask(p, float2(-0.54, -0.68), float2(-0.54, 0.68), 0.08);
    glyph += lineMask(p, float2(0.54, -0.68), float2(0.54, 0.68), 0.08);
    glyph += lineMask(p, float2(-0.54, 0.68), float2(-0.16, 0.68), 0.08);
    glyph += lineMask(p, float2(-0.54, -0.68), float2(-0.16, -0.68), 0.08);
    glyph += lineMask(p, float2(0.16, 0.68), float2(0.54, 0.68), 0.08);
    glyph += lineMask(p, float2(0.16, -0.68), float2(0.54, -0.68), 0.08);
  }

  float edgeFade = 1.0 - smoothstep(0.78, 1.0, max(abs(p.x), abs(p.y)));
  return saturate(glyph) * edgeFade;
}

fragment float4 workspaceExtensionEmptyStateFragment(
  VertexOut in [[stage_in]],
  constant Uniforms& uniforms [[buffer(0)]]
) {
  float2 resolution = max(uniforms.resolution, float2(1.0));
  float2 frag = in.uv * resolution;
  float2 cellSize = float2(13.0, 18.0);
  float2 grid = frag / cellSize;
  float2 cell = floor(grid);
  float2 local = fract(grid);

  float2 centered = (frag - resolution * 0.5) / resolution.y;
  centered.y += 0.04;

  float radial = length(centered * float2(1.0, 1.12));
  float halo = 1.0 - smoothstep(0.03, 0.28, radial);
  float annulus = 1.0 - smoothstep(0.0, 0.14, abs(radial - 0.18));
  float outerFade = 1.0 - smoothstep(0.34, 0.96, radial);
  float copyProtection = smoothstep(0.08, 0.34, length(centered - float2(0.0, 0.11)));

  float drift = noise21(cell * 0.14 + float2(uniforms.time * 0.18, -uniforms.time * 0.11));
  float wave = 0.5 + 0.5 * sin(uniforms.time * 1.35 + cell.x * 0.41 + cell.y * 0.17);
  float sweep = 0.5 + 0.5 * sin((grid.y * 0.72) - uniforms.time * 4.6 + cell.x * 0.03);
  float energy = saturate(drift * 0.54 + wave * 0.26 + sweep * 0.2);
  float visibility = saturate((outerFade * 0.52 + annulus * 0.72 + halo * 0.22) * copyProtection);

  uint glyphIndex = uint(floor((energy + hash21(cell + 7.31)) * 5.2)) % 10u;
  float glyph = glyphShape(glyphIndex, local);
  float flicker = 0.92 + 0.08 * sin(uniforms.time * 7.0 + cell.y * 0.37);
  float scanline = 0.97 + 0.03 * sin(frag.y * 1.1 + uniforms.time * 5.0);
  float ascii = glyph * visibility * flicker * scanline * (0.18 + energy * 0.92) * uniforms.intensity;

  float3 accent = uniforms.accentColor.rgb;
  float3 color = uniforms.backgroundColor.rgb;
  color += accent * halo * 0.1 * uniforms.intensity;
  color += accent * annulus * 0.05 * uniforms.intensity;
  color += accent * ascii * 0.5;

  return float4(saturate(color), 1.0);
}
"""#
