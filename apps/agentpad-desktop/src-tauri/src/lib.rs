pub mod client;
pub mod commands;
pub mod device;
pub mod domain;
pub mod files;
pub mod hid_transport;
pub mod transport;
pub mod vial_frame;

#[cfg(test)]
mod client_tests;
#[cfg(test)]
mod commands_tests;
#[cfg(test)]
mod device_tests;
#[cfg(test)]
mod hid_transport_tests;
#[cfg(test)]
mod vial_frame_tests;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::AppState::production())
        .invoke_handler(tauri::generate_handler![
            files::export_text,
            commands::list_agentpad_devices,
            commands::connect_agentpad,
            commands::save_keymap_changes,
            commands::save_encoder_change,
            commands::get_vialrgb,
            commands::save_vialrgb,
            commands::get_macros,
            commands::save_macros,
            commands::unlock_status,
            commands::begin_unlock,
            commands::poll_unlock,
            commands::lock_device,
            commands::disconnect_agentpad,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run AgentPad13 desktop application");
}
