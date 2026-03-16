use crate::shared::errors::LifecycleError;
use serde::Deserialize;
use tauri::WebviewWindow;

#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ContextMenuEntry {
    #[serde(rename_all = "camelCase")]
    Item {
        id: String,
        label: String,
        #[serde(default)]
        destructive: bool,
        #[serde(default)]
        disabled: bool,
    },
    Separator,
    #[serde(rename_all = "camelCase")]
    Submenu {
        label: String,
        items: Vec<ContextMenuEntry>,
    },
}

#[tauri::command]
pub async fn show_context_menu(
    window: WebviewWindow,
    items: Vec<ContextMenuEntry>,
) -> Result<Option<String>, LifecycleError> {
    #[cfg(target_os = "macos")]
    {
        return macos::show_context_menu_impl(window, items).await;
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (&window, &items);
        Ok(None)
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use super::{ContextMenuEntry, LifecycleError};
    use objc2::rc::Retained;
    use objc2::runtime::AnyObject;
    use objc2::sel;
    use objc2::{define_class, msg_send, AllocAnyThread, MainThreadOnly};
    use objc2_app_kit::{NSApplication, NSColor, NSMenu, NSMenuItem, NSView};
    use objc2_foundation::{ns_string, NSAttributedString, NSObject, NSString};
    use std::cell::Cell;
    use tauri::WebviewWindow;

    thread_local! {
        static SELECTED_TAG: Cell<isize> = const { Cell::new(-1) };
    }

    define_class!(
        #[unsafe(super(NSObject))]
        #[name = "LCContextMenuTarget"]
        #[thread_kind = MainThreadOnly]
        struct ContextMenuTarget;

        impl ContextMenuTarget {
            #[unsafe(method(menuItemClicked:))]
            fn menu_item_clicked(&self, sender: &NSMenuItem) {
                SELECTED_TAG.set(sender.tag());
            }
        }
    );

    impl ContextMenuTarget {
        fn new(mtm: objc2::MainThreadMarker) -> Retained<Self> {
            unsafe { msg_send![Self::alloc(mtm), init] }
        }
    }

    fn build_menu(
        entries: &[ContextMenuEntry],
        target: &ContextMenuTarget,
        id_map: &mut Vec<String>,
        mtm: objc2::MainThreadMarker,
    ) -> Retained<NSMenu> {
        let menu = NSMenu::new(mtm);
        menu.setAutoenablesItems(false);

        for entry in entries {
            match entry {
                ContextMenuEntry::Item {
                    id,
                    label,
                    destructive,
                    disabled,
                } => {
                    let tag = id_map.len() as isize;
                    id_map.push(id.clone());

                    let title = NSString::from_str(label);
                    let item = unsafe {
                        NSMenuItem::initWithTitle_action_keyEquivalent(
                            NSMenuItem::alloc(mtm),
                            &title,
                            Some(sel!(menuItemClicked:)),
                            ns_string!(""),
                        )
                    };

                    unsafe { item.setTarget(Some(target)) };
                    item.setTag(tag);
                    item.setEnabled(!disabled);

                    if *destructive {
                        let red = NSColor::systemRedColor();
                        let attrs: Retained<AnyObject> = unsafe {
                            msg_send![
                                objc2::class!(NSDictionary),
                                dictionaryWithObject: &*red,
                                forKey: ns_string!("NSColor"),
                            ]
                        };
                        let styled: Retained<NSAttributedString> = unsafe {
                            msg_send![
                                NSAttributedString::alloc(),
                                initWithString: &*title,
                                attributes: &*attrs,
                            ]
                        };
                        item.setAttributedTitle(Some(&styled));
                    }

                    menu.addItem(&item);
                }
                ContextMenuEntry::Separator => {
                    menu.addItem(&NSMenuItem::separatorItem(mtm));
                }
                ContextMenuEntry::Submenu { label, items } => {
                    let submenu = build_menu(items, target, id_map, mtm);
                    let title = NSString::from_str(label);
                    submenu.setTitle(&title);

                    let item = unsafe {
                        NSMenuItem::initWithTitle_action_keyEquivalent(
                            NSMenuItem::alloc(mtm),
                            &title,
                            None,
                            ns_string!(""),
                        )
                    };
                    item.setSubmenu(Some(&submenu));
                    menu.addItem(&item);
                }
            }
        }

        menu
    }

    pub(super) async fn show_context_menu_impl(
        window: WebviewWindow,
        entries: Vec<ContextMenuEntry>,
    ) -> Result<Option<String>, LifecycleError> {
        let (sender, receiver) = std::sync::mpsc::sync_channel(1);

        window
            .with_webview(move |webview| unsafe {
                let mtm = objc2::MainThreadMarker::new().unwrap();
                let view: &NSView = &*webview.inner().cast();

                let target = ContextMenuTarget::new(mtm);
                let mut id_map: Vec<String> = Vec::new();
                let menu = build_menu(&entries, &target, &mut id_map, mtm);

                SELECTED_TAG.set(-1);

                let event = NSApplication::sharedApplication(mtm).currentEvent();

                if let Some(event) = event {
                    NSMenu::popUpContextMenu_withEvent_forView(&menu, &event, view);
                }

                let tag = SELECTED_TAG.get();
                let selected_id = if tag >= 0 && (tag as usize) < id_map.len() {
                    Some(id_map[tag as usize].clone())
                } else {
                    None
                };

                let _ = sender.send(selected_id);
            })
            .map_err(|error| LifecycleError::AttachFailed(error.to_string()))?;

        receiver.recv().map_err(|_| {
            LifecycleError::AttachFailed("context menu did not resolve".to_string())
        })
    }
}
