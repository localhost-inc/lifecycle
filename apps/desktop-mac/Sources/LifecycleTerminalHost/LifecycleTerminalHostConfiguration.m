#import "LifecycleTerminalHostConfiguration.h"

@implementation LifecycleTerminalHostConfiguration

- (instancetype)initWithWorkingDirectory:(NSString *)workingDirectory
                                 command:(NSString *)command
                      backgroundHexColor:(NSString *)backgroundHexColor
                         themeConfigPath:(NSString *)themeConfigPath
                          darkAppearance:(BOOL)darkAppearance
                         focusedTerminal:(BOOL)focusedTerminal
                          hiddenTerminal:(BOOL)hiddenTerminal
                     pointerPassthrough:(BOOL)pointerPassthrough
                        terminalFontSize:(CGFloat)terminalFontSize {
  self = [super init];
  if (self == nil) {
    return nil;
  }

  _workingDirectory = [workingDirectory copy];
  _command = [command copy];
  _backgroundHexColor = [backgroundHexColor copy];
  _themeConfigPath = [themeConfigPath copy];
  _darkAppearance = darkAppearance;
  _focusedTerminal = focusedTerminal;
  _hiddenTerminal = hiddenTerminal;
  _pointerPassthrough = pointerPassthrough;
  _terminalFontSize = terminalFontSize;
  return self;
}

- (id)copyWithZone:(NSZone *)zone {
  (void)zone;
  return self;
}

- (BOOL)isEqual:(id)object {
  if (self == object) {
    return YES;
  }

  if (![object isKindOfClass:[LifecycleTerminalHostConfiguration class]]) {
    return NO;
  }

  LifecycleTerminalHostConfiguration *other =
      (LifecycleTerminalHostConfiguration *)object;
  return [self.workingDirectory isEqualToString:other.workingDirectory] &&
         [self.command isEqualToString:other.command] &&
         [self.backgroundHexColor isEqualToString:other.backgroundHexColor] &&
         [self.themeConfigPath isEqualToString:other.themeConfigPath] &&
         self.darkAppearance == other.darkAppearance &&
         self.focusedTerminal == other.focusedTerminal &&
         self.hiddenTerminal == other.hiddenTerminal &&
         self.pointerPassthrough == other.pointerPassthrough &&
         self.terminalFontSize == other.terminalFontSize;
}

- (NSUInteger)hash {
  return self.workingDirectory.hash ^ self.command.hash ^ self.backgroundHexColor.hash ^
         self.themeConfigPath.hash ^ (self.darkAppearance ? 0x1 : 0x0) ^
         (self.focusedTerminal ? 0x2 : 0x0) ^ (self.hiddenTerminal ? 0x4 : 0x0) ^
         (self.pointerPassthrough ? 0x8 : 0x0) ^ @(self.terminalFontSize).hash;
}

@end
