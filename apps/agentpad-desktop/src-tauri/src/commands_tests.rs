use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
};

use crate::{
    commands::{
        AppError, AppState, SessionFactory, connect_agentpad_impl, disconnect_agentpad_impl,
        get_live_led_frame_impl, get_live_monitor_info_impl, get_macros_impl, get_vialrgb_impl,
        list_agentpad_devices_impl, lock_device_impl, save_keymap_changes_impl, save_macros_impl,
        save_vialrgb_impl,
    },
    device::{
        AGENTPAD_PRODUCT_ID, AGENTPAD_VENDOR_ID, HidCandidate, VIAL_REPORT_BYTES, VIAL_USAGE,
        VIAL_USAGE_PAGE,
    },
    domain::{KeyChange, MacroBuffer, VialRgbState},
    transport::{TransportError, VialTransport},
};

#[derive(Default)]
struct FakeSessionFactory {
    candidates: Vec<HidCandidate>,
    open_calls: Arc<Mutex<Vec<String>>>,
}

impl SessionFactory for FakeSessionFactory {
    fn list_candidates(&self) -> Result<Vec<HidCandidate>, String> {
        Ok(self.candidates.clone())
    }

    fn open_vial(&self, path: &str) -> Result<Box<dyn VialTransport>, String> {
        self.open_calls.lock().expect("test lock").push(path.into());
        Err("the fake should not open this candidate".into())
    }
}

struct ScriptedSessionFactory {
    candidates: Vec<HidCandidate>,
    transport: Mutex<Option<Box<dyn VialTransport>>>,
    open_calls: Arc<Mutex<Vec<String>>>,
}

impl SessionFactory for ScriptedSessionFactory {
    fn list_candidates(&self) -> Result<Vec<HidCandidate>, String> {
        Ok(self.candidates.clone())
    }

    fn open_vial(&self, path: &str) -> Result<Box<dyn VialTransport>, String> {
        self.open_calls.lock().expect("test lock").push(path.into());
        self.transport
            .lock()
            .expect("test lock")
            .take()
            .ok_or_else(|| "test session was already opened".into())
    }
}

struct ScriptedTransport {
    responses: VecDeque<[u8; VIAL_REPORT_BYTES]>,
    writes: Arc<Mutex<Vec<[u8; VIAL_REPORT_BYTES]>>>,
}

impl ScriptedTransport {
    fn new(responses: Vec<[u8; VIAL_REPORT_BYTES]>) -> Self {
        Self {
            responses: responses.into(),
            writes: Arc::new(Mutex::new(Vec::new())),
        }
    }

    fn recording(
        responses: Vec<[u8; VIAL_REPORT_BYTES]>,
        writes: Arc<Mutex<Vec<[u8; VIAL_REPORT_BYTES]>>>,
    ) -> Self {
        Self {
            responses: responses.into(),
            writes,
        }
    }
}

impl VialTransport for ScriptedTransport {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError> {
        self.writes.lock().expect("test lock").push(*report);
        Ok(())
    }

    fn read_timeout(
        &mut self,
        _timeout_ms: i32,
    ) -> Result<[u8; VIAL_REPORT_BYTES], TransportError> {
        self.responses
            .pop_front()
            .ok_or_else(|| TransportError::Read("test response queue is empty".into()))
    }
}

fn matching_vial_candidate(path: &str) -> HidCandidate {
    HidCandidate {
        vendor_id: AGENTPAD_VENDOR_ID,
        product_id: AGENTPAD_PRODUCT_ID,
        usage_page: VIAL_USAGE_PAGE,
        usage: VIAL_USAGE,
        report_id: None,
        report_bytes: VIAL_REPORT_BYTES,
        path: path.into(),
    }
}

fn via_response(command: u8, payload: &[u8]) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0; VIAL_REPORT_BYTES];
    frame[0] = command;
    frame[1..1 + payload.len()].copy_from_slice(payload);
    frame
}

fn encoder_response(counter_clockwise: u16, clockwise: u16) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0; VIAL_REPORT_BYTES];
    frame[..4].copy_from_slice(&[
        (counter_clockwise >> 8) as u8,
        counter_clockwise as u8,
        (clockwise >> 8) as u8,
        clockwise as u8,
    ]);
    frame
}

fn unlock_status_response(unlocked: bool, in_progress: bool) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0xff; VIAL_REPORT_BYTES];
    frame[..6].copy_from_slice(&[u8::from(unlocked), u8::from(in_progress), 0, 0, 3, 0]);
    frame
}

fn vialrgb_info_response(protocol_version: u16, maximum_brightness: u8) -> [u8; VIAL_REPORT_BYTES] {
    via_response(
        0x08,
        &[
            0x40,
            protocol_version as u8,
            (protocol_version >> 8) as u8,
            maximum_brightness,
        ],
    )
}

fn vialrgb_supported_response(supported: &[u16]) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0xff; VIAL_REPORT_BYTES];
    frame[0] = 0x08;
    frame[1] = 0x42;
    for (index, mode) in supported.iter().enumerate() {
        let offset = 2 + index * 2;
        frame[offset..offset + 2].copy_from_slice(&mode.to_le_bytes());
    }
    frame
}

fn vialrgb_state_response(state: &VialRgbState) -> [u8; VIAL_REPORT_BYTES] {
    via_response(
        0x08,
        &[
            0x41,
            state.mode as u8,
            (state.mode >> 8) as u8,
            state.speed,
            state.hue,
            state.saturation,
            state.brightness,
        ],
    )
}

fn macro_count_response(count: u8) -> [u8; VIAL_REPORT_BYTES] {
    via_response(0x0c, &[count])
}

fn macro_size_response(size: u16) -> [u8; VIAL_REPORT_BYTES] {
    via_response(0x0d, &size.to_be_bytes())
}

fn macro_buffer_response(offset: u16, bytes: &[u8]) -> [u8; VIAL_REPORT_BYTES] {
    let [offset_high, offset_low] = offset.to_be_bytes();
    let mut payload = vec![offset_high, offset_low, bytes.len() as u8];
    payload.extend_from_slice(bytes);
    via_response(0x0e, &payload)
}

fn macro_buffer_set_response(offset: u16, bytes: &[u8]) -> [u8; VIAL_REPORT_BYTES] {
    let [offset_high, offset_low] = offset.to_be_bytes();
    let mut payload = vec![offset_high, offset_low, bytes.len() as u8];
    payload.extend_from_slice(bytes);
    via_response(0x0f, &payload)
}

fn connected_session_responses() -> Vec<[u8; VIAL_REPORT_BYTES]> {
    let mut responses = vec![via_response(0x11, &[8])];
    for layer in 0..8 {
        for row in 0..4 {
            for column in 0..4 {
                responses.push(via_response(0x04, &[layer, row, column, 0, 0x29]));
            }
        }
    }
    for layer in 0..8 {
        responses.push(encoder_response(0x00ea + layer, 0x00e9 + layer));
    }
    responses.push(unlock_status_response(false, false));
    responses
}

#[test]
fn refuses_oai_candidate_before_open() {
    let open_calls = Arc::new(Mutex::new(Vec::new()));
    let factory = FakeSessionFactory {
        candidates: vec![HidCandidate {
            vendor_id: AGENTPAD_VENDOR_ID,
            product_id: AGENTPAD_PRODUCT_ID,
            usage_page: 0xff00,
            usage: 0x0061,
            report_id: Some(6),
            report_bytes: 64,
            path: "agentpad-oai".into(),
        }],
        open_calls: Arc::clone(&open_calls),
    };
    let state = AppState::with_factory(Arc::new(factory));

    assert!(matches!(
        connect_agentpad_impl(&state, "agentpad-oai"),
        Err(AppError::UnsupportedDevice { path }) if path == "agentpad-oai"
    ));
    assert!(open_calls.lock().expect("test lock").is_empty());
}

#[test]
fn saving_without_a_selected_vial_session_returns_not_connected() {
    let state = AppState::with_factory(Arc::new(FakeSessionFactory::default()));
    let change = KeyChange {
        layer: 0,
        row: 0,
        column: 0,
        keycode: 0x0029,
    };

    assert!(matches!(
        save_keymap_changes_impl(&state, vec![change]),
        Err(AppError::NotConnected)
    ));
}

#[test]
fn live_monitor_reads_require_the_selected_vial_session_and_never_open_oai() {
    let open_calls = Arc::new(Mutex::new(Vec::new()));
    let factory = FakeSessionFactory {
        candidates: vec![HidCandidate {
            vendor_id: AGENTPAD_VENDOR_ID,
            product_id: AGENTPAD_PRODUCT_ID,
            usage_page: 0xff00,
            usage: 0x0061,
            report_id: Some(6),
            report_bytes: 64,
            path: "agentpad-oai".into(),
        }],
        open_calls: Arc::clone(&open_calls),
    };
    let state = AppState::with_factory(Arc::new(factory));

    assert!(matches!(
        get_live_led_frame_impl(&state),
        Err(AppError::NotConnected)
    ));
    assert!(matches!(
        get_live_monitor_info_impl(&state),
        Err(AppError::NotConnected)
    ));
    assert!(open_calls.lock().expect("test lock").is_empty());
}

#[test]
fn connection_uses_the_selected_vial_session_and_safe_lock_keeps_it_open() {
    let open_calls = Arc::new(Mutex::new(Vec::new()));
    let mut responses = connected_session_responses();
    responses.extend([
        unlock_status_response(true, false),
        {
            let mut frame = [0; VIAL_REPORT_BYTES];
            frame[..2].copy_from_slice(&[0xfe, 0x08]);
            frame
        },
        unlock_status_response(false, false),
    ]);
    let factory = ScriptedSessionFactory {
        candidates: vec![matching_vial_candidate("agentpad-vial")],
        transport: Mutex::new(Some(Box::new(ScriptedTransport::new(responses)))),
        open_calls: Arc::clone(&open_calls),
    };
    let state = AppState::with_factory(Arc::new(factory));

    let devices = list_agentpad_devices_impl(&state).expect("Vial device is visible");
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].path, "agentpad-vial");
    let snapshot = connect_agentpad_impl(&state, "agentpad-vial").expect("Vial session connects");
    assert_eq!(snapshot.layers.len(), 8);
    assert_eq!(snapshot.unlock_status.required_keys.len(), 2);
    assert_eq!(
        open_calls.lock().expect("test lock").as_slice(),
        ["agentpad-vial"]
    );

    let status = lock_device_impl(&state).expect("lock response is acknowledged");
    assert!(!status.unlocked);
    assert!(save_keymap_changes_impl(&state, vec![]).is_ok());
}

#[test]
fn refuses_lock_or_disconnect_while_vial_unlock_is_in_progress() {
    let writes = Arc::new(Mutex::new(Vec::new()));
    let mut responses = connected_session_responses();
    responses.push(unlock_status_response(false, true));
    let factory = ScriptedSessionFactory {
        candidates: vec![matching_vial_candidate("agentpad-vial")],
        transport: Mutex::new(Some(Box::new(ScriptedTransport::recording(
            responses,
            Arc::clone(&writes),
        )))),
        open_calls: Arc::new(Mutex::new(Vec::new())),
    };
    let state = AppState::with_factory(Arc::new(factory));
    connect_agentpad_impl(&state, "agentpad-vial").expect("Vial session connects");

    assert!(matches!(
        lock_device_impl(&state),
        Err(AppError::UnlockInProgress)
    ));
    assert!(
        !writes
            .lock()
            .expect("test lock")
            .iter()
            .any(|frame| frame[..2] == [0xfe, 0x08]),
        "the unsafe lock frame must never be sent while physical unlock is active"
    );
    assert!(
        save_keymap_changes_impl(&state, vec![]).is_ok(),
        "the session stays open"
    );
}

#[test]
fn refuses_disconnect_while_vial_unlock_is_in_progress() {
    let mut responses = connected_session_responses();
    responses.push(unlock_status_response(false, true));
    let factory = ScriptedSessionFactory {
        candidates: vec![matching_vial_candidate("agentpad-vial")],
        transport: Mutex::new(Some(Box::new(ScriptedTransport::new(responses)))),
        open_calls: Arc::new(Mutex::new(Vec::new())),
    };
    let state = AppState::with_factory(Arc::new(factory));
    connect_agentpad_impl(&state, "agentpad-vial").expect("Vial session connects");

    assert!(matches!(
        disconnect_agentpad_impl(&state),
        Err(AppError::UnlockInProgress)
    ));
    assert!(
        save_keymap_changes_impl(&state, vec![]).is_ok(),
        "the session stays open"
    );
}

#[test]
fn reads_and_saves_vialrgb_through_the_active_vial_session() {
    let state = VialRgbState {
        mode: 13,
        speed: 88,
        hue: 32,
        saturation: 64,
        brightness: 91,
    };
    let mut responses = connected_session_responses();
    responses.extend([
        vialrgb_info_response(1, 128),
        vialrgb_supported_response(&[1, 2, 13]),
        vialrgb_state_response(&state),
        via_response(
            0x07,
            &[
                0x41,
                state.mode as u8,
                (state.mode >> 8) as u8,
                state.speed,
                state.hue,
                state.saturation,
                state.brightness,
            ],
        ),
        vialrgb_state_response(&state),
        via_response(0x09, &[]),
    ]);
    let factory = ScriptedSessionFactory {
        candidates: vec![matching_vial_candidate("agentpad-vial")],
        transport: Mutex::new(Some(Box::new(ScriptedTransport::new(responses)))),
        open_calls: Arc::new(Mutex::new(Vec::new())),
    };
    let state_holder = AppState::with_factory(Arc::new(factory));
    connect_agentpad_impl(&state_holder, "agentpad-vial").expect("Vial session connects");

    let snapshot = get_vialrgb_impl(&state_holder).expect("VialRGB reads from Vial only");
    assert_eq!(snapshot.info.supported_modes, vec![0, 1, 2, 13]);
    assert_eq!(snapshot.state, state);
    assert_eq!(
        save_vialrgb_impl(&state_holder, state.clone()).expect("VialRGB writes through Vial"),
        state
    );
}

#[test]
fn reads_and_saves_macros_through_the_active_vial_session() {
    let original = vec![0; 33];
    let mut next = original.clone();
    next[0] = b'a';
    next[1] = 0;
    let mut responses = connected_session_responses();
    responses.extend([
        macro_count_response(16),
        macro_size_response(33),
        macro_buffer_response(0, &original[0..28]),
        macro_buffer_response(28, &original[28..33]),
        macro_count_response(16),
        macro_size_response(33),
        macro_buffer_response(0, &original[0..28]),
        macro_buffer_response(28, &original[28..33]),
        macro_buffer_set_response(32, &[1]),
        macro_buffer_set_response(0, &next[0..28]),
        macro_buffer_set_response(28, &next[28..32]),
        macro_buffer_set_response(32, &[0]),
        macro_count_response(16),
        macro_size_response(33),
        macro_buffer_response(0, &next[0..28]),
        macro_buffer_response(28, &next[28..33]),
    ]);
    let factory = ScriptedSessionFactory {
        candidates: vec![matching_vial_candidate("agentpad-vial")],
        transport: Mutex::new(Some(Box::new(ScriptedTransport::new(responses)))),
        open_calls: Arc::new(Mutex::new(Vec::new())),
    };
    let state_holder = AppState::with_factory(Arc::new(factory));
    connect_agentpad_impl(&state_holder, "agentpad-vial").expect("Vial session connects");

    assert_eq!(
        get_macros_impl(&state_holder).expect("macro buffer reads from Vial only"),
        MacroBuffer {
            count: 16,
            bytes: original,
        }
    );
    assert_eq!(
        save_macros_impl(&state_holder, next.clone()).expect("macro buffer writes through Vial"),
        MacroBuffer {
            count: 16,
            bytes: next,
        }
    );
}

#[allow(dead_code)]
struct NeverUsedTransport;

impl VialTransport for NeverUsedTransport {
    fn write(&mut self, _report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError> {
        unreachable!("the OAI candidate must never be opened")
    }

    fn read_timeout(
        &mut self,
        _timeout_ms: i32,
    ) -> Result<[u8; VIAL_REPORT_BYTES], TransportError> {
        unreachable!("the OAI candidate must never be opened")
    }
}
