#import <AppKit/AppKit.h>
#import <dispatch/dispatch.h>

#include <string.h>

// MARK: - Application path resolution

static NSString *lifecycleResolveApplicationPath(NSString *applicationName) {
  if (applicationName.length == 0) {
    return nil;
  }

#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
  NSString *applicationPath = [NSWorkspace.sharedWorkspace fullPathForApplication:applicationName];
#pragma clang diagnostic pop
  if (applicationPath.length > 0) {
    return applicationPath;
  }

  return nil;
}

static const char *lifecycleCopyApplicationPathMainThread(const char *application_name) {
  if (application_name == NULL) {
    return NULL;
  }

  NSString *applicationName = [NSString stringWithUTF8String:application_name];
  if (applicationName.length == 0) {
    return NULL;
  }

  NSString *applicationPath = lifecycleResolveApplicationPath(applicationName);
  if (applicationPath.length == 0) {
    return NULL;
  }

  const char *fileSystemPath = applicationPath.fileSystemRepresentation;
  if (fileSystemPath == NULL) {
    return NULL;
  }

  return strdup(fileSystemPath);
}

const char *lifecycle_native_resolve_application_path(const char *application_name) {
  __block const char *applicationPath = NULL;
  if ([NSThread isMainThread]) {
    return lifecycleCopyApplicationPathMainThread(application_name);
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    applicationPath = lifecycleCopyApplicationPathMainThread(application_name);
  });
  return applicationPath;
}

// MARK: - Application icon

static NSString *lifecycleOpenInMenuIconCacheDirectory(void) {
  static NSString *cacheDirectory = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    NSString *baseDirectory =
        [NSTemporaryDirectory() stringByAppendingPathComponent:@"lifecycle-open-in-menu-icons"];
    [[NSFileManager defaultManager] createDirectoryAtPath:baseDirectory
                              withIntermediateDirectories:YES
                                               attributes:nil
                                                    error:nil];
    cacheDirectory = [baseDirectory copy];
  });
  return cacheDirectory;
}

static NSString *const kLifecycleOpenInMenuIconCacheVersion = @"v2";

static NSRect lifecycleOpaqueBoundsForBitmap(NSBitmapImageRep *representation,
                                             unsigned char alphaThreshold) {
  if (representation == nil || !representation.hasAlpha) {
    return NSZeroRect;
  }

  unsigned char *bitmapData = representation.bitmapData;
  if (bitmapData == NULL) {
    return NSZeroRect;
  }

  NSInteger width = representation.pixelsWide;
  NSInteger height = representation.pixelsHigh;
  NSInteger bytesPerRow = representation.bytesPerRow;
  NSInteger samplesPerPixel = representation.samplesPerPixel;
  if (width <= 0 || height <= 0 || samplesPerPixel <= 0) {
    return NSZeroRect;
  }

  NSInteger alphaOffset =
      (representation.bitmapFormat & NSBitmapFormatAlphaFirst) != 0 ? 0 : samplesPerPixel - 1;
  NSInteger minX = width;
  NSInteger minY = height;
  NSInteger maxX = -1;
  NSInteger maxY = -1;

  for (NSInteger y = 0; y < height; y += 1) {
    unsigned char *row = bitmapData + (y * bytesPerRow);
    for (NSInteger x = 0; x < width; x += 1) {
      unsigned char alpha = row[(x * samplesPerPixel) + alphaOffset];
      if (alpha <= alphaThreshold) {
        continue;
      }

      minX = MIN(minX, x);
      minY = MIN(minY, y);
      maxX = MAX(maxX, x);
      maxY = MAX(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return NSZeroRect;
  }

  NSInteger cropInset = 1;
  minX = MAX(0, minX - cropInset);
  minY = MAX(0, minY - cropInset);
  maxX = MIN(width - 1, maxX + cropInset);
  maxY = MIN(height - 1, maxY + cropInset);

  return NSMakeRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
}

static NSString *lifecycleWriteApplicationIconPNG(NSString *applicationName, uint32_t pixelSize) {
  if (applicationName.length == 0 || pixelSize == 0) {
    return nil;
  }

  NSString *applicationPath = lifecycleResolveApplicationPath(applicationName);
  if (applicationPath.length == 0) {
    return nil;
  }

  NSString *safeFileName =
      [[applicationName lowercaseString] stringByReplacingOccurrencesOfString:@"/" withString:@"-"];
  NSString *iconPath = [[lifecycleOpenInMenuIconCacheDirectory()
      stringByAppendingPathComponent:[NSString
                                        stringWithFormat:@"%@-%@-%u", safeFileName,
                                                         kLifecycleOpenInMenuIconCacheVersion,
                                                         pixelSize]]
      stringByAppendingPathExtension:@"png"];
  if ([[NSFileManager defaultManager] fileExistsAtPath:iconPath]) {
    return iconPath;
  }

  NSImage *icon = [NSWorkspace.sharedWorkspace iconForFile:applicationPath];
  if (icon == nil) {
    return nil;
  }

  CGFloat targetSize = (CGFloat)pixelSize;
  NSSize iconSize = NSMakeSize(targetSize, targetSize);
  [icon setSize:iconSize];

  NSBitmapImageRep *representation =
      [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
                                              pixelsWide:(NSInteger)pixelSize
                                              pixelsHigh:(NSInteger)pixelSize
                                           bitsPerSample:8
                                         samplesPerPixel:4
                                                hasAlpha:YES
                                                isPlanar:NO
                                          colorSpaceName:NSCalibratedRGBColorSpace
                                             bitmapFormat:0
                                              bytesPerRow:0
                                             bitsPerPixel:0];
  if (representation == nil) {
    return nil;
  }

  NSGraphicsContext *context = [NSGraphicsContext graphicsContextWithBitmapImageRep:representation];
  if (context == nil) {
    return nil;
  }

  [NSGraphicsContext saveGraphicsState];
  [NSGraphicsContext setCurrentContext:context];
  [[NSColor clearColor] setFill];
  NSRectFillUsingOperation(NSMakeRect(0, 0, targetSize, targetSize), NSCompositingOperationCopy);
  [icon drawInRect:NSMakeRect(0, 0, targetSize, targetSize)
          fromRect:NSZeroRect
         operation:NSCompositingOperationSourceOver
          fraction:1.0];
  [context flushGraphics];
  [NSGraphicsContext restoreGraphicsState];

  NSBitmapImageRep *finalRepresentation = representation;
  NSRect opaqueBounds = lifecycleOpaqueBoundsForBitmap(representation, 4);
  if (!NSIsEmptyRect(opaqueBounds) &&
      (opaqueBounds.origin.x > 1 || opaqueBounds.origin.y > 1 ||
       NSMaxX(opaqueBounds) < targetSize - 1 || NSMaxY(opaqueBounds) < targetSize - 1)) {
    NSBitmapImageRep *normalizedRepresentation =
        [[NSBitmapImageRep alloc] initWithBitmapDataPlanes:NULL
                                                pixelsWide:(NSInteger)pixelSize
                                                pixelsHigh:(NSInteger)pixelSize
                                             bitsPerSample:8
                                           samplesPerPixel:4
                                                  hasAlpha:YES
                                                  isPlanar:NO
                                            colorSpaceName:NSCalibratedRGBColorSpace
                                               bitmapFormat:0
                                                bytesPerRow:0
                                               bitsPerPixel:0];
    if (normalizedRepresentation != nil) {
      NSGraphicsContext *normalizedContext =
          [NSGraphicsContext graphicsContextWithBitmapImageRep:normalizedRepresentation];
      if (normalizedContext != nil) {
        NSImage *normalizedSource = [[NSImage alloc] initWithSize:iconSize];
        [normalizedSource addRepresentation:representation];

        [NSGraphicsContext saveGraphicsState];
        [NSGraphicsContext setCurrentContext:normalizedContext];
        [normalizedContext setImageInterpolation:NSImageInterpolationHigh];
        [[NSColor clearColor] setFill];
        NSRectFillUsingOperation(NSMakeRect(0, 0, targetSize, targetSize),
                                 NSCompositingOperationCopy);
        [normalizedSource drawInRect:NSMakeRect(0, 0, targetSize, targetSize)
                            fromRect:opaqueBounds
                           operation:NSCompositingOperationSourceOver
                            fraction:1.0];
        [normalizedContext flushGraphics];
        [NSGraphicsContext restoreGraphicsState];
        finalRepresentation = normalizedRepresentation;
      }
    }
  }

  NSData *pngData = [finalRepresentation representationUsingType:NSBitmapImageFileTypePNG
                                                      properties:@{}];
  if (pngData == nil) {
    return nil;
  }

  if (![pngData writeToFile:iconPath atomically:YES]) {
    return nil;
  }

  return iconPath;
}

static const char *lifecycleCopyApplicationIconPNGPathMainThread(const char *application_name,
                                                                 uint32_t pixel_size) {
  if (application_name == NULL || pixel_size == 0) {
    return NULL;
  }

  NSString *applicationName = [NSString stringWithUTF8String:application_name];
  if (applicationName.length == 0) {
    return NULL;
  }

  NSString *iconPath = lifecycleWriteApplicationIconPNG(applicationName, pixel_size);
  if (iconPath.length == 0) {
    return NULL;
  }

  const char *fileSystemPath = iconPath.fileSystemRepresentation;
  if (fileSystemPath == NULL) {
    return NULL;
  }

  return strdup(fileSystemPath);
}

const char *lifecycle_native_copy_application_icon_png_path(const char *application_name,
                                                            uint32_t pixel_size) {
  __block const char *iconPath = NULL;
  if ([NSThread isMainThread]) {
    return lifecycleCopyApplicationIconPNGPathMainThread(application_name, pixel_size);
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    iconPath = lifecycleCopyApplicationIconPNGPathMainThread(application_name, pixel_size);
  });
  return iconPath;
}
