use std::collections::VecDeque;

use crate::client::{ClientError, VialClient};
use crate::device::VIAL_REPORT_BYTES;
use crate::domain::{
    EncoderBinding, EncoderChange, EncoderDirection, KeyChange, LedRgb, LiveLedFrame,
    LiveMonitorInfo, MacroBuffer, MatrixPosition, UnlockProgress, UnlockStatus, VialRgbState,
};
use crate::transport::{TransportError, VialTransport};

#[derive(Default)]
struct FakeTransport {
    responses: VecDeque<[u8; VIAL_REPORT_BYTES]>,
    writes: Vec<[u8; VIAL_REPORT_BYTES]>,
}

impl FakeTransport {
    fn with_responses(responses: Vec<[u8; VIAL_REPORT_BYTES]>) -> Self {
        Self {
            responses: responses.into(),
            writes: Vec::new(),
        }
    }
}

impl VialTransport for FakeTransport {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError> {
        self.writes.push(*report);
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

fn vial_echo(command: u8, payload: &[u8]) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0; VIAL_REPORT_BYTES];
    frame[0] = 0xfe;
    frame[1] = command;
    frame[2..2 + payload.len()].copy_from_slice(payload);
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

fn unlock_status_response(
    unlocked: bool,
    in_progress: bool,
    required_keys: &[(u8, u8)],
) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = [0xff; VIAL_REPORT_BYTES];
    frame[0] = u8::from(unlocked);
    frame[1] = u8::from(in_progress);
    for (index, (row, column)) in required_keys.iter().enumerate() {
        frame[2 + index * 2] = *row;
        frame[2 + index * 2 + 1] = *column;
    }
    frame
}

fn live_monitor_info_response(
    major: u8,
    minor: u8,
    led_count: u8,
    chunk_led_count: u8,
    chunk_count: u8,
    maximum_fps: u8,
) -> [u8; VIAL_REPORT_BYTES] {
    via_response(
        0x7d,
        &[
            0x01,
            major,
            minor,
            led_count,
            chunk_led_count,
            chunk_count,
            maximum_fps,
            0x0f,
        ],
    )
}

fn live_monitor_frame_response(
    sequence: u16,
    active_layer: u8,
    flags: u8,
    chunk: u8,
    leds: &[LedRgb],
) -> [u8; VIAL_REPORT_BYTES] {
    let mut frame = via_response(
        0x7d,
        &[
            0x02,
            sequence as u8,
            (sequence >> 8) as u8,
            active_layer,
            flags,
            chunk,
            0,
        ],
    );
    for (index, led) in leds.iter().enumerate() {
        let offset = 8 + index * 3;
        frame[offset..offset + 3].copy_from_slice(&[led.red, led.green, led.blue]);
    }
    frame
}

#[test]
fn reads_exactly_eight_four_by_four_layers() {
    let mut responses = vec![via_response(0x11, &[8])];
    for layer in 0..8 {
        for row in 0..4 {
            for column in 0..4 {
                let keycode = 0x0100 + (layer * 16 + row * 4 + column) as u16;
                responses.push(via_response(
                    0x04,
                    &[layer, row, column, (keycode >> 8) as u8, keycode as u8],
                ));
            }
        }
    }
    for layer in 0..8 {
        responses.push(encoder_response(0x5000 + layer, 0x5100 + layer));
    }

    let transport = FakeTransport::with_responses(responses);
    let mut client = VialClient::new(transport);

    let snapshot = client
        .read_snapshot()
        .expect("the Vial transcript is valid");

    assert_eq!(snapshot.layers.len(), 8);
    assert_eq!(snapshot.layers[0][0][0], 0x0100);
    assert_eq!(snapshot.layers[7][3][3], 0x017f);
    assert_eq!(snapshot.encoders[0].counter_clockwise, 0x5000);
    assert_eq!(snapshot.encoders[7].clockwise, 0x5107);

    let transport = client.into_transport();
    assert_eq!(transport.writes.len(), 137);
    assert_eq!(&transport.writes[0][..2], &[0x11, 0]);
    assert_eq!(&transport.writes[1][..4], &[0x04, 0, 0, 0]);
    assert_eq!(&transport.writes[129][..4], &[0xfe, 0x03, 0, 0]);
}

#[test]
fn writes_each_change_then_confirms_its_readback() {
    let changes = vec![
        KeyChange {
            layer: 2,
            row: 1,
            column: 3,
            keycode: 0x7e02,
        },
        KeyChange {
            layer: 7,
            row: 3,
            column: 0,
            keycode: 0x0029,
        },
    ];
    let responses = vec![
        via_response(0x05, &[2, 1, 3, 0x7e, 0x02]),
        via_response(0x04, &[2, 1, 3, 0x7e, 0x02]),
        via_response(0x05, &[7, 3, 0, 0x00, 0x29]),
        via_response(0x04, &[7, 3, 0, 0x00, 0x29]),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    let result = client
        .write_changes(&changes)
        .expect("both changes read back");

    assert_eq!(result.applied, changes);
    let transport = client.into_transport();
    assert_eq!(&transport.writes[0][..6], &[0x05, 2, 1, 3, 0x7e, 0x02]);
    assert_eq!(&transport.writes[1][..4], &[0x04, 2, 1, 3]);
    assert_eq!(&transport.writes[2][..6], &[0x05, 7, 3, 0, 0x00, 0x29]);
    assert_eq!(&transport.writes[3][..4], &[0x04, 7, 3, 0]);
}

#[test]
fn stops_when_a_keycode_readback_differs_from_the_requested_value() {
    let change = KeyChange {
        layer: 2,
        row: 1,
        column: 3,
        keycode: 0x7e02,
    };
    let responses = vec![
        via_response(0x05, &[2, 1, 3, 0x7e, 0x02]),
        via_response(0x04, &[2, 1, 3, 0x7e, 0x03]),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    assert!(matches!(
        client.write_changes(&[change]),
        Err(ClientError::ReadbackMismatch {
            layer: 2,
            row: 1,
            column: 3,
            expected: 0x7e02,
            actual: 0x7e03
        })
    ));
}

#[test]
fn rejects_out_of_range_key_changes_before_writing_to_the_device() {
    let change = KeyChange {
        layer: 8,
        row: 0,
        column: 0,
        keycode: 0x0029,
    };
    let mut client = VialClient::new(FakeTransport::default());

    assert!(matches!(
        client.write_changes(&[change]),
        Err(ClientError::InvalidMatrixPosition {
            layer: 8,
            row: 0,
            column: 0
        })
    ));

    let transport = client.into_transport();
    assert!(transport.writes.is_empty());
}

#[test]
fn writes_an_encoder_binding_then_confirms_the_selected_direction() {
    let change = EncoderChange {
        layer: 4,
        direction: EncoderDirection::Clockwise,
        keycode: 0x7e13,
    };
    let responses = vec![
        vial_echo(0x04, &[4, 0, 1, 0x7e, 0x13]),
        encoder_response(0x00ea, 0x7e13),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    let binding = client
        .write_encoder(&change)
        .expect("the clockwise binding reads back");

    assert_eq!(
        binding,
        EncoderBinding {
            layer: 4,
            counter_clockwise: 0x00ea,
            clockwise: 0x7e13,
        }
    );
    let transport = client.into_transport();
    assert_eq!(
        &transport.writes[0][..7],
        &[0xfe, 0x04, 4, 0, 1, 0x7e, 0x13]
    );
    assert_eq!(&transport.writes[1][..4], &[0xfe, 0x03, 4, 0]);
}

#[test]
fn starts_and_polls_the_physical_vial_unlock_without_keyboard_emulation() {
    let responses = vec![
        unlock_status_response(false, false, &[(0, 0), (3, 0)]),
        vial_echo(0x06, &[]),
        {
            let mut frame = [0; VIAL_REPORT_BYTES];
            frame[..3].copy_from_slice(&[0, 1, 49]);
            frame
        },
        vial_echo(0x08, &[]),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    assert_eq!(
        client.unlock_status().expect("status is readable"),
        UnlockStatus {
            unlocked: false,
            in_progress: false,
            required_keys: vec![
                MatrixPosition { row: 0, column: 0 },
                MatrixPosition { row: 3, column: 0 },
            ],
        }
    );
    client.begin_unlock().expect("unlock timer starts");
    assert_eq!(
        client.poll_unlock().expect("unlock progress is readable"),
        UnlockProgress {
            unlocked: false,
            in_progress: true,
            remaining_polls: 49,
        }
    );
    client.lock().expect("the device locks again");

    let transport = client.into_transport();
    assert_eq!(&transport.writes[0][..2], &[0xfe, 0x05]);
    assert_eq!(&transport.writes[1][..2], &[0xfe, 0x06]);
    assert_eq!(&transport.writes[2][..2], &[0xfe, 0x07]);
    assert_eq!(&transport.writes[3][..2], &[0xfe, 0x08]);
}

#[test]
fn reads_and_persists_vialrgb_with_readback() {
    let state = VialRgbState {
        mode: 13,
        speed: 88,
        hue: 32,
        saturation: 64,
        brightness: 91,
    };
    let responses = vec![
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
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    let (info, current) = client.read_vialrgb().expect("VialRGB state is readable");
    assert_eq!(info.protocol_version, 1);
    assert_eq!(info.maximum_brightness, 128);
    assert_eq!(info.supported_modes, vec![0, 1, 2, 13]);
    assert_eq!(current, state);
    assert_eq!(
        client
            .write_vialrgb(&state)
            .expect("VialRGB state reads back"),
        state
    );

    let transport = client.into_transport();
    assert_eq!(&transport.writes[0][..2], &[0x08, 0x40]);
    assert_eq!(&transport.writes[1][..4], &[0x08, 0x42, 0x00, 0x00]);
    assert_eq!(&transport.writes[2][..2], &[0x08, 0x41]);
    assert_eq!(
        &transport.writes[3][..8],
        &[0x07, 0x41, 0x0d, 0x00, 88, 32, 64, 91]
    );
    assert_eq!(&transport.writes[4][..2], &[0x08, 0x41]);
    assert_eq!(&transport.writes[5][..2], &[0x09, 0x00]);
}

#[test]
fn rejects_vialrgb_when_the_readback_differs() {
    let requested = VialRgbState {
        mode: 13,
        speed: 88,
        hue: 32,
        saturation: 64,
        brightness: 91,
    };
    let actual = VialRgbState {
        brightness: 90,
        ..requested.clone()
    };
    let responses = vec![
        via_response(
            0x07,
            &[
                0x41,
                requested.mode as u8,
                (requested.mode >> 8) as u8,
                requested.speed,
                requested.hue,
                requested.saturation,
                requested.brightness,
            ],
        ),
        vialrgb_state_response(&actual),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    assert!(matches!(
        client.write_vialrgb(&requested),
        Err(ClientError::VialRgbReadbackMismatch { expected, actual: received })
            if expected == requested && received == actual
    ));
}

#[test]
fn writes_macro_buffer_atomically_and_reads_it_back() {
    let original = vec![
        b'h', b'e', b'l', b'l', b'o', 0, b'w', b'o', b'r', b'l', b'd', 0, 0, 0, 0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ];
    let mut next = original.clone();
    next[0..6].copy_from_slice(b"review");
    next[32] = 0;
    let responses = vec![
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
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    assert_eq!(
        client
            .write_macro_buffer(&next)
            .expect("the macro buffer reads back atomically"),
        MacroBuffer {
            count: 16,
            bytes: next.clone(),
        }
    );

    let transport = client.into_transport();
    assert_eq!(&transport.writes[0][..2], &[0x0c, 0x00]);
    assert_eq!(&transport.writes[1][..2], &[0x0d, 0x00]);
    assert_eq!(&transport.writes[2][..4], &[0x0e, 0x00, 0x00, 28]);
    assert_eq!(&transport.writes[3][..4], &[0x0e, 0x00, 28, 5]);
    assert_eq!(&transport.writes[4][..5], &[0x0f, 0x00, 32, 1, 1]);
    assert_eq!(&transport.writes[5][..4], &[0x0f, 0x00, 0x00, 28]);
    assert_eq!(&transport.writes[6][..5], &[0x0f, 0x00, 28, 4, 0]);
    assert_eq!(&transport.writes[7][..5], &[0x0f, 0x00, 32, 1, 0]);
    assert_eq!(&transport.writes[8][..2], &[0x0c, 0x00]);
    assert_eq!(&transport.writes[9][..2], &[0x0d, 0x00]);
}

#[test]
fn rejects_macro_buffer_when_atomic_readback_differs() {
    let original = vec![0; 33];
    let mut next = original.clone();
    next[0] = b'a';
    next[1] = 0;
    let mut received = next.clone();
    received[0] = b'b';
    let responses = vec![
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
        macro_buffer_response(0, &received[0..28]),
        macro_buffer_response(28, &received[28..33]),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    assert!(matches!(
        client.write_macro_buffer(&next),
        Err(ClientError::MacroReadbackMismatch { expected, actual })
            if expected == next && actual == received
    ));
}

#[test]
fn reads_live_monitor_info_and_an_all_or_nothing_frame() {
    let leds: Vec<_> = (0..24)
        .map(|index| LedRgb {
            red: index + 1,
            green: index + 2,
            blue: index + 3,
        })
        .collect();
    let info_response = live_monitor_info_response(1, 0, 24, 8, 3, 20);
    let mut info_client = VialClient::new(FakeTransport::with_responses(vec![info_response]));
    assert_eq!(
        info_client.read_live_monitor_info().expect("info is valid"),
        LiveMonitorInfo {
            major: 1,
            minor: 0,
            led_count: 24,
            chunk_led_count: 8,
            chunk_count: 3,
            maximum_fps: 20,
        }
    );

    let responses = vec![
        info_response,
        live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds[0..8]),
        live_monitor_frame_response(0x1203, 0, 0x05, 1, &leds[8..16]),
        live_monitor_frame_response(0x1203, 0, 0x05, 2, &leds[16..24]),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));

    client
        .read_live_monitor_info()
        .expect("the negotiated monitor shape is valid");

    let frame = client.read_live_led_frame().expect("frame is complete");
    assert_eq!(
        frame,
        LiveLedFrame {
            sequence: 0x1203,
            active_layer: 0,
            flags: 0x05,
            leds,
        }
    );

    let transport = client.into_transport();
    assert_eq!(
        transport.writes.len(),
        4,
        "one negotiation plus three RGB chunks"
    );
    assert_eq!(&transport.writes[0][..2], &[0x7d, 0x01]);
    assert_eq!(&transport.writes[1][..3], &[0x7d, 0x02, 0]);
    assert_eq!(&transport.writes[3][..3], &[0x7d, 0x02, 2]);
    assert_eq!(
        frame.leds[23],
        LedRgb {
            red: 24,
            green: 25,
            blue: 26
        }
    );
}

#[test]
fn rejects_an_unsupported_live_monitor_response() {
    let mut unsupported = [0; VIAL_REPORT_BYTES];
    unsupported[0] = 0xff;
    let mut client = VialClient::new(FakeTransport::with_responses(vec![unsupported]));

    assert!(matches!(
        client.read_live_monitor_info(),
        Err(ClientError::LiveMonitorUnsupported)
    ));
}

#[test]
fn rejects_an_unsupported_live_monitor_major_version() {
    let mut client = VialClient::new(FakeTransport::with_responses(vec![
        live_monitor_info_response(2, 0, 24, 8, 3, 20),
    ]));

    assert!(matches!(
        client.read_live_monitor_info(),
        Err(ClientError::UnsupportedLiveMonitorVersion {
            expected: 1,
            actual: 2
        })
    ));
}

#[test]
fn rejects_live_monitor_info_with_the_wrong_led_count() {
    let mut client = VialClient::new(FakeTransport::with_responses(vec![
        live_monitor_info_response(1, 0, 23, 8, 3, 20),
    ]));

    assert!(matches!(
        client.read_live_monitor_info(),
        Err(ClientError::MalformedLiveMonitorResponse { .. })
    ));
}

#[test]
fn rejects_live_monitor_info_outside_the_supported_shape_or_frame_rate() {
    for (led_count, chunk_led_count, chunk_count, maximum_fps) in
        [(24, 7, 3, 20), (24, 8, 2, 20), (24, 8, 3, 21)]
    {
        let mut client = VialClient::new(FakeTransport::with_responses(vec![
            live_monitor_info_response(1, 0, led_count, chunk_led_count, chunk_count, maximum_fps),
        ]));

        assert!(matches!(
            client.read_live_monitor_info(),
            Err(ClientError::MalformedLiveMonitorResponse { .. })
        ));
    }
}

#[test]
fn rejects_a_live_monitor_response_with_the_wrong_command_or_opcode() {
    let mut wrong_command = live_monitor_info_response(1, 0, 24, 8, 3, 20);
    wrong_command[0] = 0x7c;
    let mut client = VialClient::new(FakeTransport::with_responses(vec![wrong_command]));
    assert!(matches!(
        client.read_live_monitor_info(),
        Err(ClientError::MalformedLiveMonitorResponse { .. })
    ));

    let mut wrong_opcode = live_monitor_info_response(1, 0, 24, 8, 3, 20);
    wrong_opcode[1] = 0x03;
    let mut client = VialClient::new(FakeTransport::with_responses(vec![wrong_opcode]));
    assert!(matches!(
        client.read_live_monitor_info(),
        Err(ClientError::MalformedLiveMonitorResponse { .. })
    ));
}

#[test]
fn rejects_a_live_monitor_chunk_with_the_wrong_index() {
    let leds = vec![
        LedRgb {
            red: 1,
            green: 2,
            blue: 3
        };
        8
    ];
    let mut wrong_chunk = live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds);
    wrong_chunk[6] = 1;
    let responses = vec![live_monitor_info_response(1, 0, 24, 8, 3, 20), wrong_chunk];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));
    client
        .read_live_monitor_info()
        .expect("monitor is negotiated");

    assert!(matches!(
        client.read_live_led_frame(),
        Err(ClientError::InconsistentLiveMonitorFrame { .. })
    ));
}

#[test]
fn rejects_live_monitor_chunks_with_different_sequences() {
    let leds = vec![
        LedRgb {
            red: 1,
            green: 2,
            blue: 3
        };
        8
    ];
    let responses = vec![
        live_monitor_info_response(1, 0, 24, 8, 3, 20),
        live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds),
        live_monitor_frame_response(0x1204, 0, 0x05, 1, &leds),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));
    client
        .read_live_monitor_info()
        .expect("monitor is negotiated");

    assert!(matches!(
        client.read_live_led_frame(),
        Err(ClientError::InconsistentLiveMonitorFrame { .. })
    ));
}

#[test]
fn rejects_live_monitor_chunks_with_different_layers() {
    let leds = vec![
        LedRgb {
            red: 1,
            green: 2,
            blue: 3
        };
        8
    ];
    let responses = vec![
        live_monitor_info_response(1, 0, 24, 8, 3, 20),
        live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds),
        live_monitor_frame_response(0x1203, 1, 0x05, 1, &leds),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));
    client
        .read_live_monitor_info()
        .expect("monitor is negotiated");

    assert!(matches!(
        client.read_live_led_frame(),
        Err(ClientError::InconsistentLiveMonitorFrame { .. })
    ));
}

#[test]
fn rejects_live_monitor_chunks_with_different_flags() {
    let leds = vec![
        LedRgb {
            red: 1,
            green: 2,
            blue: 3
        };
        8
    ];
    let responses = vec![
        live_monitor_info_response(1, 0, 24, 8, 3, 20),
        live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds),
        live_monitor_frame_response(0x1203, 0, 0x01, 1, &leds),
    ];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));
    client
        .read_live_monitor_info()
        .expect("monitor is negotiated");

    assert!(matches!(
        client.read_live_led_frame(),
        Err(ClientError::InconsistentLiveMonitorFrame { .. })
    ));
}

#[test]
fn rejects_a_live_monitor_frame_with_malformed_rgb_payload() {
    let leds = vec![
        LedRgb {
            red: 1,
            green: 2,
            blue: 3
        };
        8
    ];
    let mut malformed = live_monitor_frame_response(0x1203, 0, 0x05, 0, &leds);
    malformed[7] = 1;
    let responses = vec![live_monitor_info_response(1, 0, 24, 8, 3, 20), malformed];
    let mut client = VialClient::new(FakeTransport::with_responses(responses));
    client
        .read_live_monitor_info()
        .expect("monitor is negotiated");

    assert!(matches!(
        client.read_live_led_frame(),
        Err(ClientError::MalformedLiveMonitorResponse { .. })
    ));
}
