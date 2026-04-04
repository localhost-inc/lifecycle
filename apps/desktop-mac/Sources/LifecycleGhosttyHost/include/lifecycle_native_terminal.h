#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <stdbool.h>
#import <stdint.h>

typedef void (*LifecycleNativeTerminalExitCallback)(const char *terminal_id, int32_t exit_code);
typedef void (*LifecycleNativeWorkspaceShortcutCallback)(const char *terminal_id,
                                                         int32_t shortcut_kind,
                                                         int32_t shortcut_index);

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
} LifecycleNativeTerminalConfig;

typedef struct {
  const char *terminal_id;
  double x;
  double y;
  double width;
  double height;
} LifecycleNativeTerminalFrameConfig;

bool lifecycle_native_terminal_initialize(LifecycleNativeTerminalExitCallback callback,
                                          LifecycleNativeWorkspaceShortcutCallback shortcutCallback);
const char *lifecycle_native_terminal_last_error(void);
void lifecycle_native_terminal_install_diagnostics(const char *log_path);
bool lifecycle_native_terminal_sync(void *webview_view,
                                    const LifecycleNativeTerminalConfig *config);
bool lifecycle_native_terminal_sync_frame(void *webview_view,
                                          const LifecycleNativeTerminalFrameConfig *config);
bool lifecycle_native_terminal_hide(const char *terminal_id);
bool lifecycle_native_terminal_close(const char *terminal_id);
bool lifecycle_native_terminal_send_text(const char *terminal_id, const char *text, size_t text_len);
void lifecycle_native_set_application_appearance(const char *appearance_name);
