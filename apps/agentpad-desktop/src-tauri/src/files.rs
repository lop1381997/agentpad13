use tauri_plugin_dialog::DialogExt;
use std::path::Path;

fn write_export(path: &Path, contents: &str) -> Result<(), String> {
    std::fs::write(path, contents).map_err(|error| error.to_string())
}

/// The renderer supplies content, never a destination path. The user selects it
/// in the native save dialog, which also owns overwrite confirmation.
#[tauri::command]
pub async fn export_text(
    app: tauri::AppHandle,
    filename: String,
    contents: String,
) -> Result<bool, String> {
    if filename.contains(['/', '\\']) || filename.is_empty() || contents.len() > 2_000_000 {
        return Err("Invalid export name or content size.".into());
    }
    let selected = app.dialog().file().set_file_name(filename).blocking_save_file();
    let Some(selected) = selected else { return Ok(false) };
    let path = selected.into_path().map_err(|error| error.to_string())?;
    write_export(&path, &contents)?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::write_export;

    #[test]
    fn exported_profile_round_trips_utf8_and_replaces_selected_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("perfil.json");
        std::fs::write(&path, "older content that is longer than the new profile").unwrap();
        let contents = "{\"name\":\"Iluminación\"}";
        write_export(&path, contents).unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), contents);
        let parsed: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(parsed["name"], "Iluminación");
    }

    #[test]
    fn export_reports_invalid_destination_without_creating_a_file() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("missing").join("report.txt");
        assert!(write_export(&path, "report").is_err());
        assert!(!path.exists());
    }
}
