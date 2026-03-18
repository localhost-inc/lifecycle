#import <AppKit/AppKit.h>
#import <WebKit/WebKit.h>
#import <dispatch/dispatch.h>
#import <stdbool.h>

#include <string.h>

// ---------------------------------------------------------------------------
// LifecycleOverlayView
//
// A transparent NSView containing a WKWebView positioned as the topmost
// sibling of the Tauri webview. It renders overlay UI (popovers, tooltips,
// menus) authored in React. Pointer events pass through everywhere except
// within declared hit regions.
// ---------------------------------------------------------------------------

#define LIFECYCLE_OVERLAY_MAX_HIT_REGIONS 32

@interface LifecycleOverlayView : NSView <WKScriptMessageHandler, WKNavigationDelegate> {
  @public
  NSUInteger _hitRegionCount;
  NSRect _hitRegions[LIFECYCLE_OVERLAY_MAX_HIT_REGIONS];
}
@property(nonatomic, strong) WKWebView *webView;
@end

static LifecycleOverlayView *gOverlayView = nil;
static NSString *gOverlayLastError = nil;

// ---------------------------------------------------------------------------
// Error helpers
// ---------------------------------------------------------------------------

static void lifecycleOverlaySetLastError(NSString *message) {
  gOverlayLastError = [message copy];
}

// ---------------------------------------------------------------------------
// LifecycleOverlayView implementation
// ---------------------------------------------------------------------------

@implementation LifecycleOverlayView

- (instancetype)initWithFrame:(NSRect)frame url:(NSURL *)url {
  self = [super initWithFrame:frame];
  if (self == nil) {
    return nil;
  }

  _hitRegionCount = 0;

  // WKWebView configuration with script message handler.
  WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
  WKUserContentController *userContent = [[WKUserContentController alloc] init];
  [userContent addScriptMessageHandler:self name:@"overlay"];
  config.userContentController = userContent;

  // Allow inline media playback, inspectable in dev builds.
  config.preferences.javaScriptCanOpenWindowsAutomatically = NO;

  self.webView = [[WKWebView alloc] initWithFrame:self.bounds configuration:config];
  self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.webView.navigationDelegate = self;

  // Transparent background — requires macOSPrivateApi: true in tauri.conf.json
  // which is already enabled. _drawsBackground is a private WKWebView API.
  @try {
    if ([self.webView respondsToSelector:@selector(_setDrawsBackground:)]) {
      [self.webView performSelector:@selector(_setDrawsBackground:) withObject:@(NO)];
    } else {
      [self.webView setValue:@(NO) forKey:@"drawsBackground"];
    }
  } @catch (NSException *exception) {
    NSLog(@"[lifecycle-overlay] failed to disable WKWebView background: %@", exception);
  }

  [self addSubview:self.webView];
  [self.webView loadRequest:[NSURLRequest requestWithURL:url]];

  self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

  // Observe window resign to auto-dismiss overlays.
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(windowDidResignKey:)
                                               name:NSWindowDidResignKeyNotification
                                             object:nil];

  return self;
}

- (void)dealloc {
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  [self.webView.configuration.userContentController removeScriptMessageHandlerForName:@"overlay"];
}

// ---------------------------------------------------------------------------
// Hit testing — pass through to views below when outside active regions.
// ---------------------------------------------------------------------------

- (NSView *)hitTest:(NSPoint)point {
  if (_hitRegionCount == 0) {
    return nil;
  }

  NSPoint local = [self convertPoint:point fromView:nil];
  for (NSUInteger i = 0; i < _hitRegionCount; i++) {
    if (NSPointInRect(local, _hitRegions[i])) {
      return [super hitTest:point];
    }
  }

  return nil;
}

// ---------------------------------------------------------------------------
// WKScriptMessageHandler — receives messages from overlay JS
// ---------------------------------------------------------------------------

- (void)userContentController:(WKUserContentController *)controller
      didReceiveScriptMessage:(WKScriptMessage *)message {
  if (![message.name isEqualToString:@"overlay"]) {
    return;
  }

  NSDictionary *body = message.body;
  if (![body isKindOfClass:[NSDictionary class]]) {
    return;
  }

  NSString *type = body[@"type"];

  if ([type isEqualToString:@"hit-regions"]) {
    [self updateHitRegions:body[@"regions"]];
  } else if ([type isEqualToString:@"dismiss-click-outside"]) {
    // Reset hit regions — overlay is now idle.
    _hitRegionCount = 0;
  }
}

- (void)updateHitRegions:(NSArray *)regions {
  _hitRegionCount = 0;

  if (![regions isKindOfClass:[NSArray class]]) {
    return;
  }

  NSUInteger count = MIN(regions.count, LIFECYCLE_OVERLAY_MAX_HIT_REGIONS);
  NSRect bounds = self.bounds;
  CGFloat viewHeight = bounds.size.height;

  for (NSUInteger i = 0; i < count; i++) {
    NSDictionary *region = regions[i];
    if (![region isKindOfClass:[NSDictionary class]]) {
      continue;
    }

    CGFloat x = [region[@"x"] doubleValue];
    CGFloat y = [region[@"y"] doubleValue];
    CGFloat width = [region[@"width"] doubleValue];
    CGFloat height = [region[@"height"] doubleValue];

    // Convert from web coordinates (origin top-left) to AppKit (origin bottom-left).
    CGFloat flippedY = viewHeight - y - height;
    _hitRegions[_hitRegionCount] = NSMakeRect(x, flippedY, width, height);
    _hitRegionCount++;
  }
}

// ---------------------------------------------------------------------------
// WKNavigationDelegate — suppress navigation errors in overlay
// ---------------------------------------------------------------------------

- (void)webView:(WKWebView *)webView
    didFailProvisionalNavigation:(WKNavigation *)navigation
                       withError:(NSError *)error {
  NSLog(@"[lifecycle-overlay] navigation failed: %@", error.localizedDescription);
}

// ---------------------------------------------------------------------------
// Window resign — auto-dismiss overlays
// ---------------------------------------------------------------------------

- (void)windowDidResignKey:(NSNotification *)notification {
  if (notification.object != self.window) {
    return;
  }

  // Clear hit regions so events pass through.
  _hitRegionCount = 0;

  // Tell the overlay webview to dismiss everything.
  [self.webView evaluateJavaScript:@"window.__lifecycleOverlayDismissAll && window.__lifecycleOverlayDismissAll()"
                 completionHandler:nil];
}

// ---------------------------------------------------------------------------
// Focus management
// ---------------------------------------------------------------------------

- (BOOL)acceptsFirstResponder {
  // Only accept focus when there are active hit regions (overlay is showing).
  return _hitRegionCount > 0;
}

- (void)mouseDown:(NSEvent *)event {
  NSPoint local = [self convertPoint:event.locationInWindow fromView:nil];
  BOOL insideRegion = NO;
  for (NSUInteger i = 0; i < _hitRegionCount; i++) {
    if (NSPointInRect(local, _hitRegions[i])) {
      insideRegion = YES;
      break;
    }
  }

  if (insideRegion) {
    [super mouseDown:event];
  } else {
    // Click outside — dismiss overlays and pass event through.
    _hitRegionCount = 0;
    [self.webView evaluateJavaScript:@"window.__lifecycleOverlayDismissAll && window.__lifecycleOverlayDismissAll()"
                   completionHandler:nil];
  }
}

@end

// ===========================================================================
// C FFI functions called from Rust
// ===========================================================================

const char *lifecycle_native_overlay_last_error(void) {
  if (gOverlayLastError == nil) {
    return NULL;
  }
  return gOverlayLastError.UTF8String;
}

bool lifecycle_native_overlay_init(void *webview_view, const char *url_string) {
  @autoreleasepool {
    @try {
      if (webview_view == NULL || url_string == NULL) {
        lifecycleOverlaySetLastError(@"Overlay init received incomplete arguments.");
        return false;
      }

      if (gOverlayView != nil) {
        // Already initialized — this is idempotent.
        return true;
      }

      NSView *webview = (__bridge NSView *)webview_view;
      NSView *container = webview.superview;
      if (container == nil) {
        lifecycleOverlaySetLastError(
            @"Tauri webview has no superview for native overlay mounting.");
        return false;
      }

      NSURL *url = [NSURL URLWithString:[NSString stringWithUTF8String:url_string]];
      if (url == nil) {
        lifecycleOverlaySetLastError(@"Invalid overlay URL.");
        return false;
      }

      // Create overlay view with the same frame as the container.
      gOverlayView = [[LifecycleOverlayView alloc] initWithFrame:container.bounds url:url];
      if (gOverlayView == nil) {
        lifecycleOverlaySetLastError(@"Failed to create overlay view.");
        return false;
      }

      // Add as the topmost sibling — above all terminal views.
      [container addSubview:gOverlayView positioned:NSWindowAbove relativeTo:nil];

      return true;
    } @catch (NSException *exception) {
      lifecycleOverlaySetLastError(
          [NSString stringWithFormat:@"Overlay init threw: %@ — %@", exception.name,
                                     exception.reason]);
      return false;
    }
  }
}

bool lifecycle_native_overlay_update_hit_regions(const char *regions_json) {
  @autoreleasepool {
    @try {
      if (gOverlayView == nil) {
        return true;
      }

      if (regions_json == NULL) {
        gOverlayView->_hitRegionCount = 0;
        return true;
      }

      NSData *jsonData = [NSData dataWithBytesNoCopy:(void *)regions_json
                                              length:strlen(regions_json)
                                        freeWhenDone:NO];
      NSError *error = nil;
      NSArray *regions = [NSJSONSerialization JSONObjectWithData:jsonData options:0 error:&error];
      if (error != nil || ![regions isKindOfClass:[NSArray class]]) {
        lifecycleOverlaySetLastError(@"Failed to parse overlay hit regions JSON.");
        return false;
      }

      [gOverlayView updateHitRegions:regions];
      return true;
    } @catch (NSException *exception) {
      lifecycleOverlaySetLastError(
          [NSString stringWithFormat:@"Overlay hit regions update threw: %@ — %@",
                                     exception.name, exception.reason]);
      return false;
    }
  }
}

bool lifecycle_native_overlay_destroy(void) {
  @autoreleasepool {
    @try {
      if (gOverlayView == nil) {
        return true;
      }

      [gOverlayView removeFromSuperview];
      gOverlayView = nil;
      return true;
    } @catch (NSException *exception) {
      lifecycleOverlaySetLastError(
          [NSString stringWithFormat:@"Overlay destroy threw: %@ — %@", exception.name,
                                     exception.reason]);
      return false;
    }
  }
}
