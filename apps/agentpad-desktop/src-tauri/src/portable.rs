use std::path::{Path, PathBuf};

#[derive(Debug, PartialEq)]
pub struct PortablePaths {
    pub data: PathBuf,
    pub runtime: PathBuf,
}

pub fn resolve(executable: &Path) -> std::io::Result<Option<PortablePaths>> {
    let directory = executable
        .parent()
        .ok_or_else(|| std::io::Error::other("No se puede localizar la carpeta de AgentPad13"))?;
    if !directory.join("agentpad13.portable").try_exists()? {
        return Ok(None);
    }
    let runtime = directory.join("WebView2");
    if !runtime.join("msedgewebview2.exe").is_file() {
        return Err(std::io::Error::other(
            "Portable incompleto: falta WebView2. Extrae todo el ZIP antes de abrir AgentPad13.",
        ));
    }
    let data = directory.join("Data");
    std::fs::create_dir_all(&data)?;
    Ok(Some(PortablePaths { data, runtime }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn installed_mode_does_not_create_portable_data() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(resolve(&dir.path().join("AgentPad13.exe")).unwrap(), None);
        assert!(!dir.path().join("Data").exists());
    }

    #[test]
    fn portable_paths_are_relative_to_executable_not_working_directory() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("agentpad13.portable"), "").unwrap();
        fs::create_dir(dir.path().join("WebView2")).unwrap();
        fs::write(dir.path().join("WebView2/msedgewebview2.exe"), "fixture").unwrap();
        let paths = resolve(&dir.path().join("AgentPad13.exe"))
            .unwrap()
            .unwrap();
        assert_eq!(paths.data, dir.path().join("Data"));
        assert_eq!(paths.runtime, dir.path().join("WebView2"));
        assert!(paths.data.is_dir());
    }

    #[test]
    fn missing_runtime_fails_without_falling_back_to_installed_mode() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("agentpad13.portable"), "").unwrap();
        assert!(resolve(&dir.path().join("AgentPad13.exe")).is_err());
    }

    #[test]
    fn invalid_data_directory_fails_without_overwriting_it() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("agentpad13.portable"), "").unwrap();
        fs::create_dir(dir.path().join("WebView2")).unwrap();
        fs::write(dir.path().join("WebView2/msedgewebview2.exe"), "fixture").unwrap();
        fs::write(dir.path().join("Data"), "keep").unwrap();
        assert!(resolve(&dir.path().join("AgentPad13.exe")).is_err());
        assert_eq!(fs::read_to_string(dir.path().join("Data")).unwrap(), "keep");
    }
}
