#import "LifecycleGhosttyTerminalHostView.h"

#import "LifecycleGhosttyTerminalRuntime.h"

@interface LifecycleGhosttyTerminalHostView ()

@property(nonatomic, copy, readwrite, nullable) NSString *lastError;

@end

@implementation LifecycleGhosttyTerminalHostView {
  BOOL _closed;
  NSView *_placeholderView;
  NSString *_mountedTerminalID;
  NSString *_mountedWorkingDirectory;
  NSString *_mountedCommand;
}

+ (BOOL)ensureGhosttyRuntime {
  static BOOL initialized = NO;
  static BOOL attempted = NO;

  if (attempted) {
    return initialized;
  }

  attempted = YES;
  initialized = lifecycle_native_terminal_initialize(NULL, NULL);
  return initialized;
}

+ (NSString *)runtimeError {
  const char *message = lifecycle_native_terminal_last_error();
  if (message == NULL || message[0] == '\0') {
    return @"Ghostty runtime initialization failed.";
  }

  return [NSString stringWithUTF8String:message] ?: @"Ghostty runtime initialization failed.";
}

+ (void)closeTerminalHostWithID:(NSString *)terminalID {
  if (terminalID.length == 0) {
    return;
  }

  lifecycle_native_terminal_close(terminalID.UTF8String);
}

- (instancetype)initWithFrame:(NSRect)frameRect {
  return [self initWithTerminalID:[NSUUID UUID].UUIDString];
}

- (instancetype)initWithCoder:(NSCoder *)coder {
  self = [self initWithTerminalID:[NSUUID UUID].UUIDString];
  return self;
}

- (instancetype)initWithTerminalID:(NSString *)terminalID {
  self = [super initWithFrame:NSZeroRect];
  if (self == nil) {
    return nil;
  }

  [self commonInitWithTerminalID:terminalID];
  return self;
}

- (void)commonInitWithTerminalID:(NSString *)terminalID {
  _terminalID = [terminalID copy];
  _backgroundHexColor = @"#181614";
  _themeConfigPath = @"";
  _darkAppearance = YES;
  _focusedTerminal = YES;
  _hiddenTerminal = NO;
  _pointerPassthrough = NO;
  _terminalFontSize = 13.0;
  _closed = NO;

  self.wantsLayer = YES;
  self.layer.backgroundColor = NSColor.blackColor.CGColor;

  _placeholderView = [[NSView alloc] initWithFrame:self.bounds];
  _placeholderView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  _placeholderView.wantsLayer = YES;
  _placeholderView.layer.backgroundColor = NSColor.clearColor.CGColor;
  [self addSubview:_placeholderView];
}

- (BOOL)isFlipped {
  return YES;
}

- (void)layout {
  [super layout];
  _placeholderView.frame = self.bounds;
  [self syncTerminal];
}

- (void)resetMountedTerminalIfNeeded {
  if (_mountedTerminalID.length == 0) {
    return;
  }

  BOOL terminalChanged = ![_mountedTerminalID isEqualToString:self.terminalID ?: @""];
  BOOL workingDirectoryChanged =
      ![_mountedWorkingDirectory ?: @"" isEqualToString:self.workingDirectory ?: @""];
  BOOL commandChanged = ![_mountedCommand ?: @"" isEqualToString:self.command ?: @""];

  if (!terminalChanged && !workingDirectoryChanged && !commandChanged) {
    return;
  }

  lifecycle_native_terminal_close(_mountedTerminalID.UTF8String);
  _mountedTerminalID = nil;
  _mountedWorkingDirectory = nil;
  _mountedCommand = nil;
  _closed = YES;
}

- (void)syncTerminal {
  if (self.bounds.size.width <= 0 || self.bounds.size.height <= 0) {
    return;
  }

  if (self.workingDirectory.length == 0 || self.command.length == 0) {
    self.lastError = @"Terminal configuration is incomplete.";
    return;
  }

  if (![LifecycleGhosttyTerminalHostView ensureGhosttyRuntime]) {
    self.lastError = [LifecycleGhosttyTerminalHostView runtimeError];
    return;
  }

  [self resetMountedTerminalIfNeeded];
  _closed = NO;
  _placeholderView.frame = self.bounds;

  LifecycleNativeTerminalConfig config = {
      .terminal_id = self.terminalID.UTF8String,
      .working_directory = self.workingDirectory.UTF8String,
      .command = self.command.UTF8String,
      .background_color = self.backgroundHexColor.UTF8String,
      .theme_config_path = self.themeConfigPath.UTF8String,
      .x = 0,
      .y = 0,
      .width = self.bounds.size.width,
      .height = self.bounds.size.height,
      .font_size = self.terminalFontSize,
      .scale_factor = 0,
      .opacity = 1.0,
      .focused = self.focusedTerminal,
      .pointer_passthrough = self.pointerPassthrough,
      .hidden = self.hiddenTerminal,
      .dark = self.darkAppearance,
  };

  if (!lifecycle_native_terminal_sync((__bridge void *)_placeholderView, &config)) {
    const char *message = lifecycle_native_terminal_last_error();
    if (message != NULL && message[0] != '\0') {
      self.lastError = [NSString stringWithUTF8String:message];
    } else {
      self.lastError = @"Failed to sync Ghostty terminal surface.";
    }
    return;
  }

  _mountedTerminalID = [self.terminalID copy];
  _mountedWorkingDirectory = [self.workingDirectory copy];
  _mountedCommand = [self.command copy];
  self.lastError = nil;
}

- (void)sendText:(NSString *)text {
  if (text.length == 0 || self.terminalID.length == 0) {
    return;
  }

  lifecycle_native_terminal_send_text(self.terminalID.UTF8String, text.UTF8String, text.length);
}

@end
