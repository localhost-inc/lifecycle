#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>
#import <stdbool.h>
#import <stdint.h>

// Private Ghostty runtime bridge used by LifecycleTerminalHostView.
// The C symbols stay snake_case because they expose a C ABI within the host target.

typedef void (*LifecycleGhosttyTerminalExitCallback)(const char *terminal_id, int32_t exit_code);
typedef void (*LifecycleGhosttyWorkspaceShortcutCallback)(const char *terminal_id,
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
} LifecycleGhosttyTerminalConfig;

typedef struct {
  const char *terminal_id;
  double x;
  double y;
  double width;
  double height;
} LifecycleGhosttyTerminalFrameConfig;

bool lifecycle_ghostty_terminal_initialize(LifecycleGhosttyTerminalExitCallback callback,
                                          LifecycleGhosttyWorkspaceShortcutCallback shortcutCallback);
const char *lifecycle_ghostty_terminal_last_error(void);
void lifecycle_ghostty_terminal_install_diagnostics(const char *log_path);
bool lifecycle_ghostty_terminal_sync(void *webview_view,
                                    const LifecycleGhosttyTerminalConfig *config);
bool lifecycle_ghostty_terminal_sync_frame(void *webview_view,
                                          const LifecycleGhosttyTerminalFrameConfig *config);
bool lifecycle_ghostty_terminal_hide(const char *terminal_id);
bool lifecycle_ghostty_terminal_close(const char *terminal_id);
bool lifecycle_ghostty_terminal_send_text(const char *terminal_id, const char *text, size_t text_len);
void lifecycle_ghostty_set_application_appearance(const char *appearance_name);
