#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#import <QuartzCore/QuartzCore.h>
#import <stdbool.h>

#include "ghostty.h"

typedef void (*LifecycleNativeTerminalExitCallback)(const char *terminal_id, int32_t exit_code);

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
  bool hidden;
  bool dark;
} LifecycleNativeTerminalConfig;

static ghostty_app_t gGhosttyApp = NULL;
static ghostty_config_t gGhosttyConfig = NULL;
static LifecycleNativeTerminalExitCallback gExitCallback = NULL;
static NSMutableDictionary<NSString *, NSView *> *gTerminalViews;
static NSString *gLastError;

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

  ghostty_surface_text(surface, utf8, strlen(utf8));
}

static void lifecycleGhosttyDispatchKeyEvent(ghostty_surface_t surface,
                                             ghostty_input_key_s keyEvent,
                                             NSString *text) {
  const BOOL printableText = lifecycleGhosttyTextIsPrintable(text);
  if (printableText) {
    keyEvent.text = text.UTF8String;
  }

  if (!ghostty_surface_key(surface, keyEvent) && printableText) {
    // Ghostty's full key event path is preferred because it preserves
    // modifier-aware encodings. If the event is ignored, fall back to raw text
    // injection so canonical shell input still receives printable characters.
    lifecycleGhosttySendText(surface, text);
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

@interface LifecycleNativeTerminalView : NSView <NSTextInputClient>
@property(nonatomic, readonly) NSString *terminalId;
@property(nonatomic, assign) ghostty_surface_t surface;
@property(nonatomic, copy) NSString *appliedBackgroundColor;
@property(nonatomic, copy) NSString *appliedThemeConfigPath;
@property(nonatomic, strong) NSMutableAttributedString *markedText;
@property(nonatomic, strong) NSMutableArray<NSString *> *keyTextAccumulator;
@property(nonatomic, assign) BOOL reportedExit;
@property(nonatomic, assign) BOOL wantsFocus;
@property(nonatomic, assign) NSUInteger focusRequestGeneration;
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
  _reportedExit = NO;
  _wantsFocus = NO;
  _focusRequestGeneration = 0;

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
  ghostty_surface_set_size(self.surface, (uint32_t)llround(backingSize.width),
                           (uint32_t)llround(backingSize.height));
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
  BOOL wantsSurfaceFocus = self.wantsFocus && !self.hidden && windowFocused;
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
  if (!self.wantsFocus || self.hidden) {
    self.focusRequestGeneration += 1;
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
  if (self.window.firstResponder != self) {
    return NO;
  }

  if ((event.modifierFlags & (NSEventModifierFlagCommand | NSEventModifierFlagControl)) == 0) {
    return NO;
  }

  [self keyDown:event];
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

- (void)keyDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super keyDown:event];
    return;
  }

  ghostty_input_action_e action =
      event.isARepeat ? GHOSTTY_ACTION_REPEAT : GHOSTTY_ACTION_PRESS;
  NSEvent *translationEvent = lifecycleGhosttyTranslationEvent(self.surface, event);

  self.keyTextAccumulator = [[NSMutableArray alloc] init];
  [self interpretKeyEvents:@[ translationEvent ]];
  NSArray<NSString *> *pendingText = [self.keyTextAccumulator copy];
  self.keyTextAccumulator = nil;

  if (pendingText.count > 0) {
    for (NSString *text in pendingText) {
      ghostty_input_key_s keyEvent =
          lifecycleGhosttyKeyEvent(event, action, translationEvent.modifierFlags);
      keyEvent.composing = false;
      lifecycleGhosttyDispatchKeyEvent(self.surface, keyEvent, text);
    }
    return;
  }

  NSString *textStorage = nil;
  ghostty_input_key_s keyEvent =
      lifecycleGhosttyKeyEvent(event, action, translationEvent.modifierFlags);
  keyEvent.composing = self.hasMarkedText;
  keyEvent.text = lifecycleGhosttyTextForEvent(translationEvent, &textStorage);
  if (!ghostty_surface_key(self.surface, keyEvent) && lifecycleGhosttyTextIsPrintable(textStorage)) {
    lifecycleGhosttySendText(self.surface, textStorage);
  }
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
  NSString *text = nil;
  if ([string isKindOfClass:[NSAttributedString class]]) {
    text = ((NSAttributedString *)string).string;
  } else if ([string isKindOfClass:[NSString class]]) {
    text = (NSString *)string;
  }

  if (text.length == 0) {
    return;
  }

  [self unmarkText];

  if (self.keyTextAccumulator != nil) {
    [self.keyTextAccumulator addObject:text];
    return;
  }

  lifecycleGhosttySendText(self.surface, text);
}

- (void)doCommandBySelector:(SEL)selector {
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
    if (self.surface != NULL) {
      ghostty_surface_preedit(self.surface, NULL, 0);
    }
    return;
  }

  [self.markedText replaceCharactersInRange:NSMakeRange(0, self.markedText.length) withString:text];
  if (self.surface != NULL) {
    ghostty_surface_preedit(self.surface, text.UTF8String, strlen(text.UTF8String));
  }
}

- (void)unmarkText {
  if (self.markedText.length == 0) {
    return;
  }

  [self.markedText replaceCharactersInRange:NSMakeRange(0, self.markedText.length) withString:@""];
  if (self.surface != NULL) {
    ghostty_surface_preedit(self.surface, NULL, 0);
  }
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
  NSString *string = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
  if (self.surface == NULL || string.length == 0) {
    return;
  }

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

bool lifecycle_native_terminal_initialize(LifecycleNativeTerminalExitCallback callback) {
  if (gGhosttyApp != NULL) {
    gExitCallback = callback;
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

static LifecycleNativeTerminalView *lifecycleCreateTerminalView(NSView *webview,
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
  [view setFrame:lifecycleFrameForConfig(webview, config)];
  [view syncContentScale];
  [view syncSurfaceGeometry];
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
        view = lifecycleCreateTerminalView(webview, config);
        if (view == nil) {
          return false;
        }

        [container addSubview:view positioned:NSWindowAbove relativeTo:webview];
        gTerminalViews[terminalId] = view;
      } else if (view.superview != container) {
        [view removeFromSuperview];
        [container addSubview:view positioned:NSWindowAbove relativeTo:webview];
      }

      [view setFrame:lifecycleFrameForConfig(webview, config)];
      [view syncContentScale];
      [view syncSurfaceGeometry];

      if (view.surface != NULL) {
        ghostty_surface_set_color_scheme(view.surface,
                                         config->dark ? GHOSTTY_COLOR_SCHEME_DARK
                                                      : GHOSTTY_COLOR_SCHEME_LIGHT);
        if (!lifecycleApplySurfaceTheme(view, config)) {
          return false;
        }
        ghostty_surface_set_occlusion(view.surface, !config->hidden);
      }

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
