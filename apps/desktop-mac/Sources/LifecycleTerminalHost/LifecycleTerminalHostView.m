#import "LifecycleTerminalHostView.h"

#import "LifecycleGhosttyTerminalRuntime.h"
#import <math.h>
#import <QuartzCore/QuartzCore.h>

@interface LifecycleTerminalHostView ()

@property(nonatomic, copy, readwrite) NSString *terminalID;
@property(nonatomic, copy, readwrite, nullable) NSString *lastError;
@property(nonatomic, copy, nullable) LifecycleTerminalHostConfiguration *configuration;
@property(nonatomic, copy, nullable) LifecycleTerminalHostConfiguration *appliedConfiguration;

@end

@implementation LifecycleTerminalHostView {
  NSView *_placeholderView;
  NSString *_mountedWorkingDirectory;
  NSString *_mountedCommand;
  CGFloat _mountedFontSize;
  BOOL _hasMountedFontSize;
  BOOL _terminalSyncScheduled;
}

+ (BOOL)ensureGhosttyRuntime {
  static BOOL initialized = NO;
  static BOOL attempted = NO;

  if (attempted) {
    return initialized;
  }

  attempted = YES;
  initialized = lifecycle_ghostty_terminal_initialize(NULL, NULL);
  return initialized;
}

+ (NSString *)runtimeError {
  const char *message = lifecycle_ghostty_terminal_last_error();
  if (message == NULL || message[0] == '\0') {
    return @"Terminal host runtime initialization failed.";
  }

  return [NSString stringWithUTF8String:message] ?: @"Terminal host runtime initialization failed.";
}

+ (void)closeTerminalWithID:(NSString *)terminalID {
  if (terminalID.length == 0) {
    return;
  }

  lifecycle_ghostty_terminal_close(terminalID.UTF8String);
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

  self.wantsLayer = YES;
  self.layer.backgroundColor = NSColor.blackColor.CGColor;
  self.layer.magnificationFilter = kCAFilterNearest;
  self.layer.minificationFilter = kCAFilterNearest;
  self.layer.allowsEdgeAntialiasing = NO;

  _placeholderView = [[NSView alloc] initWithFrame:self.bounds];
  _placeholderView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  _placeholderView.wantsLayer = YES;
  _placeholderView.layer.backgroundColor = NSColor.clearColor.CGColor;
  [self addSubview:_placeholderView];
}

- (BOOL)isFlipped {
  return YES;
}

- (NSSize)intrinsicContentSize {
  return NSMakeSize(NSViewNoIntrinsicMetric, NSViewNoIntrinsicMetric);
}

- (NSSize)fittingSize {
  return self.bounds.size;
}

- (void)layout {
  [super layout];
  _placeholderView.frame = self.bounds;
  [self scheduleTerminalSync];
}

- (void)setFrame:(NSRect)frameRect {
  [super setFrame:frameRect];
  [self scheduleTerminalSync];
}

- (void)setBounds:(NSRect)bounds {
  [super setBounds:bounds];
  _placeholderView.frame = self.bounds;
  [self scheduleTerminalSync];
}

- (void)viewDidMoveToWindow {
  [super viewDidMoveToWindow];
  [self scheduleTerminalSync];
}

- (void)applyHostConfiguration:(LifecycleTerminalHostConfiguration *)configuration {
  if ([_configuration isEqual:configuration]) {
    if (_appliedConfiguration == nil || ![_appliedConfiguration isEqual:configuration]) {
      [self syncTerminalIfNeeded];
    }
    return;
  }

  _configuration = [configuration copy];
  [self syncTerminalIfNeeded];
  [self scheduleTerminalSync];
}

- (BOOL)configurationIsComplete:(LifecycleTerminalHostConfiguration *)configuration {
  return configuration.workingDirectory.length > 0 && configuration.command.length > 0;
}

- (void)resetMountedTerminalIfNeeded {
  if (_mountedWorkingDirectory.length == 0 && _mountedCommand.length == 0) {
    return;
  }

  BOOL workingDirectoryChanged =
      ![_mountedWorkingDirectory ?: @"" isEqualToString:_configuration.workingDirectory ?: @""];
  BOOL commandChanged = ![_mountedCommand ?: @"" isEqualToString:_configuration.command ?: @""];
  BOOL fontSizeChanged = _hasMountedFontSize &&
                         fabs(_mountedFontSize - _configuration.terminalFontSize) > 0.01;
  if (!workingDirectoryChanged && !commandChanged && !fontSizeChanged) {
    return;
  }

  lifecycle_ghostty_terminal_close(self.terminalID.UTF8String);
  _mountedWorkingDirectory = nil;
  _mountedCommand = nil;
  _mountedFontSize = 0;
  _hasMountedFontSize = NO;
  _appliedConfiguration = nil;
}

- (LifecycleGhosttyTerminalFrameConfig)frameConfig {
  return (LifecycleGhosttyTerminalFrameConfig){
      .terminal_id = self.terminalID.UTF8String,
      .x = 0,
      .y = 0,
      .width = self.bounds.size.width,
      .height = self.bounds.size.height,
  };
}

- (BOOL)syncMountedFrameIfPossible {
  if (_appliedConfiguration == nil || _mountedWorkingDirectory.length == 0 ||
      _mountedCommand.length == 0) {
    return NO;
  }

  LifecycleGhosttyTerminalFrameConfig config = [self frameConfig];
  if (lifecycle_ghostty_terminal_sync_frame((__bridge void *)_placeholderView, &config)) {
    self.lastError = nil;
    return YES;
  }

  return NO;
}

- (void)scheduleTerminalSync {
  if (_terminalSyncScheduled) {
    return;
  }

  _terminalSyncScheduled = YES;
  __weak LifecycleTerminalHostView *weakSelf = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    LifecycleTerminalHostView *strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }

    strongSelf->_terminalSyncScheduled = NO;
    [strongSelf syncTerminalIfNeeded];
  });
}

- (void)syncTerminalIfNeeded {
  if (self.bounds.size.width <= 0 || self.bounds.size.height <= 0) {
    return;
  }

  if (_configuration == nil || ![self configurationIsComplete:_configuration]) {
    self.lastError = @"Terminal configuration is incomplete.";
    return;
  }

  if (![LifecycleTerminalHostView ensureGhosttyRuntime]) {
    self.lastError = [LifecycleTerminalHostView runtimeError];
    return;
  }

  [self resetMountedTerminalIfNeeded];
  _placeholderView.frame = self.bounds;

  if ([_appliedConfiguration isEqual:_configuration] && [self syncMountedFrameIfPossible]) {
    return;
  }

  LifecycleGhosttyTerminalConfig config = {
      .terminal_id = self.terminalID.UTF8String,
      .working_directory = _configuration.workingDirectory.UTF8String,
      .command = _configuration.command.UTF8String,
      .background_color = _configuration.backgroundHexColor.UTF8String,
      .theme_config_path = _configuration.themeConfigPath.UTF8String,
      .x = 0,
      .y = 0,
      .width = self.bounds.size.width,
      .height = self.bounds.size.height,
      .font_size = _configuration.terminalFontSize,
      .scale_factor = 0,
      .opacity = 1.0,
      .focused = _configuration.focusedTerminal,
      .pointer_passthrough = _configuration.pointerPassthrough,
      .hidden = _configuration.hiddenTerminal,
      .dark = _configuration.darkAppearance,
  };

  if (!lifecycle_ghostty_terminal_sync((__bridge void *)_placeholderView, &config)) {
    const char *message = lifecycle_ghostty_terminal_last_error();
    if (message != NULL && message[0] != '\0') {
      self.lastError = [NSString stringWithUTF8String:message];
    } else {
      self.lastError = @"Failed to sync terminal host surface.";
    }
    return;
  }

  _mountedWorkingDirectory = [_configuration.workingDirectory copy];
  _mountedCommand = [_configuration.command copy];
  _mountedFontSize = _configuration.terminalFontSize;
  _hasMountedFontSize = YES;
  _appliedConfiguration = [_configuration copy];
  self.lastError = nil;
}

- (void)sendText:(NSString *)text {
  if (text.length == 0 || self.terminalID.length == 0) {
    return;
  }

  NSData *utf8Data = [text dataUsingEncoding:NSUTF8StringEncoding];
  if (utf8Data.length == 0) {
    return;
  }

  lifecycle_ghostty_terminal_send_text(
      self.terminalID.UTF8String, utf8Data.bytes, utf8Data.length);
}

@end
