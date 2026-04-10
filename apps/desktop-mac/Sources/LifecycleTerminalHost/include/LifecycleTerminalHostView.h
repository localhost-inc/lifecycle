#import <AppKit/AppKit.h>
#import "LifecycleTerminalHostConfiguration.h"

NS_ASSUME_NONNULL_BEGIN

@interface LifecycleTerminalHostView : NSView

@property(nonatomic, copy, readonly) NSString *terminalID;
@property(nonatomic, copy, readonly, nullable) NSString *lastError;

- (instancetype)initWithTerminalID:(NSString *)terminalID NS_DESIGNATED_INITIALIZER;
+ (void)closeTerminalWithID:(NSString *)terminalID;
- (void)applyHostConfiguration:(LifecycleTerminalHostConfiguration *)configuration
    NS_SWIFT_NAME(applyHostConfiguration(_:));
- (void)sendText:(NSString *)text;

@end

NS_ASSUME_NONNULL_END
