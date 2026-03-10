#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#import <QuartzCore/QuartzCore.h>
#import <dispatch/dispatch.h>
#import <stdbool.h>

#include <fcntl.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

#include "ghostty.h"

typedef void (*LifecycleNativeTerminalExitCallback)(const char *terminal_id, int32_t exit_code);
typedef void (*LifecycleNativeWorkspaceShortcutCallback)(const char *terminal_id,
                                                         int32_t shortcut_kind,
                                                         int32_t shortcut_index);
char *lifecycle_native_terminal_prepare_paste_image(const char *terminal_id, const char *file_name,
                                                    const char *media_type,
                                                    const uint8_t *bytes, size_t bytes_len);
void lifecycle_native_terminal_free_string(char *value);

typedef struct {
  const char *terminal_id;
  const char *working_directory;
  const char *command;
  const char *background_color;
  const char *theme_config_path;
  double x;
  double y;
  double width;
  double height;
  double font_size;
  double scale_factor;
  bool focused;
  bool pointer_passthrough;
  bool hidden;
  bool dark;
} LifecycleNativeTerminalConfig;

@class LifecycleNativeTerminalView;
static LifecycleNativeTerminalView *lifecycleTerminalViewForSurface(ghostty_surface_t surface);
static BOOL lifecycleNativeTerminalHandleWorkspaceShortcut(LifecycleNativeTerminalView *view,
                                                           NSEvent *event);

static ghostty_app_t gGhosttyApp = NULL;
static ghostty_config_t gGhosttyConfig = NULL;
static LifecycleNativeTerminalExitCallback gExitCallback = NULL;
static LifecycleNativeWorkspaceShortcutCallback gWorkspaceShortcutCallback = NULL;
static NSMutableDictionary<NSString *, NSView *> *gTerminalViews;
static NSString *gLastError;
static NSString *gDiagnosticsLogPath;
static int gDiagnosticsLogFd = -1;

static const int32_t kLifecycleShortcutPreviousTab = 1;
static const int32_t kLifecycleShortcutNextTab = 2;
static const int32_t kLifecycleShortcutCloseActiveTab = 3;
static const int32_t kLifecycleShortcutSelectTabIndex = 4;
static const int32_t kLifecycleShortcutNewTab = 5;

static void lifecycleWriteDiagnosticUTF8(const char *value, size_t length) {
  if (value == NULL || length == 0) {
    return;
  }

  if (gDiagnosticsLogFd >= 0) {
    (void)write(gDiagnosticsLogFd, value, length);
  }
  (void)write(STDERR_FILENO, value, length);
}

static void lifecycleAppendDiagnosticLine(NSString *message) {
  if (message.length == 0) {
    return;
  }

  NSString *line = [NSString stringWithFormat:@"%@\n", message];
  const char *utf8 = line.UTF8String;
  if (utf8 == NULL) {
    return;
  }

  lifecycleWriteDiagnosticUTF8(utf8, strlen(utf8));
}

static NSString *lifecycleDebugString(NSString *value) {
  if (value == nil) {
    return @"<nil>";
  }

  return [[[value stringByReplacingOccurrencesOfString:@"\\" withString:@"\\\\"]
      stringByReplacingOccurrencesOfString:@"\n" withString:@"\\n"]
      stringByReplacingOccurrencesOfString:@"\r" withString:@"\\r"];
}

static size_t lifecycleWriteSignalNumber(char *buffer, size_t capacity, int signalNumber) {
  if (capacity == 0) {
    return 0;
  }

  if (signalNumber == 0) {
    buffer[0] = '0';
    return 1;
  }

  char reversed[32];
  size_t reversedLength = 0;
  int value = signalNumber;
  while (value > 0 && reversedLength < sizeof(reversed)) {
    reversed[reversedLength++] = (char)('0' + (value % 10));
    value /= 10;
  }

  size_t length = 0;
  while (length < reversedLength && length < capacity) {
    buffer[length] = reversed[reversedLength - length - 1];
    length += 1;
  }

  return length;
}

static void lifecycleNativeTerminalSignalHandler(int signalNumber) {
  static const char prefix[] = "[signal] Lifecycle received fatal signal ";
  static const char suffix[] = "\n";
  lifecycleWriteDiagnosticUTF8(prefix, sizeof(prefix) - 1);

  char numberBuffer[32];
  size_t numberLength = lifecycleWriteSignalNumber(numberBuffer, sizeof(numberBuffer), signalNumber);
  lifecycleWriteDiagnosticUTF8(numberBuffer, numberLength);
  lifecycleWriteDiagnosticUTF8(suffix, sizeof(suffix) - 1);

  signal(signalNumber, SIG_DFL);
  kill(getpid(), signalNumber);
}

static void lifecycleInstallSignalHandler(int signalNumber) {
  struct sigaction action;
  memset(&action, 0, sizeof(action));
  action.sa_handler = lifecycleNativeTerminalSignalHandler;
  sigemptyset(&action.sa_mask);
  action.sa_flags = SA_RESETHAND;
  sigaction(signalNumber, &action, NULL);
}

static void lifecycleNativeTerminalUncaughtExceptionHandler(NSException *exception) {
  NSString *name = exception.name ?: @"NSException";
  NSString *reason = exception.reason ?: @"(no reason provided)";
  lifecycleAppendDiagnosticLine(
      [NSString stringWithFormat:@"[exception] %@ (%@)", reason, name]);
}

static void lifecycleSetLastError(NSString *error) {
  gLastError = [error copy];
}

static void lifecycleSetLastErrorFromException(NSString *context, NSException *exception) {
  NSString *name = exception.name ?: @"NSException";
  NSString *reason = exception.reason ?: @"(no reason provided)";
  lifecycleSetLastError([NSString stringWithFormat:@"%@: %@ (%@)", context, reason, name]);
}

static BOOL lifecycleIsHexColorString(NSString *value) {
  if (value.length != 7 || ![value hasPrefix:@"#"]) {
    return NO;
  }

  NSCharacterSet *hexDigits =
      [NSCharacterSet characterSetWithCharactersInString:@"0123456789abcdefABCDEF"];
  for (NSUInteger index = 1; index < value.length; index += 1) {
    if (![hexDigits characterIsMember:[value characterAtIndex:index]]) {
      return NO;
    }
  }

  return YES;
}

static NSColor *lifecycleColorFromHexString(NSString *value) {
  unsigned int color = 0;
  if (![[NSScanner scannerWithString:[value substringFromIndex:1]] scanHexInt:&color]) {
    return nil;
  }

  CGFloat red = ((color >> 16) & 0xFF) / 255.0;
  CGFloat green = ((color >> 8) & 0xFF) / 255.0;
  CGFloat blue = (color & 0xFF) / 255.0;
  return [NSColor colorWithSRGBRed:red green:green blue:blue alpha:1.0];
}

static ghostty_input_mods_e lifecycleGhosttyMods(NSEventModifierFlags flags) {
  uint32_t mods = GHOSTTY_MODS_NONE;
  if ((flags & NSEventModifierFlagShift) != 0) mods |= GHOSTTY_MODS_SHIFT;
  if ((flags & NSEventModifierFlagControl) != 0) mods |= GHOSTTY_MODS_CTRL;
  if ((flags & NSEventModifierFlagOption) != 0) mods |= GHOSTTY_MODS_ALT;
  if ((flags & NSEventModifierFlagCommand) != 0) mods |= GHOSTTY_MODS_SUPER;
  if ((flags & NSEventModifierFlagCapsLock) != 0) mods |= GHOSTTY_MODS_CAPS;

  const NSEventModifierFlags rawFlags = flags;
  if ((rawFlags & NX_DEVICERSHIFTKEYMASK) != 0) mods |= GHOSTTY_MODS_SHIFT_RIGHT;
  if ((rawFlags & NX_DEVICERCTLKEYMASK) != 0) mods |= GHOSTTY_MODS_CTRL_RIGHT;
  if ((rawFlags & NX_DEVICERALTKEYMASK) != 0) mods |= GHOSTTY_MODS_ALT_RIGHT;
  if ((rawFlags & NX_DEVICERCMDKEYMASK) != 0) mods |= GHOSTTY_MODS_SUPER_RIGHT;

  return (ghostty_input_mods_e)mods;
}

static NSEventModifierFlags lifecycleEventModifierFlags(ghostty_input_mods_e mods) {
  NSEventModifierFlags flags = 0;
  if ((mods & GHOSTTY_MODS_SHIFT) != 0) flags |= NSEventModifierFlagShift;
  if ((mods & GHOSTTY_MODS_CTRL) != 0) flags |= NSEventModifierFlagControl;
  if ((mods & GHOSTTY_MODS_ALT) != 0) flags |= NSEventModifierFlagOption;
  if ((mods & GHOSTTY_MODS_SUPER) != 0) flags |= NSEventModifierFlagCommand;
  return flags;
}

static NSEvent *lifecycleGhosttyTranslationEvent(ghostty_surface_t surface, NSEvent *event) {
  if (surface == NULL) {
    return event;
  }

  ghostty_input_mods_e translatedGhosttyMods =
      ghostty_surface_key_translation_mods(surface, lifecycleGhosttyMods(event.modifierFlags));
  NSEventModifierFlags translatedFlags = lifecycleEventModifierFlags(translatedGhosttyMods);
  NSEventModifierFlags modifierFlags = event.modifierFlags;

  const NSEventModifierFlags handledFlags =
      NSEventModifierFlagShift | NSEventModifierFlagControl | NSEventModifierFlagOption |
      NSEventModifierFlagCommand;
  modifierFlags &= ~handledFlags;
  modifierFlags |= translatedFlags;

  if (modifierFlags == event.modifierFlags) {
    return event;
  }

  NSString *characters = [event charactersByApplyingModifiers:modifierFlags] ?: @"";
  NSString *charactersIgnoringModifiers = event.charactersIgnoringModifiers ?: @"";
  NSEvent *translatedEvent =
      [NSEvent keyEventWithType:event.type
                       location:event.locationInWindow
                  modifierFlags:modifierFlags
                      timestamp:event.timestamp
                   windowNumber:event.windowNumber
                        context:nil
                     characters:characters
    charactersIgnoringModifiers:charactersIgnoringModifiers
                      isARepeat:event.isARepeat
                        keyCode:event.keyCode];
  return translatedEvent ?: event;
}

static const char *lifecycleGhosttyTextForEvent(NSEvent *event, NSString **storage) {
  NSString *characters = event.characters;
  if (characters.length == 0) {
    return NULL;
  }

  if (characters.length == 1) {
    unichar scalar = [characters characterAtIndex:0];
    if (scalar < 0x20) {
      NSString *withoutControl =
          [event charactersByApplyingModifiers:(event.modifierFlags & ~NSEventModifierFlagControl)];
      if (withoutControl.length == 0) {
        return NULL;
      }
      *storage = withoutControl;
      return (*storage).UTF8String;
    }

    if (scalar >= 0xF700 && scalar <= 0xF8FF) {
      return NULL;
    }
  }

  *storage = characters;
  return (*storage).UTF8String;
}

static BOOL lifecycleGhosttyTextIsPrintable(NSString *text) {
  if (text.length == 0) {
    return NO;
  }

  if (text.length == 1) {
    unichar scalar = [text characterAtIndex:0];
    if (scalar < 0x20) {
      return NO;
    }

    if (scalar >= 0xF700 && scalar <= 0xF8FF) {
      return NO;
    }
  }

  return YES;
}

static void lifecycleGhosttySendText(ghostty_surface_t surface, NSString *text) {
  if (surface == NULL || text.length == 0) {
    return;
  }

  const char *utf8 = text.UTF8String;
  if (utf8 == NULL) {
    return;
  }

  @try {
    ghostty_surface_text(surface, utf8, strlen(utf8));
  } @catch (NSException *exception) {
    NSString *name = exception.name ?: @"NSException";
    NSString *reason = exception.reason ?: @"(no reason provided)";
    lifecycleAppendDiagnosticLine(
        [NSString stringWithFormat:@"[exception] native terminal text input threw: %@ (%@)",
                                   reason, name]);
  }
}

static ghostty_input_key_s lifecycleGhosttyKeyEvent(NSEvent *event,
                                                    ghostty_input_action_e action,
                                                    NSEventModifierFlags translationFlags) {
  ghostty_input_key_s keyEvent = {0};
  keyEvent.action = action;
  keyEvent.mods = lifecycleGhosttyMods(event.modifierFlags);
  keyEvent.consumed_mods =
      lifecycleGhosttyMods(translationFlags & ~(NSEventModifierFlagControl | NSEventModifierFlagCommand));
  keyEvent.keycode = event.keyCode;
  keyEvent.text = NULL;
  keyEvent.composing = false;
  keyEvent.unshifted_codepoint = 0;

  if (event.type == NSEventTypeKeyDown || event.type == NSEventTypeKeyUp) {
    NSString *unshifted = [event charactersByApplyingModifiers:0];
    if (unshifted.length > 0) {
      keyEvent.unshifted_codepoint = [unshifted characterAtIndex:0];
    }
  }

  return keyEvent;
}

static BOOL lifecycleGhosttyKeyAction(ghostty_surface_t surface,
                                      ghostty_input_action_e action,
                                      NSEvent *event,
                                      NSEvent *translationEvent,
                                      NSString *text,
                                      BOOL composing) {
  if (surface == NULL || event == nil) {
    return NO;
  }

  id view = lifecycleTerminalViewForSurface(surface);
  NSString *terminalId = @"<unknown>";
  if (view != nil) {
    NSString *viewTerminalId = [view valueForKey:@"terminalId"];
    if (viewTerminalId.length > 0) {
      terminalId = viewTerminalId;
    }
  }
  ghostty_input_key_s keyEvent =
      lifecycleGhosttyKeyEvent(event, action,
                               translationEvent == nil ? event.modifierFlags
                                                       : translationEvent.modifierFlags);
  keyEvent.composing = composing;

  NSData *utf8Data = nil;
  NSUInteger textLength = text.length;
  NSUInteger utf8Length = 0;
  unsigned int firstByte = 0;
  if (textLength > 0) {
    utf8Data = [text dataUsingEncoding:NSUTF8StringEncoding allowLossyConversion:NO];
    utf8Length = utf8Data.length;
    if (utf8Length > 0) {
      const unsigned char *bytes = (const unsigned char *)utf8Data.bytes;
      firstByte = bytes[0];
      if (firstByte >= 0x20 && lifecycleGhosttyTextIsPrintable(text)) {
        keyEvent.text = (const char *)bytes;
      }
    }
  }

  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:
          @"[key-action] terminal=%@ action=%d keycode=%hu mods=0x%lx consumed=0x%x "
          @"textLen=%lu utf8Len=%lu firstByte=0x%02x text=%@ composing=%d before-call",
          terminalId, action, (unsigned short)event.keyCode, (unsigned long)event.modifierFlags,
          keyEvent.consumed_mods, (unsigned long)textLength,
          (unsigned long)utf8Length, firstByte, lifecycleDebugString(text), composing]);
  BOOL handled = NO;
  @try {
    handled = ghostty_surface_key(surface, keyEvent);
  } @catch (NSException *exception) {
    NSString *name = exception.name ?: @"NSException";
    NSString *reason = exception.reason ?: @"(no reason provided)";
    lifecycleAppendDiagnosticLine(
        [NSString stringWithFormat:@"[exception] native terminal key input threw: %@ (%@)",
                                   reason, name]);
    handled = NO;
  }
  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:
          @"[key-action] terminal=%@ action=%d keycode=%hu mods=0x%lx consumed=0x%x "
          @"textLen=%lu utf8Len=%lu firstByte=0x%02x text=%@ composing=%d handled=%d",
          terminalId, action, (unsigned short)event.keyCode, (unsigned long)event.modifierFlags,
          keyEvent.consumed_mods, (unsigned long)textLength,
          (unsigned long)utf8Length, firstByte, lifecycleDebugString(text), composing, handled]);
  return handled;
}

@interface LifecycleNativeTerminalView : NSView <NSTextInputClient>
@property(nonatomic, readonly) NSString *terminalId;
@property(nonatomic, assign) ghostty_surface_t surface;
@property(nonatomic, copy) NSString *appliedBackgroundColor;
@property(nonatomic, copy) NSString *appliedThemeConfigPath;
@property(nonatomic, strong) NSMutableAttributedString *markedText;
@property(nonatomic, strong) NSMutableArray<NSString *> *keyTextAccumulator;
@property(nonatomic, strong) NSNumber *lastPerformKeyEvent;
@property(nonatomic, assign) BOOL reportedExit;
@property(nonatomic, assign) BOOL wantsFocus;
@property(nonatomic, assign) BOOL pointerPassthrough;
@property(nonatomic, assign) NSUInteger focusRequestGeneration;
@property(nonatomic, assign) NSUInteger lastSurfaceWidth;
@property(nonatomic, assign) NSUInteger lastSurfaceHeight;
@property(nonatomic, weak) NSWindow *observedWindow;
@end

static BOOL lifecycleWindowFirstResponderBelongsToView(NSWindow *window, NSView *view) {
  if (window == nil || view == nil) {
    return NO;
  }

  NSResponder *firstResponder = window.firstResponder;
  if (firstResponder == (NSResponder *)view) {
    return YES;
  }

  if (![firstResponder isKindOfClass:[NSView class]]) {
    return NO;
  }

  return [(NSView *)firstResponder isDescendantOf:view];
}

static BOOL lifecycleEventMatchesPasteShortcut(NSEvent *event) {
  if (event.type != NSEventTypeKeyDown) {
    return NO;
  }

  NSString *charactersIgnoringModifiers =
      event.charactersIgnoringModifiers.lowercaseString ?: @"";
  if (![charactersIgnoringModifiers isEqualToString:@"v"]) {
    return NO;
  }

  NSEventModifierFlags deviceIndependentFlags =
      event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
  const NSEventModifierFlags required = NSEventModifierFlagCommand;
  const NSEventModifierFlags disallowed =
      NSEventModifierFlagControl | NSEventModifierFlagOption;
  return (deviceIndependentFlags & required) == required &&
         (deviceIndependentFlags & disallowed) == 0;
}

static NSData *lifecycleNativeTerminalPNGDataForPasteboard(NSPasteboard *pasteboard) {
  if (pasteboard == nil) {
    return nil;
  }

  NSImage *image = [[NSImage alloc] initWithPasteboard:pasteboard];
  if (image == nil) {
    return nil;
  }

  CGImageRef cgImage = [image CGImageForProposedRect:NULL context:nil hints:nil];
  if (cgImage == NULL) {
    return nil;
  }

  NSBitmapImageRep *bitmap = [[NSBitmapImageRep alloc] initWithCGImage:cgImage];
  if (bitmap == nil) {
    return nil;
  }

  return [bitmap representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
}

static BOOL lifecycleGhosttyAppShouldBeFocused(void) {
  for (NSView *candidateView in gTerminalViews.allValues) {
    if (![candidateView isKindOfClass:[LifecycleNativeTerminalView class]]) {
      continue;
    }

    LifecycleNativeTerminalView *terminalView = (LifecycleNativeTerminalView *)candidateView;
    if (terminalView.hidden || !terminalView.wantsFocus) {
      continue;
    }

    NSWindow *window = terminalView.window;
    if (window != nil && window.isKeyWindow) {
      return YES;
    }
  }

  return NO;
}

@implementation LifecycleNativeTerminalView

- (instancetype)initWithTerminalId:(NSString *)terminalId {
  self = [super initWithFrame:NSMakeRect(0, 0, 800, 600)];
  if (!self) {
    return nil;
  }

  _terminalId = [terminalId copy];
  _appliedBackgroundColor = nil;
  _appliedThemeConfigPath = nil;
  _markedText = [[NSMutableAttributedString alloc] init];
  _keyTextAccumulator = nil;
  _lastPerformKeyEvent = nil;
  _reportedExit = NO;
  _wantsFocus = NO;
  _pointerPassthrough = NO;
  _focusRequestGeneration = 0;
  _lastSurfaceWidth = 0;
  _lastSurfaceHeight = 0;

  self.wantsLayer = YES;
  self.layer = [CAMetalLayer layer];
  self.layerContentsRedrawPolicy = NSViewLayerContentsRedrawNever;
  // Let AppKit stretch the sibling overlay during native live-resize/zoom
  // animations. The webview still sends the exact final frame afterward.
  self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.autoresizesSubviews = NO;

  [self updateTrackingAreas];
  return self;
}

- (BOOL)acceptsFirstResponder {
  return YES;
}

- (BOOL)acceptsFirstMouse:(NSEvent *)event {
  (void)event;
  return YES;
}

- (BOOL)isOpaque {
  return YES;
}

- (BOOL)mouseDownCanMoveWindow {
  return NO;
}

- (NSView *)hitTest:(NSPoint)point {
  if (self.pointerPassthrough) {
    return nil;
  }

  return [super hitTest:point];
}

- (void)dealloc {
  [self unregisterWindowNotifications];
  if (_surface != NULL) {
    ghostty_surface_free(_surface);
    _surface = NULL;
  }
}

- (void)syncSurfaceGeometry {
  if (self.surface == NULL) {
    return;
  }

  const NSRect bounds = self.bounds;
  if (bounds.size.width <= 0 || bounds.size.height <= 0) {
    return;
  }

  NSSize backingSize = [self convertSizeToBacking:bounds.size];
  NSUInteger width = (NSUInteger)llround(backingSize.width);
  NSUInteger height = (NSUInteger)llround(backingSize.height);
  if (width == self.lastSurfaceWidth && height == self.lastSurfaceHeight) {
    return;
  }

  ghostty_surface_set_size(self.surface, (uint32_t)width, (uint32_t)height);
  self.lastSurfaceWidth = width;
  self.lastSurfaceHeight = height;
}

- (void)syncContentScale {
  if (self.surface == NULL) {
    return;
  }

  NSScreen *screen = self.window.screen ?: NSScreen.mainScreen;
  const double scaleFactor = screen ? screen.backingScaleFactor : 2.0;
  ghostty_surface_set_content_scale(self.surface, scaleFactor, scaleFactor);
  self.layer.contentsScale = scaleFactor;
}

- (void)setFrame:(NSRect)frameRect {
  [super setFrame:frameRect];
  [self syncSurfaceGeometry];
}

- (void)viewDidMoveToWindow {
  [super viewDidMoveToWindow];
  [self registerWindowNotifications];
  [self syncContentScale];
  [self syncGhosttyFocusState];
  [self requestFocusIfNeeded];
}

- (void)viewDidChangeBackingProperties {
  [super viewDidChangeBackingProperties];
  [self syncContentScale];
}

- (void)viewWillMoveToWindow:(NSWindow *)newWindow {
  [self unregisterWindowNotifications];
  [super viewWillMoveToWindow:newWindow];
}

- (BOOL)becomeFirstResponder {
  BOOL became = [super becomeFirstResponder];
  if (became) {
    [self syncGhosttyFocusState];
  }
  return became;
}

- (BOOL)resignFirstResponder {
  BOOL resigned = [super resignFirstResponder];
  if (resigned) {
    [self syncGhosttyFocusState];
  }
  return resigned;
}

- (void)setHidden:(BOOL)hidden {
  [super setHidden:hidden];
  [self syncGhosttyFocusState];
  if (!hidden) {
    [self requestFocusIfNeeded];
  }
}

- (void)registerWindowNotifications {
  NSWindow *window = self.window;
  if (window == nil || self.observedWindow == window) {
    return;
  }

  self.observedWindow = window;
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:self
             selector:@selector(windowDidBecomeKey:)
                 name:NSWindowDidBecomeKeyNotification
               object:window];
  [center addObserver:self
             selector:@selector(windowDidResignKey:)
                 name:NSWindowDidResignKeyNotification
               object:window];
}

- (void)unregisterWindowNotifications {
  NSWindow *window = self.observedWindow;
  if (window == nil) {
    return;
  }

  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center removeObserver:self name:NSWindowDidBecomeKeyNotification object:window];
  [center removeObserver:self name:NSWindowDidResignKeyNotification object:window];
  self.observedWindow = nil;
}

- (void)windowDidBecomeKey:(NSNotification *)notification {
  (void)notification;
  [self syncGhosttyFocusState];
  [self requestFocusIfNeeded];
}

- (void)windowDidResignKey:(NSNotification *)notification {
  (void)notification;
  [self syncGhosttyFocusState];
}

- (void)syncGhosttyFocusState {
  BOOL windowFocused = self.window != nil && self.window.isKeyWindow;
  BOOL wantsSurfaceFocus = self.wantsFocus && !self.hidden && !self.pointerPassthrough &&
                           windowFocused;
  BOOL surfaceFocused =
      wantsSurfaceFocus && lifecycleWindowFirstResponderBelongsToView(self.window, self);

  if (self.surface != NULL) {
    ghostty_surface_set_focus(self.surface, surfaceFocused);
  }
  if (gGhosttyApp != NULL) {
    ghostty_app_set_focus(gGhosttyApp, lifecycleGhosttyAppShouldBeFocused());
  }
}

- (void)requestFocusIfNeeded {
  if (!self.wantsFocus || self.hidden || self.pointerPassthrough) {
    self.focusRequestGeneration += 1;
    NSWindow *window = self.window;
    if (window != nil && window.firstResponder == self) {
      [window makeFirstResponder:nil];
    }
    [self syncGhosttyFocusState];
    return;
  }

  NSWindow *window = self.window;
  if (window == nil) {
    return;
  }

  self.focusRequestGeneration += 1;
  const NSUInteger generation = self.focusRequestGeneration;
  __weak typeof(self) weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    LifecycleNativeTerminalView *strongSelf = weakSelf;
    if (strongSelf == nil || strongSelf.focusRequestGeneration != generation || !strongSelf.wantsFocus ||
        strongSelf.hidden) {
      return;
    }

    NSWindow *focusWindow = strongSelf.window;
    if (focusWindow == nil || !focusWindow.isKeyWindow) {
      return;
    }

    if (focusWindow.firstResponder != strongSelf) {
      [focusWindow makeFirstResponder:strongSelf];
    }
    [strongSelf syncGhosttyFocusState];

    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(20 * NSEC_PER_MSEC)),
                   dispatch_get_main_queue(), ^{
                     LifecycleNativeTerminalView *retrySelf = weakSelf;
                     if (retrySelf == nil || retrySelf.focusRequestGeneration != generation ||
                         !retrySelf.wantsFocus || retrySelf.hidden) {
                       return;
                     }

                     NSWindow *retryWindow = retrySelf.window;
                     if (retryWindow == nil || !retryWindow.isKeyWindow ||
                         retryWindow.firstResponder == retrySelf) {
                       [retrySelf syncGhosttyFocusState];
                       return;
                     }

                     [retryWindow makeFirstResponder:retrySelf];
                     [retrySelf syncGhosttyFocusState];
                   });
  });
}

- (void)updateTrackingAreas {
  for (NSTrackingArea *trackingArea in self.trackingAreas) {
    [self removeTrackingArea:trackingArea];
  }

  NSTrackingAreaOptions options = NSTrackingMouseEnteredAndExited | NSTrackingMouseMoved |
                                  NSTrackingActiveAlways | NSTrackingInVisibleRect;
  [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:self.bounds
                                                     options:options
                                                       owner:self
                                                    userInfo:nil]];
}

- (void)mouseMoved:(NSEvent *)event {
  if (self.surface == NULL) {
    return;
  }

  NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
  ghostty_surface_mouse_pos(self.surface, point.x, self.bounds.size.height - point.y,
                            lifecycleGhosttyMods(event.modifierFlags));
}

- (void)mouseEntered:(NSEvent *)event {
  [self mouseMoved:event];
}

- (void)mouseExited:(NSEvent *)event {
  (void)event;
  if (self.surface == NULL) {
    return;
  }

  ghostty_surface_mouse_pos(self.surface, -1, -1, GHOSTTY_MODS_NONE);
}

- (void)mouseDragged:(NSEvent *)event {
  [self mouseMoved:event];
}

- (void)rightMouseDragged:(NSEvent *)event {
  [self mouseMoved:event];
}

- (void)otherMouseDragged:(NSEvent *)event {
  [self mouseMoved:event];
}

- (void)mouseDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super mouseDown:event];
    return;
  }

  [[self window] makeFirstResponder:self];
  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_LEFT,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)mouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super mouseUp:event];
    return;
  }

  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_LEFT,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)rightMouseDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super rightMouseDown:event];
    return;
  }

  [[self window] makeFirstResponder:self];
  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_RIGHT,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)rightMouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super rightMouseUp:event];
    return;
  }

  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_RIGHT,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)otherMouseDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super otherMouseDown:event];
    return;
  }

  [[self window] makeFirstResponder:self];
  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_MIDDLE,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)otherMouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super otherMouseUp:event];
    return;
  }

  ghostty_surface_mouse_button(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_MIDDLE,
                               lifecycleGhosttyMods(event.modifierFlags));
  [self mouseMoved:event];
}

- (void)scrollWheel:(NSEvent *)event {
  if (self.surface == NULL) {
    [super scrollWheel:event];
    return;
  }

  double deltaX = event.scrollingDeltaX;
  double deltaY = event.scrollingDeltaY;
  if (event.hasPreciseScrollingDeltas) {
    deltaX *= 2.0;
    deltaY *= 2.0;
  }

  ghostty_surface_mouse_scroll(self.surface, deltaX, deltaY,
                               lifecycleGhosttyMods(event.modifierFlags));
}

- (BOOL)performKeyEquivalent:(NSEvent *)event {
  if (event.type != NSEventTypeKeyDown) {
    return NO;
  }

  BOOL focused = self.window != nil && self.window.isKeyWindow &&
                 lifecycleWindowFirstResponderBelongsToView(self.window, self);
  if (!focused || self.surface == NULL) {
    return NO;
  }

  if (lifecycleNativeTerminalHandleWorkspaceShortcut(self, event)) {
    return YES;
  }

  if (lifecycleEventMatchesPasteShortcut(event)) {
    [self paste:nil];
    return YES;
  }

  ghostty_input_key_s bindingEvent =
      lifecycleGhosttyKeyEvent(event, GHOSTTY_ACTION_PRESS, event.modifierFlags);
  NSString *bindingText = event.characters ?: @"";
  if (bindingText.length > 0) {
    bindingEvent.text = bindingText.UTF8String;
  }

  ghostty_binding_flags_e bindingFlags = 0;
  if (ghostty_surface_key_is_binding(self.surface, bindingEvent, &bindingFlags)) {
    BOOL consumed = (bindingFlags & GHOSTTY_BINDING_FLAGS_CONSUMED) != 0;
    BOOL all = (bindingFlags & GHOSTTY_BINDING_FLAGS_ALL) != 0;
    BOOL performable = (bindingFlags & GHOSTTY_BINDING_FLAGS_PERFORMABLE) != 0;
    if (consumed && !all && !performable && NSApp.mainMenu != nil &&
        [NSApp.mainMenu performKeyEquivalent:event]) {
      return YES;
    }

    [self keyDown:event];
    return YES;
  }

  NSString *equivalent = nil;
  NSString *charactersIgnoringModifiers = event.charactersIgnoringModifiers;
  if ([charactersIgnoringModifiers isEqualToString:@"\r"]) {
    if ((event.modifierFlags & NSEventModifierFlagControl) == 0) {
      return NO;
    }
    equivalent = @"\r";
  } else if ([charactersIgnoringModifiers isEqualToString:@"/"]) {
    const NSEventModifierFlags disallowed =
        NSEventModifierFlagShift | NSEventModifierFlagCommand | NSEventModifierFlagOption;
    if ((event.modifierFlags & NSEventModifierFlagControl) == 0 ||
        (event.modifierFlags & disallowed) != 0) {
      return NO;
    }
    equivalent = @"_";
  } else {
    if (event.timestamp == 0) {
      return NO;
    }

    if ((event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl)) == 0) {
      self.lastPerformKeyEvent = nil;
      return NO;
    }

    if (self.lastPerformKeyEvent != nil &&
        self.lastPerformKeyEvent.doubleValue == event.timestamp) {
      self.lastPerformKeyEvent = nil;
      equivalent = event.characters ?: @"";
    } else {
      self.lastPerformKeyEvent = @(event.timestamp);
      return NO;
    }
  }

  NSEvent *finalEvent =
      [NSEvent keyEventWithType:NSEventTypeKeyDown
                       location:event.locationInWindow
                  modifierFlags:event.modifierFlags
                      timestamp:event.timestamp
                   windowNumber:event.windowNumber
                        context:nil
                     characters:equivalent
    charactersIgnoringModifiers:equivalent
                      isARepeat:event.isARepeat
                        keyCode:event.keyCode];
  if (finalEvent == nil) {
    return NO;
  }

  [self keyDown:finalEvent];
  return YES;
}

- (void)flagsChanged:(NSEvent *)event {
  if (self.surface == NULL || self.hasMarkedText) {
    return;
  }

  uint32_t modifierBit = 0;
  switch (event.keyCode) {
  case 0x39:
    modifierBit = GHOSTTY_MODS_CAPS;
    break;
  case 0x38:
  case 0x3C:
    modifierBit = GHOSTTY_MODS_SHIFT;
    break;
  case 0x3B:
  case 0x3E:
    modifierBit = GHOSTTY_MODS_CTRL;
    break;
  case 0x3A:
  case 0x3D:
    modifierBit = GHOSTTY_MODS_ALT;
    break;
  case 0x37:
  case 0x36:
    modifierBit = GHOSTTY_MODS_SUPER;
    break;
  default:
    return;
  }

  ghostty_input_action_e action = GHOSTTY_ACTION_RELEASE;
  if ((lifecycleGhosttyMods(event.modifierFlags) & modifierBit) != 0) {
    action = GHOSTTY_ACTION_PRESS;
  }

  ghostty_input_key_s keyEvent = lifecycleGhosttyKeyEvent(event, action, event.modifierFlags);
  ghostty_surface_key(self.surface, keyEvent);
}

- (void)syncPreeditClearIfNeeded:(BOOL)clearIfNeeded {
  if (self.surface == NULL) {
    return;
  }

  if (self.markedText.length > 0) {
    NSString *text = self.markedText.string;
    const char *utf8 = text.UTF8String;
    if (utf8 != NULL) {
      ghostty_surface_preedit(self.surface, utf8, strlen(utf8));
    }
  } else if (clearIfNeeded) {
    ghostty_surface_preedit(self.surface, NULL, 0);
  }
}

- (void)keyDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super keyDown:event];
    return;
  }

  ghostty_input_action_e action =
      event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
  NSEvent *translationEvent = lifecycleGhosttyTranslationEvent(self.surface, event);
  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:
          @"[keyDown] terminal=%@ keycode=%hu mods=0x%lx chars=%@ charsIgnoring=%@ translated=%@",
          self.terminalId, (unsigned short)event.keyCode, (unsigned long)event.modifierFlags,
          lifecycleDebugString(event.characters), lifecycleDebugString(event.charactersIgnoringModifiers),
          lifecycleDebugString(translationEvent.characters)]);

  self.keyTextAccumulator = [[NSMutableArray alloc] init];
  BOOL markedTextBefore = self.markedText.length > 0;
  self.lastPerformKeyEvent = nil;
  [self interpretKeyEvents:@[ translationEvent ]];
  NSArray<NSString *> *pendingText = [self.keyTextAccumulator copy];
  self.keyTextAccumulator = nil;
  [self syncPreeditClearIfNeeded:markedTextBefore];
  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[keyDown] terminal=%@ pendingTextCount=%lu markedBefore=%d markedAfter=%d",
                       self.terminalId, (unsigned long)pendingText.count, markedTextBefore,
                       self.markedText.length > 0]);

  if (pendingText.count > 0) {
    NSString *translationTextStorage = nil;
    (void)lifecycleGhosttyTextForEvent(translationEvent, &translationTextStorage);
    NSUInteger pendingIndex = 0;
    for (NSString *text in pendingText) {
      NSString *effectiveText = text;
      if (effectiveText.length == 0 && translationTextStorage.length > 0 && pendingText.count == 1 &&
          !markedTextBefore && self.markedText.length == 0) {
        effectiveText = translationTextStorage;
      }

      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[keyDown] terminal=%@ pendingText[%lu]=%@ effective=%@",
                           self.terminalId, (unsigned long)pendingIndex,
                           lifecycleDebugString(text), lifecycleDebugString(effectiveText)]);
      lifecycleGhosttyKeyAction(self.surface, action, event, translationEvent, effectiveText, NO);
      pendingIndex += 1;
    }
    return;
  }

  NSString *textStorage = nil;
  (void)lifecycleGhosttyTextForEvent(translationEvent, &textStorage);
  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[keyDown] terminal=%@ fallbackText=%@", self.terminalId,
                       lifecycleDebugString(textStorage)]);
  lifecycleGhosttyKeyAction(self.surface, action, event, translationEvent, textStorage,
                            self.markedText.length > 0 || markedTextBefore);
}

- (void)keyUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super keyUp:event];
    return;
  }

  ghostty_input_key_s keyEvent =
      lifecycleGhosttyKeyEvent(event, GHOSTTY_ACTION_RELEASE, event.modifierFlags);
  ghostty_surface_key(self.surface, keyEvent);
}

- (void)insertText:(id)string replacementRange:(NSRange)replacementRange {
  (void)replacementRange;
  if (NSApp.currentEvent == nil) {
    lifecycleAppendDiagnosticLine([NSString
        stringWithFormat:@"[insertText] terminal=%@ skipped because currentEvent is nil",
                         self.terminalId]);
    return;
  }

  NSString *text = nil;
  if ([string isKindOfClass:[NSAttributedString class]]) {
    text = ((NSAttributedString *)string).string;
  } else if ([string isKindOfClass:[NSString class]]) {
    text = (NSString *)string;
  }

  if (text.length == 0) {
    return;
  }

  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[insertText] terminal=%@ text=%@ accumulating=%d", self.terminalId,
                       lifecycleDebugString(text), self.keyTextAccumulator != nil]);

  [self unmarkText];

  if (self.keyTextAccumulator != nil) {
    [self.keyTextAccumulator addObject:text];
    return;
  }

  lifecycleGhosttySendText(self.surface, text);
}

- (void)doCommandBySelector:(SEL)selector {
  if (self.lastPerformKeyEvent != nil && NSApp.currentEvent != nil &&
      self.lastPerformKeyEvent.doubleValue == NSApp.currentEvent.timestamp) {
    [NSApp sendEvent:NSApp.currentEvent];
    return;
  }

  (void)selector;
}

- (void)setMarkedText:(id)string
        selectedRange:(NSRange)selectedRange
      replacementRange:(NSRange)replacementRange {
  (void)selectedRange;
  (void)replacementRange;

  NSString *text = nil;
  if ([string isKindOfClass:[NSAttributedString class]]) {
    text = ((NSAttributedString *)string).string;
  } else if ([string isKindOfClass:[NSString class]]) {
    text = (NSString *)string;
  }

  if (text == nil) {
    [self.markedText replaceCharactersInRange:NSMakeRange(0, self.markedText.length) withString:@""];
    if (self.keyTextAccumulator == nil) {
      [self syncPreeditClearIfNeeded:YES];
    }
    return;
  }

  [self.markedText replaceCharactersInRange:NSMakeRange(0, self.markedText.length) withString:text];
  if (self.keyTextAccumulator == nil) {
    [self syncPreeditClearIfNeeded:YES];
  }
}

- (void)unmarkText {
  if (self.markedText.length == 0) {
    return;
  }

  [self.markedText replaceCharactersInRange:NSMakeRange(0, self.markedText.length) withString:@""];
  [self syncPreeditClearIfNeeded:YES];
}

- (BOOL)hasMarkedText {
  return self.markedText.length > 0;
}

- (NSRange)markedRange {
  if (self.markedText.length == 0) {
    return NSMakeRange(NSNotFound, 0);
  }
  return NSMakeRange(0, self.markedText.length);
}

- (NSRange)selectedRange {
  return NSMakeRange(NSNotFound, 0);
}

- (NSArray<NSAttributedStringKey> *)validAttributesForMarkedText {
  return @[];
}

- (NSAttributedString *)attributedSubstringForProposedRange:(NSRange)range
                                               actualRange:(NSRangePointer)actualRange {
  if (actualRange != NULL) {
    *actualRange = NSMakeRange(NSNotFound, 0);
  }
  (void)range;
  return nil;
}

- (NSUInteger)characterIndexForPoint:(NSPoint)point {
  (void)point;
  return NSNotFound;
}

- (NSRect)firstRectForCharacterRange:(NSRange)range actualRange:(NSRangePointer)actualRange {
  (void)range;
  if (actualRange != NULL) {
    *actualRange = NSMakeRange(NSNotFound, 0);
  }

  if (self.surface == NULL) {
    return [self.window convertRectToScreen:self.bounds];
  }

  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
  ghostty_surface_ime_point(self.surface, &x, &y, &width, &height);

  NSRect localRect = NSMakeRect(x, self.bounds.size.height - y - height, width, height);
  NSRect windowRect = [self convertRect:localRect toView:nil];
  return [self.window convertRectToScreen:windowRect];
}

- (void)paste:(id)sender {
  (void)sender;
  if (self.surface == NULL) {
    return;
  }

  NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
  NSData *imageData = lifecycleNativeTerminalPNGDataForPasteboard(pasteboard);
  if (imageData.length > 0) {
    lifecycleAppendDiagnosticLine([NSString
        stringWithFormat:@"[paste] terminal=%@ imageBytes=%lu", self.terminalId,
                         (unsigned long)imageData.length]);
    char *payload = lifecycle_native_terminal_prepare_paste_image(
        self.terminalId.UTF8String, "clipboard-image.png", "image/png",
        (const uint8_t *)imageData.bytes, imageData.length);
    if (payload == NULL) {
      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[paste] terminal=%@ failed to persist clipboard image",
                           self.terminalId]);
      NSBeep();
    } else {
      NSString *attachmentText = [NSString stringWithUTF8String:payload];
      lifecycle_native_terminal_free_string(payload);
      if (attachmentText.length > 0) {
        lifecycleGhosttySendText(self.surface, attachmentText);
      } else {
        lifecycleAppendDiagnosticLine([NSString
            stringWithFormat:@"[paste] terminal=%@ produced an empty attachment payload",
                             self.terminalId]);
        NSBeep();
      }
    }
    return;
  }

  NSString *string = [pasteboard stringForType:NSPasteboardTypeString];
  if (string.length == 0) {
    NSBeep();
    return;
  }

  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[paste] terminal=%@ text=%@", self.terminalId,
                       lifecycleDebugString(string)]);
  lifecycleGhosttySendText(self.surface, string);
}

- (void)copy:(id)sender {
  (void)sender;
  if (self.surface == NULL) {
    return;
  }

  ghostty_text_s text = {0};
  if (!ghostty_surface_read_selection(self.surface, &text)) {
    return;
  }

  NSString *selection = [[NSString alloc] initWithBytes:text.text
                                                 length:text.text_len
                                               encoding:NSUTF8StringEncoding];
  ghostty_surface_free_text(self.surface, &text);
  if (selection.length == 0) {
    return;
  }

  NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
  [pasteboard clearContents];
  [pasteboard setString:selection forType:NSPasteboardTypeString];
}

@end

static LifecycleNativeTerminalView *lifecycleTerminalViewForSurface(ghostty_surface_t surface) {
  if (surface == NULL) {
    return nil;
  }

  void *userdata = ghostty_surface_userdata(surface);
  if (userdata == NULL) {
    return nil;
  }

  return (__bridge LifecycleNativeTerminalView *)userdata;
}

static BOOL lifecycleNativeTerminalHandleWorkspaceShortcut(LifecycleNativeTerminalView *view,
                                                           NSEvent *event) {
  if (gWorkspaceShortcutCallback == NULL || view == nil || view.terminalId.length == 0) {
    return NO;
  }

  const NSEventModifierFlags flags =
      event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
  const BOOL hasCommand = (flags & NSEventModifierFlagCommand) != 0;
  const BOOL hasControl = (flags & NSEventModifierFlagControl) != 0;
  const BOOL hasOption = (flags & NSEventModifierFlagOption) != 0;
  const BOOL hasShift = (flags & NSEventModifierFlagShift) != 0;
  if (!hasCommand || hasControl || hasOption) {
    return NO;
  }

  NSString *charactersIgnoringModifiers = event.charactersIgnoringModifiers.lowercaseString ?: @"";
  if (!hasShift && [charactersIgnoringModifiers isEqualToString:@"t"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutNewTab, 0);
    return YES;
  }

  if (!hasShift && [charactersIgnoringModifiers isEqualToString:@"w"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutCloseActiveTab, 0);
    return YES;
  }

  if (!hasShift && charactersIgnoringModifiers.length == 1) {
    const unichar character = [charactersIgnoringModifiers characterAtIndex:0];
    if (character >= '1' && character <= '9') {
      gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutSelectTabIndex,
                                 (int32_t)(character - '0'));
      return YES;
    }
  }

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"["]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutPreviousTab, 0);
    return YES;
  }

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"]"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutNextTab, 0);
    return YES;
  }

  return NO;
}

static void lifecycleWakeup(void *userdata) {
  (void)userdata;
  dispatch_async(dispatch_get_main_queue(), ^{
    if (gGhosttyApp != NULL) {
      ghostty_app_tick(gGhosttyApp);
    }
  });
}

static bool lifecycleAction(ghostty_app_t app, ghostty_target_s target, ghostty_action_s action) {
  (void)app;
  if (target.tag != GHOSTTY_TARGET_SURFACE || target.target.surface == NULL) {
    return false;
  }

  LifecycleNativeTerminalView *view = lifecycleTerminalViewForSurface(target.target.surface);
  if (view == nil) {
    return false;
  }

  switch (action.tag) {
  case GHOSTTY_ACTION_SHOW_CHILD_EXITED:
    if (!view.reportedExit) {
      view.reportedExit = YES;
      if (gExitCallback != NULL) {
        gExitCallback(view.terminalId.UTF8String, (int32_t)action.action.child_exited.exit_code);
      }
    }
    return true;

  case GHOSTTY_ACTION_OPEN_URL: {
    if (action.action.open_url.url == NULL || action.action.open_url.len == 0) {
      return false;
    }

    NSString *value = [[NSString alloc] initWithBytes:action.action.open_url.url
                                               length:action.action.open_url.len
                                             encoding:NSUTF8StringEncoding];
    if (value.length == 0) {
      return false;
    }

    NSURL *url = [NSURL URLWithString:value];
    if (url == nil) {
      url = [NSURL fileURLWithPath:[value stringByExpandingTildeInPath]];
    }
    if (url == nil) {
      return false;
    }

    [NSWorkspace.sharedWorkspace openURL:url];
    return true;
  }

  default:
    return false;
  }
}

bool lifecycle_native_terminal_initialize(LifecycleNativeTerminalExitCallback callback,
                                          LifecycleNativeWorkspaceShortcutCallback shortcutCallback) {
  if (gGhosttyApp != NULL) {
    gExitCallback = callback;
    gWorkspaceShortcutCallback = shortcutCallback;
    return true;
  }

  @autoreleasepool {
    @try {
      NSArray<NSString *> *arguments = NSProcessInfo.processInfo.arguments;
      NSUInteger argc = arguments.count;
      char **argv = calloc(argc == 0 ? 1 : argc, sizeof(char *));
      if (argv == NULL) {
        lifecycleSetLastError(@"Failed to allocate argv for Ghostty.");
        return false;
      }

      for (NSUInteger index = 0; index < argc; index += 1) {
        argv[index] = strdup(arguments[index].UTF8String);
      }

      int initResult = ghostty_init((uintptr_t)argc, argv);
      for (NSUInteger index = 0; index < argc; index += 1) {
        free(argv[index]);
      }
      free(argv);

      if (initResult != GHOSTTY_SUCCESS) {
        lifecycleSetLastError(@"ghostty_init failed.");
        return false;
      }

      // Embedded surfaces should use Lifecycle-owned defaults instead of inheriting the user's
      // Ghostty window theme and padding configuration from disk.
      gGhosttyConfig = ghostty_config_new();
      ghostty_config_finalize(gGhosttyConfig);

      ghostty_runtime_config_s runtime = {0};
      runtime.userdata = NULL;
      runtime.supports_selection_clipboard = true;
      runtime.wakeup_cb = lifecycleWakeup;
      runtime.action_cb = lifecycleAction;

      gGhosttyApp = ghostty_app_new(&runtime, gGhosttyConfig);
      if (gGhosttyApp == NULL) {
        lifecycleSetLastError(@"ghostty_app_new failed.");
        return false;
      }

      gExitCallback = callback;
      gWorkspaceShortcutCallback = shortcutCallback;
      gTerminalViews = [[NSMutableDictionary alloc] init];
      gLastError = nil;
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal initialization threw an exception",
                                         exception);
      return false;
    }
  }
}

const char *lifecycle_native_terminal_last_error(void) {
  return gLastError.UTF8String;
}

void lifecycle_native_terminal_install_diagnostics(const char *log_path) {
  @autoreleasepool {
    if (log_path == NULL) {
      return;
    }

    NSString *resolvedPath = [NSString stringWithUTF8String:log_path];
    if (resolvedPath.length == 0) {
      return;
    }

    gDiagnosticsLogPath = [resolvedPath copy];
    if (gDiagnosticsLogFd >= 0) {
      close(gDiagnosticsLogFd);
      gDiagnosticsLogFd = -1;
    }

    gDiagnosticsLogFd =
        open(gDiagnosticsLogPath.fileSystemRepresentation, O_WRONLY | O_CREAT | O_APPEND, 0644);

    NSSetUncaughtExceptionHandler(&lifecycleNativeTerminalUncaughtExceptionHandler);
    lifecycleInstallSignalHandler(SIGABRT);
    lifecycleInstallSignalHandler(SIGSEGV);
    lifecycleInstallSignalHandler(SIGBUS);
    lifecycleInstallSignalHandler(SIGILL);
    lifecycleInstallSignalHandler(SIGTRAP);

    lifecycleAppendDiagnosticLine(
        [NSString stringWithFormat:@"[native-terminal] diagnostics installed at %@",
                                   gDiagnosticsLogPath]);
  }
}

static BOOL lifecycleApplySurfaceTheme(LifecycleNativeTerminalView *view,
                                       const LifecycleNativeTerminalConfig *config) {
  if (view.surface == NULL) {
    return YES;
  }

  NSString *backgroundColor = config->background_color == NULL
                                  ? nil
                                  : [[NSString stringWithUTF8String:config->background_color]
                                        stringByTrimmingCharactersInSet:
                                            [NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (backgroundColor.length == 0) {
    lifecycleSetLastError(@"Native terminal background color is empty.");
    return NO;
  }

  if (!lifecycleIsHexColorString(backgroundColor)) {
    lifecycleSetLastError([NSString
        stringWithFormat:@"Unsupported native terminal background color: %@", backgroundColor]);
    return NO;
  }

  NSColor *resolvedBackgroundColor = lifecycleColorFromHexString(backgroundColor);
  if (resolvedBackgroundColor == nil) {
    lifecycleSetLastError([NSString
        stringWithFormat:@"Failed to parse native terminal background color: %@", backgroundColor]);
    return NO;
  }

  NSString *themeConfigPath = config->theme_config_path == NULL
                                  ? nil
                                  : [[NSString stringWithUTF8String:config->theme_config_path]
                                        stringByTrimmingCharactersInSet:
                                            [NSCharacterSet whitespaceAndNewlineCharacterSet]];
  if (themeConfigPath.length == 0) {
    lifecycleSetLastError(@"Native terminal theme config path is empty.");
    return NO;
  }

  if ([view.appliedBackgroundColor isEqualToString:backgroundColor] &&
      [view.appliedThemeConfigPath isEqualToString:themeConfigPath]) {
    view.layer.backgroundColor = resolvedBackgroundColor.CGColor;
    return YES;
  }

  ghostty_config_t surfaceConfig = ghostty_config_clone(gGhosttyConfig);
  if (surfaceConfig == NULL) {
    lifecycleSetLastError(@"Failed to clone Ghostty config for native terminal surface.");
    return NO;
  }

  ghostty_config_load_file(surfaceConfig, themeConfigPath.fileSystemRepresentation);
  ghostty_config_finalize(surfaceConfig);
  if (ghostty_config_diagnostics_count(surfaceConfig) > 0) {
    ghostty_diagnostic_s diagnostic = ghostty_config_get_diagnostic(surfaceConfig, 0);
    lifecycleSetLastError([NSString
        stringWithFormat:@"Failed to load native terminal theme override: %s",
                         diagnostic.message]);
    ghostty_config_free(surfaceConfig);
    return NO;
  }

  ghostty_surface_update_config(view.surface, surfaceConfig);
  ghostty_config_free(surfaceConfig);

  view.layer.backgroundColor = resolvedBackgroundColor.CGColor;
  view.appliedBackgroundColor = [backgroundColor copy];
  view.appliedThemeConfigPath = [themeConfigPath copy];
  return YES;
}

static NSRect lifecycleFrameForConfig(NSView *webview, const LifecycleNativeTerminalConfig *config) {
  NSRect webviewFrame = webview.frame;
  return NSMakeRect(webviewFrame.origin.x + config->x,
                    webviewFrame.origin.y + webviewFrame.size.height - config->y - config->height,
                    config->width, config->height);
}

static LifecycleNativeTerminalView *lifecycleCreateTerminalView(
    const LifecycleNativeTerminalConfig *config) {
  NSString *terminalId = [NSString stringWithUTF8String:config->terminal_id];
  LifecycleNativeTerminalView *view =
      [[LifecycleNativeTerminalView alloc] initWithTerminalId:terminalId];

  ghostty_surface_config_s surfaceConfig = ghostty_surface_config_new();
  surfaceConfig.platform_tag = GHOSTTY_PLATFORM_MACOS;
  surfaceConfig.platform.macos.nsview = (__bridge void *)view;
  surfaceConfig.userdata = (__bridge void *)view;
  surfaceConfig.scale_factor = config->scale_factor;
  surfaceConfig.font_size = (float)config->font_size;
  surfaceConfig.working_directory = config->working_directory;
  surfaceConfig.command = config->command;
  surfaceConfig.context = GHOSTTY_SURFACE_CONTEXT_WINDOW;

  view.surface = ghostty_surface_new(gGhosttyApp, &surfaceConfig);
  if (view.surface == NULL) {
    lifecycleSetLastError([NSString stringWithFormat:@"ghostty_surface_new failed for %@", terminalId]);
    return nil;
  }

  ghostty_surface_set_color_scheme(view.surface,
                                   config->dark ? GHOSTTY_COLOR_SCHEME_DARK
                                                : GHOSTTY_COLOR_SCHEME_LIGHT);
  if (!lifecycleApplySurfaceTheme(view, config)) {
    ghostty_surface_free(view.surface);
    view.surface = NULL;
    return nil;
  }
  return view;
}

bool lifecycle_native_terminal_sync(void *webview_view,
                                    const LifecycleNativeTerminalConfig *config) {
  @autoreleasepool {
    @try {
      if (gGhosttyApp == NULL) {
        lifecycleSetLastError(@"Ghostty runtime is not initialized.");
        return false;
      }

      if (webview_view == NULL || config == NULL || config->terminal_id == NULL ||
          config->working_directory == NULL) {
        lifecycleSetLastError(@"Native terminal sync received incomplete arguments.");
        return false;
      }

      NSView *webview = (__bridge NSView *)webview_view;
      NSView *container = webview.superview;
      if (container == nil) {
        lifecycleSetLastError(@"Tauri webview has no superview for native terminal mounting.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:config->terminal_id];
      LifecycleNativeTerminalView *view = (LifecycleNativeTerminalView *)gTerminalViews[terminalId];
      if (view == nil) {
        view = lifecycleCreateTerminalView(config);
        if (view == nil) {
          return false;
        }

        [container addSubview:view positioned:NSWindowAbove relativeTo:webview];
        gTerminalViews[terminalId] = view;
      } else if (view.superview != container) {
        [view removeFromSuperview];
        [container addSubview:view positioned:NSWindowAbove relativeTo:webview];
      }

      NSRect targetFrame = lifecycleFrameForConfig(webview, config);
      [view setFrame:targetFrame];
      [view syncContentScale];

      if (view.surface != NULL) {
        ghostty_surface_set_color_scheme(view.surface,
                                         config->dark ? GHOSTTY_COLOR_SCHEME_DARK
                                                      : GHOSTTY_COLOR_SCHEME_LIGHT);
        if (!lifecycleApplySurfaceTheme(view, config)) {
          return false;
        }
        ghostty_surface_set_occlusion(view.surface, !config->hidden);
      }

      view.pointerPassthrough = config->pointer_passthrough;
      view.wantsFocus = config->focused && !config->hidden;
      view.hidden = config->hidden;
      [view syncGhosttyFocusState];
      [view requestFocusIfNeeded];

      gLastError = nil;
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal sync threw an exception", exception);
      return false;
    }
  }
}

bool lifecycle_native_terminal_hide(const char *terminal_id) {
  @autoreleasepool {
    @try {
      if (terminal_id == NULL) {
        lifecycleSetLastError(@"Native terminal hide is missing a terminal id.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:terminal_id];
      LifecycleNativeTerminalView *view = (LifecycleNativeTerminalView *)gTerminalViews[terminalId];
      if (view == nil) {
        return true;
      }

      view.hidden = YES;
      if (view.surface != NULL) {
        ghostty_surface_set_focus(view.surface, false);
        ghostty_surface_set_occlusion(view.surface, true);
      }
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal hide threw an exception", exception);
      return false;
    }
  }
}

bool lifecycle_native_terminal_close(const char *terminal_id) {
  @autoreleasepool {
    @try {
      if (terminal_id == NULL) {
        lifecycleSetLastError(@"Native terminal close is missing a terminal id.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:terminal_id];
      LifecycleNativeTerminalView *view = (LifecycleNativeTerminalView *)gTerminalViews[terminalId];
      if (view == nil) {
        return true;
      }

      [gTerminalViews removeObjectForKey:terminalId];
      [view removeFromSuperview];
      if (view.surface != NULL) {
        ghostty_surface_free(view.surface);
        view.surface = NULL;
      }
      if (gGhosttyApp != NULL) {
        ghostty_app_set_focus(gGhosttyApp, lifecycleGhosttyAppShouldBeFocused());
      }
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal close threw an exception", exception);
      return false;
    }
  }
}

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

static void lifecycleSetApplicationAppearanceMainThread(const char *appearance_name) {
  if (appearance_name == NULL) {
    [NSApp setAppearance:nil];
    return;
  }

  NSString *appearance = [NSString stringWithUTF8String:appearance_name];
  if (appearance == nil || [appearance isEqualToString:@"system"]) {
    [NSApp setAppearance:nil];
    return;
  }

  NSString *nativeAppearanceName =
      [appearance isEqualToString:@"dark"] ? NSAppearanceNameDarkAqua : NSAppearanceNameAqua;
  NSAppearance *nativeAppearance = [NSAppearance appearanceNamed:nativeAppearanceName];
  [NSApp setAppearance:nativeAppearance];
}

void lifecycle_native_set_application_appearance(const char *appearance_name) {
  if ([NSThread isMainThread]) {
    lifecycleSetApplicationAppearanceMainThread(appearance_name);
    return;
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    lifecycleSetApplicationAppearanceMainThread(appearance_name);
  });
}
