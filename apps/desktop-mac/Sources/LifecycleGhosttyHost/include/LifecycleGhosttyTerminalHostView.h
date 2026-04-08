#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface LifecycleGhosttyTerminalHostView : NSView

@property(nonatomic, copy) NSString *terminalID;
@property(nonatomic, copy, nullable) NSString *workingDirectory;
@property(nonatomic, copy, nullable) NSString *command;
@property(nonatomic, copy) NSString *backgroundHexColor;
@property(nonatomic, copy) NSString *themeConfigPath;
@property(nonatomic, assign) BOOL darkAppearance;
@property(nonatomic, assign) BOOL focusedTerminal;
@property(nonatomic, assign) BOOL hiddenTerminal;
@property(nonatomic, assign) BOOL pointerPassthrough;
@property(nonatomic, assign) CGFloat terminalFontSize;
@property(nonatomic, copy, readonly, nullable) NSString *lastError;

- (instancetype)initWithTerminalID:(NSString *)terminalID NS_DESIGNATED_INITIALIZER;
+ (void)closeTerminalHostWithID:(NSString *)terminalID;
- (void)syncTerminal;
- (void)sendText:(NSString *)text;

@end

NS_ASSUME_NONNULL_END
