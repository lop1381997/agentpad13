pub mod client;
pub mod commands;
pub mod device;
pub mod domain;
pub mod files;
pub mod hid_transport;
#[cfg(any(windows, test))]
mod portable;
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
    let context = tauri::generate_context!();
    #[cfg(any(windows, test))]
    let (context, portable_paths) = {
        let mut context = context;
        let paths = portable::resolve(&std::env::current_exe().expect("executable path"))
            .expect("No se puede iniciar AgentPad13 portable");
        if let Some(paths) = &paths {
            let config = context.config_mut();
            config.bundle.windows.webview_install_mode =
                tauri::utils::config::WebviewInstallMode::FixedRuntime {
                    path: paths.runtime.clone(),
                };
            for window in &mut config.app.windows {
                window.create = false;
            }
        }
        (context, paths)
    };
    let builder = tauri::Builder::default()
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
        ]);
    #[cfg(any(windows, test))]
    let builder = builder.setup(move |app| {
        if let Some(paths) = &portable_paths {
            for window in &app.config().app.windows {
                tauri::WebviewWindowBuilder::from_config(app, window)?
                    .data_directory(paths.data.clone())
                    .build()?;
            }
        }
        Ok(())
    });
    builder
        .run(context)
        .expect("failed to run AgentPad13 desktop application");
}
