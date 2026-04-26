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

typedef void (*LifecycleGhosttyTerminalExitCallback)(const char *terminal_id, int32_t exit_code);
typedef void (*LifecycleGhosttyWorkspaceShortcutCallback)(const char *terminal_id,
                                                         int32_t shortcut_kind,
                                                         int32_t shortcut_index);
char *lifecycle_ghostty_terminal_prepare_paste_image(const char *terminal_id, const char *file_name,
                                                    const char *media_type,
                                                    const uint8_t *bytes, size_t bytes_len);
void lifecycle_ghostty_terminal_free_string(char *value);

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
  double opacity;
  bool focused;
  bool pointer_passthrough;
  bool hidden;
  bool dark;
} LifecycleGhosttyTerminalConfig;

typedef struct {
  const char *terminal_id;
  double x;
  double y;
  double width;
  double height;
} LifecycleGhosttyTerminalFrameConfig;

@class LifecycleGhosttyTerminalView;
static LifecycleGhosttyTerminalView *lifecycleTerminalViewForSurface(ghostty_surface_t surface);
static BOOL lifecycleGhosttyTerminalHandleWorkspaceShortcut(LifecycleGhosttyTerminalView *view,
                                                           NSEvent *event);

static ghostty_app_t gGhosttyApp = NULL;
static ghostty_config_t gGhosttyConfig = NULL;
static LifecycleGhosttyTerminalExitCallback gExitCallback = NULL;
static LifecycleGhosttyWorkspaceShortcutCallback gWorkspaceShortcutCallback = NULL;
static NSMutableDictionary<NSString *, NSView *> *gTerminalViews;
static id gScrollWheelMonitor = nil;
static NSString *gLastError;
static NSString *gDiagnosticsLogPath;
static int gDiagnosticsLogFd = -1;

static const int32_t kLifecycleShortcutPreviousTab = 1;
static const int32_t kLifecycleShortcutNextTab = 2;
static const int32_t kLifecycleShortcutCloseActiveTab = 3;
static const int32_t kLifecycleShortcutNewTab = 5;
static const int32_t kLifecycleShortcutGoBack = 6;
static const int32_t kLifecycleShortcutGoForward = 7;
static const int32_t kLifecycleShortcutReopenClosedTab = 8;
static const int32_t kLifecycleShortcutToggleZoom = 9;

static NSView *lifecycleFindWebView(NSView *root) {
  if (root == nil) {
    return nil;
  }

  Class wkWebViewClass = NSClassFromString(@"WKWebView");
  if (wkWebViewClass == Nil) {
    return nil;
  }

  for (NSView *child in root.subviews) {
    if ([child isKindOfClass:wkWebViewClass]) {
      return child;
    }

    NSView *found = lifecycleFindWebView(child);
    if (found != nil) {
      return found;
    }
  }

  return nil;
}

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

static NSString *lifecycleResolvedTerminalId(NSString *terminalId) {
  return terminalId.length > 0 ? terminalId : @"<unknown>";
}

static NSString *lifecycleTerminalIdForSurface(ghostty_surface_t surface) {
  if (surface == NULL) {
    return @"<unknown>";
  }

  id view = lifecycleTerminalViewForSurface(surface);
  if (view == nil) {
    return @"<unknown>";
  }

  return lifecycleResolvedTerminalId([view valueForKey:@"terminalId"]);
}

static void lifecycleLogTerminalException(NSString *context,
                                          NSString *terminalId,
                                          NSException *exception) {
  NSString *resolvedTerminalId = lifecycleResolvedTerminalId(terminalId);
  NSString *name = exception.name ?: @"NSException";
  NSString *reason = exception.reason ?: @"(no reason provided)";
  lifecycleSetLastErrorFromException(
      [NSString stringWithFormat:@"%@ for terminal %@", context, resolvedTerminalId], exception);
  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[exception] %@ terminal=%@ threw: %@ (%@)", context,
                       resolvedTerminalId, reason, name]);
}

static void lifecycleLogSurfaceException(NSString *context,
                                         ghostty_surface_t surface,
                                         NSException *exception) {
  lifecycleLogTerminalException(context, lifecycleTerminalIdForSurface(surface), exception);
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

  ghostty_input_mods_e translatedGhosttyMods = lifecycleGhosttyMods(event.modifierFlags);
  @try {
    translatedGhosttyMods =
        ghostty_surface_key_translation_mods(surface, lifecycleGhosttyMods(event.modifierFlags));
  } @catch (NSException *exception) {
    NSString *name = exception.name ?: @"NSException";
    NSString *reason = exception.reason ?: @"(no reason provided)";
    lifecycleAppendDiagnosticLine(
        [NSString stringWithFormat:@"[exception] native terminal key translation threw: %@ (%@)",
                                   reason, name]);
    return event;
  }
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
    lifecycleLogSurfaceException(@"native terminal text input", surface, exception);
  }
}

static void lifecycleGhosttyMousePosition(ghostty_surface_t surface,
                                          double x,
                                          double y,
                                          ghostty_input_mods_e mods,
                                          NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_mouse_pos(surface, x, y, mods);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static void lifecycleGhosttyMouseButton(ghostty_surface_t surface,
                                        ghostty_input_mouse_state_e state,
                                        ghostty_input_mouse_button_e button,
                                        ghostty_input_mods_e mods,
                                        NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    (void)ghostty_surface_mouse_button(surface, state, button, mods);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static void lifecycleGhosttyMouseScroll(ghostty_surface_t surface,
                                        double deltaX,
                                        double deltaY,
                                        ghostty_input_scroll_mods_t mods,
                                        NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_mouse_scroll(surface, deltaX, deltaY, mods);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static BOOL lifecycleGhosttyBindingAction(ghostty_surface_t surface,
                                          const char *action,
                                          NSString *context) {
  if (surface == NULL || action == NULL) {
    return NO;
  }

  @try {
    return ghostty_surface_binding_action(surface, action, strlen(action));
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
    return NO;
  }
}

static BOOL lifecycleGhosttySurfaceKey(ghostty_surface_t surface,
                                       ghostty_input_key_s keyEvent,
                                       NSString *context) {
  if (surface == NULL) {
    return NO;
  }

  @try {
    return ghostty_surface_key(surface, keyEvent);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
    return NO;
  }
}

static BOOL lifecycleGhosttySurfaceKeyIsBinding(ghostty_surface_t surface,
                                                ghostty_input_key_s keyEvent,
                                                ghostty_binding_flags_e *flags,
                                                NSString *context) {
  if (flags != NULL) {
    *flags = 0;
  }
  if (surface == NULL) {
    return NO;
  }

  @try {
    return ghostty_surface_key_is_binding(surface, keyEvent, flags);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
    return NO;
  }
}

static void lifecycleGhosttySetSize(ghostty_surface_t surface,
                                    uint32_t width,
                                    uint32_t height,
                                    NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_set_size(surface, width, height);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static void lifecycleGhosttySetContentScale(ghostty_surface_t surface,
                                            double xScale,
                                            double yScale,
                                            NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_set_content_scale(surface, xScale, yScale);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static void lifecycleGhosttySetFocus(ghostty_surface_t surface,
                                     BOOL focused,
                                     NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_set_focus(surface, focused);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static void lifecycleGhosttyAppSetFocus(ghostty_app_t app,
                                        BOOL focused,
                                        NSString *context) {
  if (app == NULL) {
    return;
  }

  @try {
    ghostty_app_set_focus(app, focused);
  } @catch (NSException *exception) {
    lifecycleSetLastErrorFromException(context, exception);
    NSString *name = exception.name ?: @"NSException";
    NSString *reason = exception.reason ?: @"(no reason provided)";
    lifecycleAppendDiagnosticLine(
        [NSString stringWithFormat:@"[exception] %@ threw: %@ (%@)", context, reason, name]);
  }
}

static void lifecycleGhosttyPreedit(ghostty_surface_t surface,
                                    const char *utf8,
                                    size_t utf8Length,
                                    NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_preedit(surface, utf8, utf8Length);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
  }
}

static BOOL lifecycleGhosttyImePoint(ghostty_surface_t surface,
                                     double *x,
                                     double *y,
                                     double *width,
                                     double *height,
                                     NSString *context) {
  if (surface == NULL || x == NULL || y == NULL || width == NULL || height == NULL) {
    return NO;
  }

  @try {
    ghostty_surface_ime_point(surface, x, y, width, height);
    return YES;
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
    return NO;
  }
}

static void lifecycleGhosttyFreeSurface(ghostty_surface_t surface, NSString *context) {
  if (surface == NULL) {
    return;
  }

  @try {
    ghostty_surface_free(surface);
  } @catch (NSException *exception) {
    lifecycleLogSurfaceException(context, surface, exception);
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
    lifecycleLogTerminalException(@"native terminal key input", terminalId, exception);
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

@interface LifecycleGhosttyTerminalView : NSView <NSTextInputClient>
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

static BOOL lifecycleEventIsShiftedTerminalInputKey(NSEvent *event) {
  if (event.type != NSEventTypeKeyDown) {
    return NO;
  }

  NSEventModifierFlags flags =
      event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
  const NSEventModifierFlags required = NSEventModifierFlagShift;
  const NSEventModifierFlags disallowed =
      NSEventModifierFlagControl | NSEventModifierFlagOption | NSEventModifierFlagCommand;
  if ((flags & required) != required || (flags & disallowed) != 0) {
    return NO;
  }

  switch (event.keyCode) {
  case 0x24: // Return
  case 0x30: // Tab
  case 0x4C: // Keypad Enter
    return YES;
  default:
    return NO;
  }
}

static BOOL lifecycleEventShouldPreflightAppMenuShortcut(NSEvent *event) {
  if (event.type != NSEventTypeKeyDown) {
    return NO;
  }

  NSEventModifierFlags deviceIndependentFlags =
      event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
  const BOOL hasCommand = (deviceIndependentFlags & NSEventModifierFlagCommand) != 0;
  const BOOL hasControl = (deviceIndependentFlags & NSEventModifierFlagControl) != 0;
  const BOOL hasOption = (deviceIndependentFlags & NSEventModifierFlagOption) != 0;
  if (!hasCommand || hasControl || hasOption) {
    return NO;
  }

  // Lifecycle wants app-owned menu accelerators to keep working while the
  // terminal has focus. Explicit terminal-owned shortcuts are handled earlier
  // in performKeyEquivalent:, so any remaining plain Cmd / Shift+Cmd chord
  // should get a menu preflight before Ghostty binding resolution.
  return YES;
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
    if (![candidateView isKindOfClass:[LifecycleGhosttyTerminalView class]]) {
      continue;
    }

    LifecycleGhosttyTerminalView *terminalView = (LifecycleGhosttyTerminalView *)candidateView;
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

@implementation LifecycleGhosttyTerminalView

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
  self.layer.magnificationFilter = kCAFilterNearest;
  self.layer.minificationFilter = kCAFilterNearest;
  self.layer.allowsEdgeAntialiasing = NO;
  self.layerContentsRedrawPolicy = NSViewLayerContentsRedrawNever;
  // Let AppKit stretch the sibling overlay during native live-resize/zoom
  // animations. The webview still sends the exact final frame afterward.
  self.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.autoresizesSubviews = NO;

  [self registerForDraggedTypes:@[
    NSPasteboardTypeFileURL,
    NSPasteboardTypeTIFF,
    NSPasteboardTypePNG,
  ]];

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
  return !self.hidden && self.alphaValue >= 1.0;
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
    lifecycleGhosttyFreeSurface(_surface, @"native terminal dealloc");
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

  lifecycleGhosttySetSize(self.surface, (uint32_t)width, (uint32_t)height,
                          @"native terminal resize");
  self.lastSurfaceWidth = width;
  self.lastSurfaceHeight = height;
}

- (void)syncContentScale {
  if (self.surface == NULL) {
    return;
  }

  NSScreen *screen = self.window.screen ?: NSScreen.mainScreen;
  const double scaleFactor = screen ? screen.backingScaleFactor : 2.0;
  lifecycleGhosttySetContentScale(self.surface, scaleFactor, scaleFactor,
                                  @"native terminal content scale");
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
  if (hidden) {
    NSWindow *window = self.window;
    if (window != nil && window.firstResponder == self) {
      NSResponder *target = lifecycleFindWebView(window.contentView) ?: window.contentView;
      [window makeFirstResponder:target];
    }
  }
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

  lifecycleGhosttySetFocus(self.surface, surfaceFocused, @"native terminal focus sync");
  lifecycleGhosttyAppSetFocus(gGhosttyApp, lifecycleGhosttyAppShouldBeFocused(),
                              @"native terminal app focus sync");
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
    LifecycleGhosttyTerminalView *strongSelf = weakSelf;
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
                     LifecycleGhosttyTerminalView *retrySelf = weakSelf;
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

  @try {
    NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    lifecycleGhosttyMousePosition(self.surface, point.x, self.bounds.size.height - point.y,
                                  lifecycleGhosttyMods(event.modifierFlags),
                                  @"native terminal mouse move");
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal mouse move", self.terminalId, exception);
  }
}

- (void)mouseEntered:(NSEvent *)event {
  [self mouseMoved:event];
}

- (void)mouseExited:(NSEvent *)event {
  (void)event;
  if (self.surface == NULL) {
    return;
  }

  @try {
    lifecycleGhosttyMousePosition(self.surface, -1, -1, GHOSTTY_MODS_NONE,
                                  @"native terminal mouse exit");
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal mouse exit", self.terminalId, exception);
  }
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

  @try {
    [[self window] makeFirstResponder:self];
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_LEFT,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal mouse down");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal mouse down", self.terminalId, exception);
  }
}

- (void)mouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super mouseUp:event];
    return;
  }

  @try {
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_LEFT,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal mouse up");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal mouse up", self.terminalId, exception);
  }
}

- (void)rightMouseDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super rightMouseDown:event];
    return;
  }

  @try {
    [[self window] makeFirstResponder:self];
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_RIGHT,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal right mouse down");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal right mouse down", self.terminalId, exception);
  }
}

- (void)rightMouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super rightMouseUp:event];
    return;
  }

  @try {
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_RIGHT,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal right mouse up");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal right mouse up", self.terminalId, exception);
  }
}

- (void)otherMouseDown:(NSEvent *)event {
  if (self.surface == NULL) {
    [super otherMouseDown:event];
    return;
  }

  @try {
    [[self window] makeFirstResponder:self];
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_PRESS, GHOSTTY_MOUSE_MIDDLE,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal middle mouse down");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal middle mouse down", self.terminalId,
                                  exception);
  }
}

- (void)otherMouseUp:(NSEvent *)event {
  if (self.surface == NULL) {
    [super otherMouseUp:event];
    return;
  }

  @try {
    lifecycleGhosttyMouseButton(self.surface, GHOSTTY_MOUSE_RELEASE, GHOSTTY_MOUSE_MIDDLE,
                                lifecycleGhosttyMods(event.modifierFlags),
                                @"native terminal middle mouse up");
    [self mouseMoved:event];
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal middle mouse up", self.terminalId, exception);
  }
}

- (void)scrollWheel:(NSEvent *)event {
  if (self.surface == NULL) {
    [super scrollWheel:event];
    return;
  }

  @try {
    [self mouseMoved:event];

    double deltaX = event.scrollingDeltaX;
    double deltaY = event.scrollingDeltaY;
    BOOL precision = event.hasPreciseScrollingDeltas;
    if (precision) {
      deltaX *= 2.0;
      deltaY *= 2.0;
    }

    // Build ghostty_input_scroll_mods_t bitmask:
    //   bit 0: precision (trackpad vs discrete mouse wheel)
    //   bits 1-3: momentum phase (ghostty_input_mouse_momentum_e)
    ghostty_input_scroll_mods_t scrollMods = 0;
    if (precision) {
      scrollMods |= 1;
    }

    // Map NSEventPhase bitmask to sequential ghostty_input_mouse_momentum_e values
    ghostty_input_mouse_momentum_e momentum = GHOSTTY_MOUSE_MOMENTUM_NONE;
    NSEventPhase momentumPhase = event.momentumPhase;
    if (momentumPhase == NSEventPhaseBegan) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_BEGAN;
    } else if (momentumPhase == NSEventPhaseStationary) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_STATIONARY;
    } else if (momentumPhase == NSEventPhaseChanged) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_CHANGED;
    } else if (momentumPhase == NSEventPhaseEnded) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_ENDED;
    } else if (momentumPhase == NSEventPhaseCancelled) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_CANCELLED;
    } else if (momentumPhase == NSEventPhaseMayBegin) {
      momentum = GHOSTTY_MOUSE_MOMENTUM_MAY_BEGIN;
    }
    scrollMods |= ((ghostty_input_scroll_mods_t)momentum) << 1;

    lifecycleGhosttyMouseScroll(self.surface, deltaX, deltaY, scrollMods,
                                @"native terminal mouse scroll");
  } @catch (NSException *exception) {
    lifecycleLogTerminalException(@"native terminal mouse scroll", self.terminalId, exception);
  }
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

  if (lifecycleEventIsShiftedTerminalInputKey(event)) {
    [self keyDown:event];
    return YES;
  }

  if (lifecycleGhosttyTerminalHandleWorkspaceShortcut(self, event)) {
    return YES;
  }

  if (lifecycleEventMatchesPasteShortcut(event)) {
    [self paste:nil];
    return YES;
  }

  if (lifecycleEventShouldPreflightAppMenuShortcut(event) && NSApp.mainMenu != nil &&
      [NSApp.mainMenu performKeyEquivalent:event]) {
    return YES;
  }

  ghostty_input_key_s bindingEvent =
      lifecycleGhosttyKeyEvent(event, GHOSTTY_ACTION_PRESS, event.modifierFlags);
  NSString *bindingText = event.characters ?: @"";
  if (bindingText.length > 0) {
    bindingEvent.text = bindingText.UTF8String;
  }

  ghostty_binding_flags_e bindingFlags = 0;
  if (lifecycleGhosttySurfaceKeyIsBinding(self.surface, bindingEvent, &bindingFlags,
                                          @"native terminal key binding lookup")) {
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
  (void)lifecycleGhosttySurfaceKey(self.surface, keyEvent, @"native terminal modifier input");
}

- (void)syncPreeditClearIfNeeded:(BOOL)clearIfNeeded {
  if (self.surface == NULL) {
    return;
  }

  if (self.markedText.length > 0) {
    NSString *text = self.markedText.string;
    const char *utf8 = text.UTF8String;
    if (utf8 != NULL) {
      lifecycleGhosttyPreedit(self.surface, utf8, strlen(utf8), @"native terminal preedit");
    }
  } else if (clearIfNeeded) {
    lifecycleGhosttyPreedit(self.surface, NULL, 0, @"native terminal preedit clear");
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
  (void)lifecycleGhosttySurfaceKey(self.surface, keyEvent, @"native terminal key release");
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
  if (!lifecycleGhosttyImePoint(self.surface, &x, &y, &width, &height,
                                @"native terminal ime point")) {
    return [self.window convertRectToScreen:self.bounds];
  }

  NSRect localRect = NSMakeRect(x, self.bounds.size.height - y - height, width, height);
  NSRect windowRect = [self convertRect:localRect toView:nil];
  return [self.window convertRectToScreen:windowRect];
}

// ---------------------------------------------------------------------------
// NSDraggingDestination — accept image files dropped onto the terminal
// ---------------------------------------------------------------------------

static BOOL lifecycleDragInfoContainsImageFile(id<NSDraggingInfo> sender) {
  NSPasteboard *pasteboard = sender.draggingPasteboard;

  // Check for file URLs that are images.
  if ([pasteboard.types containsObject:NSPasteboardTypeFileURL]) {
    NSURL *url = [NSURL URLFromPasteboard:pasteboard];
    if (url == nil) {
      return NO;
    }
    NSString *extension = url.pathExtension.lowercaseString;
    NSSet<NSString *> *imageExtensions = [NSSet setWithObjects:@"png", @"jpg", @"jpeg", @"gif",
                                                               @"webp", @"bmp", @"tiff", @"tif",
                                                               @"heic", @"heif", @"avif", @"svg",
                                                               @"svgz", nil];
    return [imageExtensions containsObject:extension];
  }

  // Check for image data directly on the pasteboard.
  if ([pasteboard.types containsObject:NSPasteboardTypeTIFF] ||
      [pasteboard.types containsObject:NSPasteboardTypePNG]) {
    return YES;
  }

  return NO;
}

- (NSDragOperation)draggingEntered:(id<NSDraggingInfo>)sender {
  if (self.surface == NULL) {
    return NSDragOperationNone;
  }
  return lifecycleDragInfoContainsImageFile(sender) ? NSDragOperationCopy : NSDragOperationNone;
}

- (NSDragOperation)draggingUpdated:(id<NSDraggingInfo>)sender {
  if (self.surface == NULL) {
    return NSDragOperationNone;
  }
  return lifecycleDragInfoContainsImageFile(sender) ? NSDragOperationCopy : NSDragOperationNone;
}

- (BOOL)performDragOperation:(id<NSDraggingInfo>)sender {
  if (self.surface == NULL) {
    return NO;
  }

  NSPasteboard *pasteboard = sender.draggingPasteboard;
  NSData *imageData = nil;
  NSString *fileName = @"dropped-image.png";
  NSString *mediaType = @"image/png";

  // Prefer file URL — read bytes and preserve original file name / type.
  if ([pasteboard.types containsObject:NSPasteboardTypeFileURL]) {
    NSURL *url = [NSURL URLFromPasteboard:pasteboard];
    if (url != nil) {
      fileName = url.lastPathComponent ?: @"dropped-image.png";
      NSString *extension = url.pathExtension.lowercaseString;

      // Map extension → MIME type so the Rust side can pick the right format.
      NSDictionary<NSString *, NSString *> *mimeMap = @{
        @"png" : @"image/png",
        @"jpg" : @"image/jpeg",
        @"jpeg" : @"image/jpeg",
        @"gif" : @"image/gif",
        @"webp" : @"image/webp",
        @"bmp" : @"image/bmp",
        @"tiff" : @"image/tiff",
        @"tif" : @"image/tiff",
        @"heic" : @"image/heic",
        @"heif" : @"image/heif",
        @"avif" : @"image/avif",
        @"svg" : @"image/svg+xml",
        @"svgz" : @"image/svg+xml",
      };
      mediaType = mimeMap[extension] ?: @"image/png";
      imageData = [NSData dataWithContentsOfURL:url];
    }
  }

  // Fall back to pasteboard image data (e.g. dragged from another app as raw image).
  if (imageData == nil) {
    imageData = lifecycleNativeTerminalPNGDataForPasteboard(pasteboard);
    fileName = @"dropped-image.png";
    mediaType = @"image/png";
  }

  if (imageData.length == 0) {
    NSBeep();
    return NO;
  }

  lifecycleAppendDiagnosticLine([NSString
      stringWithFormat:@"[drop] terminal=%@ file=%@ imageBytes=%lu", self.terminalId, fileName,
                       (unsigned long)imageData.length]);

  char *payload = lifecycle_ghostty_terminal_prepare_paste_image(
      self.terminalId.UTF8String, fileName.UTF8String, mediaType.UTF8String,
      (const uint8_t *)imageData.bytes, imageData.length);

  if (payload == NULL) {
    lifecycleAppendDiagnosticLine([NSString
        stringWithFormat:@"[drop] terminal=%@ failed to persist dropped image", self.terminalId]);
    NSBeep();
    return NO;
  }

  NSString *attachmentText = [NSString stringWithUTF8String:payload];
  lifecycle_ghostty_terminal_free_string(payload);

  if (attachmentText.length > 0) {
    lifecycleGhosttySendText(self.surface, attachmentText);
  } else {
    lifecycleAppendDiagnosticLine([NSString
        stringWithFormat:@"[drop] terminal=%@ produced an empty attachment payload",
                         self.terminalId]);
    NSBeep();
    return NO;
  }

  return YES;
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
    char *payload = lifecycle_ghostty_terminal_prepare_paste_image(
        self.terminalId.UTF8String, "clipboard-image.png", "image/png",
        (const uint8_t *)imageData.bytes, imageData.length);
    if (payload == NULL) {
      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[paste] terminal=%@ failed to persist clipboard image",
                           self.terminalId]);
      NSBeep();
    } else {
      NSString *attachmentText = [NSString stringWithUTF8String:payload];
      lifecycle_ghostty_terminal_free_string(payload);
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

  if (!lifecycleGhosttyBindingAction(self.surface, "paste_from_clipboard",
                                     @"native terminal paste")) {
    NSBeep();
  }
}

- (void)copy:(id)sender {
  (void)sender;
  if (self.surface == NULL) {
    return;
  }

  (void)lifecycleGhosttyBindingAction(self.surface, "copy_to_clipboard", @"native terminal copy");
}

@end

static LifecycleGhosttyTerminalView *lifecycleTerminalViewForSurface(ghostty_surface_t surface) {
  if (surface == NULL) {
    return nil;
  }

  void *userdata = ghostty_surface_userdata(surface);
  if (userdata == NULL) {
    return nil;
  }

  return (__bridge LifecycleGhosttyTerminalView *)userdata;
}

static LifecycleGhosttyTerminalView *lifecycleTerminalViewForUserdata(void *userdata) {
  if (userdata == NULL) {
    return nil;
  }

  return (__bridge LifecycleGhosttyTerminalView *)userdata;
}

static void lifecycleRunOnMainThreadSync(dispatch_block_t block) {
  if (block == nil) {
    return;
  }

  if ([NSThread isMainThread]) {
    block();
    return;
  }

  dispatch_sync(dispatch_get_main_queue(), block);
}

static NSPasteboard *lifecyclePasteboardForGhosttyClipboard(ghostty_clipboard_e location) {
  switch (location) {
  case GHOSTTY_CLIPBOARD_STANDARD:
    return NSPasteboard.generalPasteboard;

  case GHOSTTY_CLIPBOARD_SELECTION:
    return [NSPasteboard pasteboardWithName:(NSPasteboardName)@"com.mitchellh.ghostty.selection"];

  default:
    return nil;
  }
}

static NSPasteboardType lifecyclePasteboardTypeForMimeType(NSString *mimeType) {
  if (mimeType.length == 0) {
    return nil;
  }

  if ([mimeType isEqualToString:@"text/plain"]) {
    return NSPasteboardTypeString;
  }

  if ([mimeType isEqualToString:@"text/html"]) {
    return NSPasteboardTypeHTML;
  }

  if ([mimeType isEqualToString:@"image/png"]) {
    return NSPasteboardTypePNG;
  }

  return mimeType;
}

static void lifecycleCompleteClipboardRequest(ghostty_surface_t surface,
                                              NSString *value,
                                              void *state,
                                              BOOL confirmed) {
  if (surface == NULL || state == NULL) {
    return;
  }

  const char *utf8 = (value ?: @"").UTF8String;
  ghostty_surface_complete_clipboard_request(surface, utf8 == NULL ? "" : utf8, state, confirmed);
}

static void lifecycleReadClipboard(void *userdata,
                                   ghostty_clipboard_e location,
                                   void *state) {
  LifecycleGhosttyTerminalView *view = lifecycleTerminalViewForUserdata(userdata);
  if (view == nil || view.surface == NULL) {
    lifecycleAppendDiagnosticLine(@"[clipboard] read request received without a valid surface");
    return;
  }

  lifecycleRunOnMainThreadSync(^{
    NSPasteboard *pasteboard = lifecyclePasteboardForGhosttyClipboard(location);
    NSString *value = [pasteboard stringForType:NSPasteboardTypeString] ?: @"";
    lifecycleCompleteClipboardRequest(view.surface, value, state, NO);
  });
}

static void lifecycleConfirmReadClipboard(void *userdata,
                                          const char *value,
                                          void *state,
                                          ghostty_clipboard_request_e request) {
  (void)request;
  LifecycleGhosttyTerminalView *view = lifecycleTerminalViewForUserdata(userdata);
  if (view == nil || view.surface == NULL) {
    lifecycleAppendDiagnosticLine(@"[clipboard] confirm request received without a valid surface");
    return;
  }

  NSString *string = value == NULL ? @"" : [NSString stringWithUTF8String:value];
  lifecycleRunOnMainThreadSync(^{
    // Lifecycle previously pasted directly from NSPasteboard without a native
    // confirmation prompt. Keep that permissive behavior until we add real UI.
    lifecycleCompleteClipboardRequest(view.surface, string, state, YES);
  });
}

static void lifecycleWriteClipboard(void *userdata,
                                    ghostty_clipboard_e location,
                                    const ghostty_clipboard_content_s *contents,
                                    size_t len,
                                    bool confirm) {
  (void)confirm;
  LifecycleGhosttyTerminalView *view = lifecycleTerminalViewForUserdata(userdata);
  NSString *terminalId = lifecycleResolvedTerminalId(view.terminalId);

  lifecycleRunOnMainThreadSync(^{
    NSPasteboard *pasteboard = lifecyclePasteboardForGhosttyClipboard(location);
    if (pasteboard == nil) {
      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[clipboard] terminal=%@ unsupported location=%d", terminalId,
                           (int)location]);
      return;
    }

    if (contents == NULL || len == 0) {
      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[clipboard] terminal=%@ empty write request location=%d", terminalId,
                           (int)location]);
      return;
    }

    NSMutableArray<NSPasteboardType> *types = [NSMutableArray array];
    NSMutableArray<NSDictionary<NSString *, NSString *> *> *items = [NSMutableArray array];
    for (size_t index = 0; index < len; index += 1) {
      const char *mimeBytes = contents[index].mime;
      const char *dataBytes = contents[index].data;
      if (mimeBytes == NULL || dataBytes == NULL) {
        continue;
      }

      NSString *mimeType = [NSString stringWithUTF8String:mimeBytes];
      NSString *value = [NSString stringWithUTF8String:dataBytes];
      NSPasteboardType pasteboardType = lifecyclePasteboardTypeForMimeType(mimeType);
      if (mimeType.length == 0 || value == nil || pasteboardType == nil) {
        continue;
      }

      [types addObject:pasteboardType];
      [items addObject:@{@"type" : pasteboardType, @"value" : value}];
    }

    if (items.count == 0) {
      lifecycleAppendDiagnosticLine([NSString
          stringWithFormat:@"[clipboard] terminal=%@ write request had no supported items",
                           terminalId]);
      return;
    }

    [pasteboard declareTypes:types owner:nil];
    for (NSDictionary<NSString *, NSString *> *item in items) {
      [pasteboard setString:item[@"value"] forType:item[@"type"]];
    }
  });
}

static BOOL lifecycleGhosttyTerminalHandleWorkspaceShortcut(LifecycleGhosttyTerminalView *view,
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

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"t"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutReopenClosedTab, 0);
    return YES;
  }

  if (!hasShift && [charactersIgnoringModifiers isEqualToString:@"w"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutCloseActiveTab, 0);
    return YES;
  }

  // Cmd+1-9: handled by the native app menu (select project by index).
  // Do NOT intercept here — let performKeyEquivalent: fall through so the
  // macOS menu accelerator fires regardless of terminal focus.

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"["]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutPreviousTab, 0);
    return YES;
  }

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"]"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutNextTab, 0);
    return YES;
  }

  if (!hasShift && [charactersIgnoringModifiers isEqualToString:@"["]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutGoBack, 0);
    return YES;
  }

  if (!hasShift && [charactersIgnoringModifiers isEqualToString:@"]"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutGoForward, 0);
    return YES;
  }

  if (hasShift && [charactersIgnoringModifiers isEqualToString:@"\r"]) {
    gWorkspaceShortcutCallback(view.terminalId.UTF8String, kLifecycleShortcutToggleZoom, 0);
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

  LifecycleGhosttyTerminalView *view = lifecycleTerminalViewForSurface(target.target.surface);
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

bool lifecycle_ghostty_terminal_initialize(LifecycleGhosttyTerminalExitCallback callback,
                                          LifecycleGhosttyWorkspaceShortcutCallback shortcutCallback) {
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
      runtime.read_clipboard_cb = lifecycleReadClipboard;
      runtime.confirm_read_clipboard_cb = lifecycleConfirmReadClipboard;
      runtime.write_clipboard_cb = lifecycleWriteClipboard;

      gGhosttyApp = ghostty_app_new(&runtime, gGhosttyConfig);
      if (gGhosttyApp == NULL) {
        lifecycleSetLastError(@"ghostty_app_new failed.");
        return false;
      }

      gExitCallback = callback;
      gWorkspaceShortcutCallback = shortcutCallback;
      gTerminalViews = [[NSMutableDictionary alloc] init];
      gLastError = nil;

      // Allow scroll-wheel events to reach terminal surfaces through SwiftUI canvas
      // chrome and AppKit hit-testing layers. Click focus still follows normal
      // hit-testing, but wheel input is terminal-owned whenever the pointer is
      // over a visible native terminal view.
      if (gScrollWheelMonitor == nil) {
        gScrollWheelMonitor = [NSEvent
            addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
                                        handler:^NSEvent *(NSEvent *event) {
                                          LifecycleGhosttyTerminalView *matchedView = nil;
                                          NSInteger matchedSubviewIndex = NSIntegerMin;

                                          for (NSView *candidate in gTerminalViews.allValues) {
                                            if (![candidate isKindOfClass:
                                                               [LifecycleGhosttyTerminalView
                                                                   class]]) {
                                              continue;
                                            }

                                            LifecycleGhosttyTerminalView *terminalView =
                                                (LifecycleGhosttyTerminalView *)candidate;
                                            if (terminalView.hidden || terminalView.surface == NULL) {
                                              continue;
                                            }

                                            if (terminalView.window != event.window) {
                                              continue;
                                            }

                                            NSPoint pointInView =
                                                [terminalView convertPoint:event.locationInWindow
                                                                  fromView:nil];
                                            if (!NSPointInRect(pointInView, terminalView.bounds)) {
                                              continue;
                                            }

                                            NSArray<NSView *> *siblings =
                                                terminalView.superview.subviews;
                                            NSUInteger subviewIndex =
                                                [siblings indexOfObjectIdenticalTo:terminalView];
                                            NSInteger sortableSubviewIndex =
                                                subviewIndex == NSNotFound
                                                    ? NSIntegerMin
                                                    : (NSInteger)subviewIndex;
                                            if (matchedView == nil ||
                                                sortableSubviewIndex >= matchedSubviewIndex) {
                                              matchedView = terminalView;
                                              matchedSubviewIndex = sortableSubviewIndex;
                                            }
                                          }

                                          if (matchedView != nil) {
                                            [matchedView scrollWheel:event];
                                            return nil;
                                          }

                                          return event;
                                        }];
      }

      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal initialization threw an exception",
                                         exception);
      return false;
    }
  }
}

const char *lifecycle_ghostty_terminal_last_error(void) {
  return gLastError.UTF8String;
}

void lifecycle_ghostty_terminal_install_diagnostics(const char *log_path) {
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

static BOOL lifecycleApplySurfaceTheme(LifecycleGhosttyTerminalView *view,
                                       const LifecycleGhosttyTerminalConfig *config) {
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

static NSRect lifecycleFrameForConfig(NSView *webview, const LifecycleGhosttyTerminalConfig *config) {
  NSRect webviewFrame = webview.frame;
  NSRect frame =
      NSMakeRect(webviewFrame.origin.x + config->x,
                 webviewFrame.origin.y + webviewFrame.size.height - config->y - config->height,
                 config->width, config->height);
  NSView *container = webview.superview;
  if (container == nil) {
    return frame;
  }

  return [container backingAlignedRect:frame options:NSAlignAllEdgesNearest];
}

static double lifecycleResolvedScaleFactor(double requestedScaleFactor) {
  if (requestedScaleFactor > 0.0) {
    return requestedScaleFactor;
  }

  NSScreen *screen = NSScreen.mainScreen;
  return screen ? screen.backingScaleFactor : 2.0;
}

static LifecycleGhosttyTerminalView *lifecycleCreateTerminalView(
    const LifecycleGhosttyTerminalConfig *config) {
  NSString *terminalId = [NSString stringWithUTF8String:config->terminal_id];
  LifecycleGhosttyTerminalView *view =
      [[LifecycleGhosttyTerminalView alloc] initWithTerminalId:terminalId];

  ghostty_surface_config_s surfaceConfig = ghostty_surface_config_new();
  surfaceConfig.platform_tag = GHOSTTY_PLATFORM_MACOS;
  surfaceConfig.platform.macos.nsview = (__bridge void *)view;
  surfaceConfig.userdata = (__bridge void *)view;
  surfaceConfig.scale_factor = lifecycleResolvedScaleFactor(config->scale_factor);
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

bool lifecycle_ghostty_terminal_sync(void *webview_view,
                                    const LifecycleGhosttyTerminalConfig *config) {
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
      LifecycleGhosttyTerminalView *view = (LifecycleGhosttyTerminalView *)gTerminalViews[terminalId];
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
      CGFloat alpha = config->opacity;
      if (alpha < 0.0) {
        alpha = 0.0;
      } else if (alpha > 1.0) {
        alpha = 1.0;
      }
      [view setFrame:targetFrame];
      if (view.alphaValue != alpha) {
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
          context.duration = 0.2;
          context.timingFunction =
              [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
          view.animator.alphaValue = alpha;
          view.layer.opacity = (float)alpha;
        }];
      }
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

      BOOL previousPointerPassthrough = view.pointerPassthrough;
      BOOL previousWantsFocus = view.wantsFocus;
      BOOL previousHidden = view.hidden;
      BOOL nextPointerPassthrough = config->pointer_passthrough;
      BOOL nextWantsFocus = config->focused && !config->hidden;
      BOOL nextHidden = config->hidden;

      view.pointerPassthrough = nextPointerPassthrough;
      view.wantsFocus = nextWantsFocus;
      if (previousHidden != nextHidden) {
        view.hidden = nextHidden;
      }
      [view syncGhosttyFocusState];

      BOOL focusStateChanged = previousPointerPassthrough != nextPointerPassthrough ||
                               previousWantsFocus != nextWantsFocus ||
                               previousHidden != nextHidden;
      if (focusStateChanged && previousHidden == nextHidden) {
        [view requestFocusIfNeeded];
      }

      gLastError = nil;
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal sync threw an exception", exception);
      return false;
    }
  }
}

bool lifecycle_ghostty_terminal_sync_frame(void *webview_view,
                                          const LifecycleGhosttyTerminalFrameConfig *config) {
  @autoreleasepool {
    @try {
      if (gGhosttyApp == NULL) {
        lifecycleSetLastError(@"Ghostty runtime is not initialized.");
        return false;
      }

      if (webview_view == NULL || config == NULL || config->terminal_id == NULL) {
        lifecycleSetLastError(@"Native terminal frame sync received incomplete arguments.");
        return false;
      }

      NSView *webview = (__bridge NSView *)webview_view;
      NSView *container = webview.superview;
      if (container == nil) {
        lifecycleSetLastError(@"Tauri webview has no superview for native terminal mounting.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:config->terminal_id];
      LifecycleGhosttyTerminalView *view = (LifecycleGhosttyTerminalView *)gTerminalViews[terminalId];
      if (view == nil) {
        gLastError = nil;
        return true;
      }

      if (view.superview != container) {
        [view removeFromSuperview];
        [container addSubview:view positioned:NSWindowAbove relativeTo:webview];
      }

      LifecycleGhosttyTerminalConfig frameOnlyConfig = {
          .terminal_id = config->terminal_id,
          .working_directory = NULL,
          .command = NULL,
          .background_color = NULL,
          .theme_config_path = NULL,
          .x = config->x,
          .y = config->y,
          .width = config->width,
          .height = config->height,
          .font_size = 0,
          .scale_factor = 0,
          .opacity = 1.0,
          .focused = false,
          .pointer_passthrough = false,
          .hidden = false,
          .dark = false,
      };
      NSRect targetFrame = lifecycleFrameForConfig(webview, &frameOnlyConfig);
      [view setFrame:targetFrame];
      [view syncContentScale];

      gLastError = nil;
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal frame sync threw an exception",
                                         exception);
      return false;
    }
  }
}

bool lifecycle_ghostty_terminal_hide(const char *terminal_id) {
  @autoreleasepool {
    @try {
      if (terminal_id == NULL) {
        lifecycleSetLastError(@"Native terminal hide is missing a terminal id.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:terminal_id];
      LifecycleGhosttyTerminalView *view = (LifecycleGhosttyTerminalView *)gTerminalViews[terminalId];
      if (view == nil) {
        return true;
      }

      view.hidden = YES;
      if (view.surface != NULL) {
        ghostty_surface_set_focus(view.surface, false);
        ghostty_surface_set_occlusion(view.surface, false);
      }
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal hide threw an exception", exception);
      return false;
    }
  }
}

bool lifecycle_ghostty_terminal_close(const char *terminal_id) {
  @autoreleasepool {
    @try {
      if (terminal_id == NULL) {
        lifecycleSetLastError(@"Native terminal close is missing a terminal id.");
        return false;
      }

      NSString *terminalId = [NSString stringWithUTF8String:terminal_id];
      LifecycleGhosttyTerminalView *view = (LifecycleGhosttyTerminalView *)gTerminalViews[terminalId];
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

bool lifecycle_ghostty_terminal_send_text(const char *terminal_id, const char *text, size_t text_len) {
  @autoreleasepool {
    @try {
      if (terminal_id == NULL || text == NULL || text_len == 0) {
        lifecycleSetLastError(@"Native terminal send_text is missing required arguments.");
        return false;
      }
      NSString *terminalId = [NSString stringWithUTF8String:terminal_id];
      LifecycleGhosttyTerminalView *view = (LifecycleGhosttyTerminalView *)gTerminalViews[terminalId];
      if (view == nil || view.surface == NULL) {
        lifecycleSetLastError(@"Native terminal view not found for send_text.");
        return false;
      }
      ghostty_surface_text(view.surface, text, text_len);
      return true;
    } @catch (NSException *exception) {
      lifecycleSetLastErrorFromException(@"Native terminal send_text threw an exception", exception);
      return false;
    }
  }
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

void lifecycle_ghostty_set_application_appearance(const char *appearance_name) {
  if ([NSThread isMainThread]) {
    lifecycleSetApplicationAppearanceMainThread(appearance_name);
    return;
  }

  dispatch_sync(dispatch_get_main_queue(), ^{
    lifecycleSetApplicationAppearanceMainThread(appearance_name);
  });
}
