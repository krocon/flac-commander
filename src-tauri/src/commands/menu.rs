//! The native menu of the app. What it offers is decided in the frontend, where the actions
//! live (labels in the user's language, shortcuts, what is on and what is possible right
//! now): the main window sends a model, this module builds the menu from it, and a click
//! goes back to the main window as an event.

use crate::events::MENU_ACTION;
use fc_core::{AppError, AppResult};
use serde::Deserialize;
use tauri::menu::{
    CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Runtime};

/// Ids of the menu items that stand for an action of the frontend start with this.
const ACTION_PREFIX: &str = "action:";
const MAX_GROUPS: usize = 12;
const MAX_ITEMS: usize = 60;
const MAX_TEXT_CHARS: usize = 100;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuModel {
    /// Titles of the menus the system fills itself.
    pub edit_title: String,
    pub window_title: String,
    pub groups: Vec<MenuGroup>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MenuGroup {
    pub title: String,
    pub items: Vec<MenuEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MenuEntry {
    Separator,
    #[serde(rename_all = "camelCase")]
    Action {
        id: String,
        label: String,
        /// Like `CmdOrCtrl+K`; only shortcuts with the command key: a bare key in a native
        /// menu would be taken away from every text field.
        accelerator: Option<String>,
        /// `Some`: the item switches something and shows a tick while it is on.
        checked: Option<bool>,
        enabled: bool,
    },
}

/// An action id as the frontend names them: `player.togglePlay`.
fn is_action_id(id: &str) -> bool {
    (3..=60).contains(&id.len()) && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '.')
}

/// The shortcut in the form the menu takes: `CmdOrCtrl+` and one letter or digit.
fn is_accelerator(text: &str) -> bool {
    text.strip_prefix("CmdOrCtrl+")
        .is_some_and(|key| key.len() == 1 && key.chars().all(|c| c.is_ascii_alphanumeric()))
}

/// Text from the frontend as a label: no control characters, not endless.
fn label(text: &str) -> String {
    text.chars().filter(|c| !c.is_control()).take(MAX_TEXT_CHARS).collect()
}

/// What is wrong with a model, if anything. The menu is built only from a model that passes.
fn problem(model: &MenuModel) -> Option<String> {
    if model.groups.len() > MAX_GROUPS {
        return Some(format!("more than {MAX_GROUPS} menus"));
    }
    for group in &model.groups {
        if group.items.len() > MAX_ITEMS {
            return Some(format!("more than {MAX_ITEMS} items in a menu"));
        }
        for entry in &group.items {
            if let MenuEntry::Action { id, accelerator, .. } = entry {
                if !is_action_id(id) {
                    return Some(format!("\"{id}\" is not the id of an action"));
                }
                if accelerator.as_deref().is_some_and(|a| !is_accelerator(a)) {
                    return Some(format!("the shortcut of \"{id}\" is not CmdOrCtrl+key"));
                }
            }
        }
    }
    None
}

fn failed(e: tauri::Error) -> AppError {
    AppError::internal("the menu could not be built").with_details(e.to_string())
}

fn build<R: Runtime>(app: &AppHandle<R>, model: &MenuModel) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    // macOS: the first menu carries the app's name and what every app has there
    #[cfg(target_os = "macos")]
    menu.append(
        &SubmenuBuilder::new(app, app.package_info().name.clone())
            .about(None)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?,
    )?;
    for (index, group) in model.groups.iter().enumerate() {
        let submenu = Submenu::new(app, label(&group.title), true)?;
        for entry in &group.items {
            let item: Box<dyn IsMenuItem<R>> = match entry {
                MenuEntry::Separator => Box::new(PredefinedMenuItem::separator(app)?),
                MenuEntry::Action { id, label: text, accelerator, checked, enabled } => {
                    let id = format!("{ACTION_PREFIX}{id}");
                    let accelerator = accelerator.as_deref();
                    match checked {
                        Some(on) => Box::new(CheckMenuItem::with_id(
                            app,
                            id,
                            label(text),
                            *enabled,
                            *on,
                            accelerator,
                        )?),
                        None => Box::new(MenuItem::with_id(
                            app,
                            id,
                            label(text),
                            *enabled,
                            accelerator,
                        )?),
                    }
                }
            };
            submenu.append(&*item)?;
        }
        // elsewhere "quit" is the last item of the first menu
        if index == 0 && cfg!(not(target_os = "macos")) {
            submenu.append(&PredefinedMenuItem::separator(app)?)?;
            submenu.append(&PredefinedMenuItem::quit(app, None)?)?;
        }
        menu.append(&submenu)?;
    }
    // what text fields need (copy, paste …) and what windows need: filled by the system
    menu.append(
        &SubmenuBuilder::new(app, label(&model.edit_title))
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?,
    )?;
    menu.append(
        &SubmenuBuilder::new(app, label(&model.window_title))
            .minimize()
            .maximize()
            .separator()
            .close_window()
            .build()?,
    )?;
    Ok(menu)
}

/// The main window says what the menu offers; called again whenever a label, a tick or what
/// is possible changes.
#[tauri::command]
pub async fn menu_set(app: AppHandle, model: MenuModel) -> AppResult<()> {
    if let Some(problem) = problem(&model) {
        return Err(AppError::internal("the menu was refused").with_details(problem));
    }
    let menu = build(&app, &model).map_err(failed)?;
    app.set_menu(menu).map(|_| ()).map_err(failed)
}

/// A click in the menu (or its shortcut): an item that stands for an action is passed on to
/// the main window, where the actions live.
pub fn on_event(app: &AppHandle, item_id: &str) {
    let Some(action) = item_id.strip_prefix(ACTION_PREFIX).filter(|id| is_action_id(id)) else {
        return;
    };
    if let Err(e) = app.emit_to(crate::windows::MAIN, MENU_ACTION, action) {
        log::error!("event {MENU_ACTION} could not be sent: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn model(json: serde_json::Value) -> MenuModel {
        serde_json::from_value(json).unwrap()
    }

    #[test]
    fn the_model_comes_as_the_frontend_sends_it() {
        let menu = model(serde_json::json!({
            "editTitle": "Edit", "windowTitle": "Window",
            "groups": [{ "title": "Playback", "items": [
                { "kind": "action", "id": "player.togglePlay", "label": "Play / pause  (Space)",
                  "accelerator": null, "checked": true, "enabled": true },
                { "kind": "separator" },
                { "kind": "action", "id": "app.skins", "label": "Choose skin",
                  "accelerator": "CmdOrCtrl+K", "checked": null, "enabled": true }
            ] }]
        }));
        assert_eq!(problem(&menu), None);
        assert_eq!(menu.groups[0].items[1], MenuEntry::Separator);
        let MenuEntry::Action { accelerator, checked, .. } = &menu.groups[0].items[2] else {
            panic!("an action");
        };
        assert_eq!((accelerator.as_deref(), *checked), (Some("CmdOrCtrl+K"), None));
    }

    #[test]
    fn only_action_ids_and_command_shortcuts_are_taken() {
        let with = |id: &str, accelerator: Option<&str>| {
            problem(&model(serde_json::json!({
                "editTitle": "Edit", "windowTitle": "Window",
                "groups": [{ "title": "File", "items": [
                    { "kind": "action", "id": id, "label": "x", "accelerator": accelerator,
                      "checked": null, "enabled": true }
                ] }]
            })))
            .is_some()
        };
        assert!(!with("window.library", Some("CmdOrCtrl+B")));
        assert!(!with("app.resetSkin", Some("CmdOrCtrl+0")));
        assert!(with("quit", Some("Q")));
        assert!(with("app.skins", Some("Space")));
        assert!(with("app.skins", Some("CmdOrCtrl+Shift+K")));
        assert!(with("../etc", None));
        assert!(with("", None));
    }

    #[test]
    fn labels_lose_control_characters_and_their_length() {
        assert_eq!(label("Play\n/ pause\u{7}"), "Play/ pause");
        assert_eq!(label(&"x".repeat(500)).len(), MAX_TEXT_CHARS);
    }
}
