use std::sync::{Arc, Mutex};

use serde::{Serialize, Serializer};
use thiserror::Error;

use crate::{
    client::{ClientError, VialClient},
    device::{HidCandidate, is_agentpad_vial},
    domain::{
        EncoderBinding, EncoderChange, KeyChange, KeymapSnapshot, LiveLedFrame, LiveMonitorInfo,
        MacroBuffer, SaveResult, UnlockProgress, UnlockStatus, VialRgbInfo, VialRgbState,
    },
    hid_transport::{HidApiTransport, list_hid_candidates},
    transport::VialTransport,
};

type BoxedVialClient = VialClient<Box<dyn VialTransport>>;

pub trait SessionFactory: Send + Sync {
    fn list_candidates(&self) -> Result<Vec<HidCandidate>, String>;
    fn open_vial(&self, path: &str) -> Result<Box<dyn VialTransport>, String>;
}

pub struct NativeSessionFactory;

impl SessionFactory for NativeSessionFactory {
    fn list_candidates(&self) -> Result<Vec<HidCandidate>, String> {
        list_hid_candidates().map_err(|error| error.to_string())
    }

    fn open_vial(&self, path: &str) -> Result<Box<dyn VialTransport>, String> {
        HidApiTransport::open_agentpad_vial_path(path)
            .map(|transport| Box::new(transport) as Box<dyn VialTransport>)
            .map_err(|error| error.to_string())
    }
}

pub struct AppState {
    factory: Arc<dyn SessionFactory>,
    session: Mutex<Option<BoxedVialClient>>,
}

impl AppState {
    pub fn production() -> Self {
        Self::with_factory(Arc::new(NativeSessionFactory))
    }

    pub fn with_factory(factory: Arc<dyn SessionFactory>) -> Self {
        Self {
            factory,
            session: Mutex::new(None),
        }
    }

    fn with_session<T>(
        &self,
        operation: impl FnOnce(&mut BoxedVialClient) -> Result<T, ClientError>,
    ) -> Result<T, AppError> {
        let mut session = self.session.lock().map_err(|_| AppError::StatePoisoned)?;
        let client = session.as_mut().ok_or(AppError::NotConnected)?;
        operation(client).map_err(AppError::client)
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceSummary {
    pub path: String,
    pub label: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EditorSnapshot {
    pub layers: Vec<Vec<Vec<u16>>>,
    pub encoders: Vec<EncoderBinding>,
    pub unlock_status: UnlockStatus,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
pub struct VialRgbSnapshot {
    pub info: VialRgbInfo,
    pub state: VialRgbState,
}

impl EditorSnapshot {
    fn from_keymap(keymap: KeymapSnapshot, unlock_status: UnlockStatus) -> Self {
        Self {
            layers: keymap.layers,
            encoders: keymap.encoders,
            unlock_status,
        }
    }
}

#[derive(Debug, Error)]
pub enum AppError {
    #[error("No AgentPad13 Vial device is connected.")]
    NotConnected,
    #[error("The selected device is not an AgentPad13 Vial interface: {path}")]
    UnsupportedDevice { path: String },
    #[error("Could not inspect AgentPad13 HID devices: {0}")]
    Discovery(String),
    #[error("Could not open AgentPad13 Vial interface: {0}")]
    Open(String),
    #[error("Vial operation failed: {0}")]
    Client(String),
    #[error("The AgentPad13 session lock is unavailable.")]
    StatePoisoned,
    #[error(
        "The physical Vial unlock is still in progress. Finish it before disconnecting or locking editing."
    )]
    UnlockInProgress,
}

impl AppError {
    fn client(error: ClientError) -> Self {
        Self::Client(error.to_string())
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub fn list_agentpad_devices_impl(state: &AppState) -> Result<Vec<DeviceSummary>, AppError> {
    let candidates = state
        .factory
        .list_candidates()
        .map_err(AppError::Discovery)?;

    Ok(candidates
        .into_iter()
        .filter(is_agentpad_vial)
        .map(|candidate| DeviceSummary {
            path: candidate.path,
            label: "AgentPad13 · Vial".into(),
        })
        .collect())
}

pub fn connect_agentpad_impl(state: &AppState, path: &str) -> Result<EditorSnapshot, AppError> {
    let candidate = state
        .factory
        .list_candidates()
        .map_err(AppError::Discovery)?
        .into_iter()
        .find(|candidate| candidate.path == path)
        .ok_or_else(|| AppError::UnsupportedDevice {
            path: path.to_owned(),
        })?;

    if !is_agentpad_vial(&candidate) {
        return Err(AppError::UnsupportedDevice {
            path: path.to_owned(),
        });
    }

    let transport = state.factory.open_vial(path).map_err(AppError::Open)?;
    let mut client = VialClient::new(transport);
    let keymap = client.read_snapshot().map_err(AppError::client)?;
    let unlock_status = client.unlock_status().map_err(AppError::client)?;
    let snapshot = EditorSnapshot::from_keymap(keymap, unlock_status);

    let mut session = state.session.lock().map_err(|_| AppError::StatePoisoned)?;
    *session = Some(client);
    Ok(snapshot)
}

pub fn save_keymap_changes_impl(
    state: &AppState,
    changes: Vec<KeyChange>,
) -> Result<SaveResult, AppError> {
    state.with_session(|client| client.write_changes(&changes))
}

pub fn save_encoder_change_impl(
    state: &AppState,
    change: EncoderChange,
) -> Result<EncoderBinding, AppError> {
    state.with_session(|client| client.write_encoder(&change))
}

pub fn get_vialrgb_impl(state: &AppState) -> Result<VialRgbSnapshot, AppError> {
    state.with_session(|client| {
        let (info, state) = client.read_vialrgb()?;
        Ok(VialRgbSnapshot { info, state })
    })
}

pub fn get_live_monitor_info_impl(state: &AppState) -> Result<LiveMonitorInfo, AppError> {
    state.with_session(VialClient::read_live_monitor_info)
}

pub fn get_live_led_frame_impl(state: &AppState) -> Result<LiveLedFrame, AppError> {
    state.with_session(VialClient::read_live_led_frame)
}

pub fn save_vialrgb_impl(state: &AppState, next: VialRgbState) -> Result<VialRgbState, AppError> {
    state.with_session(|client| client.write_vialrgb(&next))
}

pub fn get_macros_impl(state: &AppState) -> Result<MacroBuffer, AppError> {
    state.with_session(VialClient::read_macro_buffer)
}

pub fn save_macros_impl(state: &AppState, next: Vec<u8>) -> Result<MacroBuffer, AppError> {
    state.with_session(|client| client.write_macro_buffer(&next))
}

pub fn unlock_status_impl(state: &AppState) -> Result<UnlockStatus, AppError> {
    state.with_session(VialClient::unlock_status)
}

pub fn begin_unlock_impl(state: &AppState) -> Result<(), AppError> {
    state.with_session(VialClient::begin_unlock)
}

pub fn poll_unlock_impl(state: &AppState) -> Result<UnlockProgress, AppError> {
    state.with_session(VialClient::poll_unlock)
}

pub fn lock_device_impl(state: &AppState) -> Result<UnlockStatus, AppError> {
    let mut session = state.session.lock().map_err(|_| AppError::StatePoisoned)?;
    let client = session.as_mut().ok_or(AppError::NotConnected)?;
    if client
        .unlock_status()
        .map_err(AppError::client)?
        .in_progress
    {
        return Err(AppError::UnlockInProgress);
    }

    client.lock().map_err(AppError::client)?;
    client.unlock_status().map_err(AppError::client)
}

pub fn disconnect_agentpad_impl(state: &AppState) -> Result<(), AppError> {
    let mut session = state.session.lock().map_err(|_| AppError::StatePoisoned)?;
    let client = session.as_mut().ok_or(AppError::NotConnected)?;
    if client
        .unlock_status()
        .map_err(AppError::client)?
        .in_progress
    {
        return Err(AppError::UnlockInProgress);
    }
    session.take().ok_or(AppError::NotConnected)?;
    Ok(())
}

#[tauri::command]
pub fn list_agentpad_devices(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DeviceSummary>, AppError> {
    list_agentpad_devices_impl(state.inner())
}

#[tauri::command]
pub fn connect_agentpad(
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<EditorSnapshot, AppError> {
    connect_agentpad_impl(state.inner(), &path)
}

#[tauri::command]
pub fn save_keymap_changes(
    changes: Vec<KeyChange>,
    state: tauri::State<'_, AppState>,
) -> Result<SaveResult, AppError> {
    save_keymap_changes_impl(state.inner(), changes)
}

#[tauri::command]
pub fn save_encoder_change(
    change: EncoderChange,
    state: tauri::State<'_, AppState>,
) -> Result<EncoderBinding, AppError> {
    save_encoder_change_impl(state.inner(), change)
}

#[tauri::command]
pub fn get_vialrgb(state: tauri::State<'_, AppState>) -> Result<VialRgbSnapshot, AppError> {
    get_vialrgb_impl(state.inner())
}

#[tauri::command]
pub fn get_live_monitor_info(
    state: tauri::State<'_, AppState>,
) -> Result<LiveMonitorInfo, AppError> {
    get_live_monitor_info_impl(state.inner())
}

#[tauri::command]
pub fn get_live_led_frame(state: tauri::State<'_, AppState>) -> Result<LiveLedFrame, AppError> {
    get_live_led_frame_impl(state.inner())
}

#[tauri::command]
pub fn save_vialrgb(
    next: VialRgbState,
    state: tauri::State<'_, AppState>,
) -> Result<VialRgbState, AppError> {
    save_vialrgb_impl(state.inner(), next)
}

#[tauri::command]
pub fn get_macros(state: tauri::State<'_, AppState>) -> Result<MacroBuffer, AppError> {
    get_macros_impl(state.inner())
}

#[tauri::command]
pub fn save_macros(
    next: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> Result<MacroBuffer, AppError> {
    save_macros_impl(state.inner(), next)
}

#[tauri::command]
pub fn unlock_status(state: tauri::State<'_, AppState>) -> Result<UnlockStatus, AppError> {
    unlock_status_impl(state.inner())
}

#[tauri::command]
pub fn begin_unlock(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    begin_unlock_impl(state.inner())
}

#[tauri::command]
pub fn poll_unlock(state: tauri::State<'_, AppState>) -> Result<UnlockProgress, AppError> {
    poll_unlock_impl(state.inner())
}

#[tauri::command]
pub fn lock_device(state: tauri::State<'_, AppState>) -> Result<UnlockStatus, AppError> {
    lock_device_impl(state.inner())
}

#[tauri::command]
pub fn disconnect_agentpad(state: tauri::State<'_, AppState>) -> Result<(), AppError> {
    disconnect_agentpad_impl(state.inner())
}
