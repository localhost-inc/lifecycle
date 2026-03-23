#[path = "terminal/attachments.rs"]
mod attachments;
#[path = "terminal/events.rs"]
mod events;
#[path = "terminal/launch.rs"]
mod launch;
#[path = "terminal/native_surface.rs"]
mod native_surface;
#[path = "terminal/persistence.rs"]
mod persistence;
#[path = "terminal/runtime.rs"]
mod runtime;
#[path = "terminal/types.rs"]
mod types;

#[allow(unused_imports)]
pub(crate) use attachments::{prepare_native_terminal_attachment_paste, save_terminal_attachment};
pub(crate) use persistence::load_terminal_record;
#[allow(unused_imports)]
pub(crate) use runtime::{
    complete_native_terminal_exit, create_terminal, detach_terminal, hide_native_terminal_surface,
    interrupt_terminal, kill_terminal, send_terminal_text, sync_native_terminal_surface,
    sync_native_terminal_surface_frame,
};
pub(crate) use types::{
    NativeTerminalSurfaceFrameSyncInput, NativeTerminalSurfaceSyncInput, SavedTerminalAttachment,
};
