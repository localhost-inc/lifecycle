#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LifecycleTerminalHostConfiguration : NSObject <NSCopying>

@property(nonatomic, copy, readonly) NSString *workingDirectory;
@property(nonatomic, copy, readonly) NSString *command;
@property(nonatomic, copy, readonly) NSString *backgroundHexColor;
@property(nonatomic, copy, readonly) NSString *themeConfigPath;
@property(nonatomic, assign, readonly) BOOL darkAppearance;
@property(nonatomic, assign, readonly) BOOL focusedTerminal;
@property(nonatomic, assign, readonly) BOOL hiddenTerminal;
@property(nonatomic, assign, readonly) BOOL pointerPassthrough;
@property(nonatomic, assign, readonly) CGFloat terminalFontSize;

- (instancetype)initWithWorkingDirectory:(NSString *)workingDirectory
                                 command:(NSString *)command
                      backgroundHexColor:(NSString *)backgroundHexColor
                         themeConfigPath:(NSString *)themeConfigPath
                          darkAppearance:(BOOL)darkAppearance
                         focusedTerminal:(BOOL)focusedTerminal
                          hiddenTerminal:(BOOL)hiddenTerminal
                     pointerPassthrough:(BOOL)pointerPassthrough
                        terminalFontSize:(CGFloat)terminalFontSize NS_DESIGNATED_INITIALIZER;

- (instancetype)init NS_UNAVAILABLE;
+ (instancetype)new NS_UNAVAILABLE;

@end

NS_ASSUME_NONNULL_END
