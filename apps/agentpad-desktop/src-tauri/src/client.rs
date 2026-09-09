use thiserror::Error;

use crate::{
    device::VIAL_REPORT_BYTES,
    domain::{
        EncoderBinding, EncoderChange, KeyChange, KeymapSnapshot, MacroBuffer, MATRIX_COLUMNS,
        MATRIX_ROWS, MatrixPosition, SaveResult, UnlockProgress, UnlockStatus, VialRgbInfo,
        VialRgbState, VIAL_LAYER_COUNT,
    },
    transport::{TransportError, VialTransport},
    vial_frame::{
        VialFrameError, encode_via, encode_vial, parse_via_response, parse_vial_echo_response,
    },
};

const VIA_DYNAMIC_KEYMAP_GET_KEYCODE: u8 = 0x04;
const VIA_DYNAMIC_KEYMAP_SET_KEYCODE: u8 = 0x05;
const VIA_DYNAMIC_KEYMAP_MACRO_GET_COUNT: u8 = 0x0c;
const VIA_DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE: u8 = 0x0d;
const VIA_DYNAMIC_KEYMAP_MACRO_GET_BUFFER: u8 = 0x0e;
const VIA_DYNAMIC_KEYMAP_MACRO_SET_BUFFER: u8 = 0x0f;
const VIA_DYNAMIC_KEYMAP_GET_LAYER_COUNT: u8 = 0x11;
const VIA_LIGHTING_SET_VALUE: u8 = 0x07;
const VIA_LIGHTING_GET_VALUE: u8 = 0x08;
const VIA_LIGHTING_SAVE: u8 = 0x09;
const VIAL_GET_ENCODER: u8 = 0x03;
const VIAL_SET_ENCODER: u8 = 0x04;
const VIAL_GET_UNLOCK_STATUS: u8 = 0x05;
const VIAL_UNLOCK_START: u8 = 0x06;
const VIAL_UNLOCK_POLL: u8 = 0x07;
const VIAL_LOCK: u8 = 0x08;
const VIAL_TIMEOUT_MS: i32 = 500;
const VIALRGB_PROTOCOL_VERSION: u16 = 1;
const VIALRGB_GET_INFO: u8 = 0x40;
const VIALRGB_GET_MODE: u8 = 0x41;
const VIALRGB_GET_SUPPORTED: u8 = 0x42;
const VIALRGB_SET_MODE: u8 = 0x41;
const MACRO_BUFFER_CHUNK_BYTES: usize = 28;

#[derive(Debug, Error)]
pub enum ClientError {
    #[error(transparent)]
    Transport(#[from] TransportError),
    #[error(transparent)]
    Frame(#[from] VialFrameError),
    #[error("AgentPad13 requires exactly {expected} Vial layers, but the device reported {actual}")]
    UnexpectedLayerCount { expected: usize, actual: u8 },
    #[error(
        "Vial read-keycode response coordinates do not match request: requested {requested_layer},{requested_row},{requested_column}; returned {actual_layer},{actual_row},{actual_column}"
    )]
    UnexpectedKeycodeCoordinates {
        requested_layer: u8,
        requested_row: u8,
        requested_column: u8,
        actual_layer: u8,
        actual_row: u8,
        actual_column: u8,
    },
    #[error(
        "matrix position {layer},{row},{column} is outside AgentPad13's {layers}-layer {rows}x{columns} layout",
        layers = VIAL_LAYER_COUNT,
        rows = MATRIX_ROWS,
        columns = MATRIX_COLUMNS
    )]
    InvalidMatrixPosition { layer: u8, row: u8, column: u8 },
    #[error("layer {layer} is outside AgentPad13's {layers}-layer layout", layers = VIAL_LAYER_COUNT)]
    InvalidLayer { layer: u8 },
    #[error(
        "Vial keycode readback differs at {layer},{row},{column}: expected {expected:#06x}, received {actual:#06x}"
    )]
    ReadbackMismatch {
        layer: u8,
        row: u8,
        column: u8,
        expected: u16,
        actual: u16,
    },
    #[error(
        "Vial encoder readback differs on layer {layer} {direction:?}: expected {expected:#06x}, received {actual:#06x}"
    )]
    EncoderReadbackMismatch {
        layer: u8,
        direction: crate::domain::EncoderDirection,
        expected: u16,
        actual: u16,
    },
    #[error("unlock combo position {row},{column} is outside the 4x4 AgentPad13 matrix")]
    InvalidUnlockComboPosition { row: u8, column: u8 },
    #[error("AgentPad13 does not expose VialRGB on its Vial interface")]
    VialRgbUnsupported,
    #[error("AgentPad13 reports unsupported VialRGB protocol version {actual}; Studio requires version {expected}")]
    UnsupportedVialRgbProtocol { expected: u16, actual: u16 },
    #[error("VialRGB response subcommand differs: expected {expected:#04x}, received {actual:#04x}")]
    UnexpectedVialRgbSubcommand { expected: u8, actual: u8 },
    #[error("VialRGB returned a supported-effects page without a terminator")]
    UnterminatedVialRgbSupportedModes,
    #[error("VialRGB readback differs: expected {expected:?}, received {actual:?}")]
    VialRgbReadbackMismatch {
        expected: VialRgbState,
        actual: VialRgbState,
    },
    #[error("macro buffer length {actual} does not match the firmware capacity of {expected} bytes")]
    MacroBufferLengthMismatch { expected: usize, actual: usize },
    #[error("macro buffer response does not match request at offset {requested_offset}: received offset {actual_offset} and size {actual_size}")]
    UnexpectedMacroBufferResponse {
        requested_offset: u16,
        actual_offset: u16,
        actual_size: u8,
    },
    #[error("macro buffer readback differs from the staged bytes")]
    MacroReadbackMismatch { expected: Vec<u8>, actual: Vec<u8> },
}

pub struct VialClient<T: VialTransport> {
    transport: T,
}

impl<T: VialTransport> VialClient<T> {
    pub fn new(transport: T) -> Self {
        Self { transport }
    }

    pub fn into_transport(self) -> T {
        self.transport
    }

    pub fn read_snapshot(&mut self) -> Result<KeymapSnapshot, ClientError> {
        let layer_count = self.read_layer_count()?;
        if layer_count as usize != VIAL_LAYER_COUNT {
            return Err(ClientError::UnexpectedLayerCount {
                expected: VIAL_LAYER_COUNT,
                actual: layer_count,
            });
        }

        let mut layers = Vec::with_capacity(VIAL_LAYER_COUNT);
        for layer in 0..VIAL_LAYER_COUNT {
            let mut rows = Vec::with_capacity(MATRIX_ROWS);
            for row in 0..MATRIX_ROWS {
                let mut columns = Vec::with_capacity(MATRIX_COLUMNS);
                for column in 0..MATRIX_COLUMNS {
                    columns.push(self.read_keycode(layer as u8, row as u8, column as u8)?);
                }
                rows.push(columns);
            }
            layers.push(rows);
        }

        let mut encoders = Vec::with_capacity(VIAL_LAYER_COUNT);
        for layer in 0..VIAL_LAYER_COUNT {
            encoders.push(self.read_encoder(layer as u8)?);
        }

        Ok(KeymapSnapshot { layers, encoders })
    }

    pub fn write_changes(&mut self, changes: &[KeyChange]) -> Result<SaveResult, ClientError> {
        for change in changes {
            self.validate_matrix_position(change.layer, change.row, change.column)?;
        }

        let mut applied = Vec::with_capacity(changes.len());
        for change in changes {
            self.write_keycode(change)?;
            let actual = self.read_keycode(change.layer, change.row, change.column)?;
            if actual != change.keycode {
                return Err(ClientError::ReadbackMismatch {
                    layer: change.layer,
                    row: change.row,
                    column: change.column,
                    expected: change.keycode,
                    actual,
                });
            }
            applied.push(change.clone());
        }
        Ok(SaveResult { applied })
    }

    pub fn write_encoder(&mut self, change: &EncoderChange) -> Result<EncoderBinding, ClientError> {
        self.validate_layer(change.layer)?;
        let [keycode_high, keycode_low] = change.keycode.to_be_bytes();
        self.request_vial_echo(
            VIAL_SET_ENCODER,
            &[
                change.layer,
                0,
                change.direction.vial_direction(),
                keycode_high,
                keycode_low,
            ],
        )?;

        let binding = self.read_encoder(change.layer)?;
        let actual = change.direction.selected_keycode(&binding);
        if actual != change.keycode {
            return Err(ClientError::EncoderReadbackMismatch {
                layer: change.layer,
                direction: change.direction,
                expected: change.keycode,
                actual,
            });
        }

        Ok(binding)
    }

    pub fn unlock_status(&mut self) -> Result<UnlockStatus, ClientError> {
        let response = self.request_vial(VIAL_GET_UNLOCK_STATUS, &[])?;
        let mut required_keys = Vec::new();
        let (pairs, _) = response[2..].as_chunks::<2>();
        for pair in pairs {
            if *pair == [0xff, 0xff] {
                break;
            }
            if pair[0] as usize >= MATRIX_ROWS || pair[1] as usize >= MATRIX_COLUMNS {
                return Err(ClientError::InvalidUnlockComboPosition {
                    row: pair[0],
                    column: pair[1],
                });
            }
            required_keys.push(MatrixPosition {
                row: pair[0],
                column: pair[1],
            });
        }

        Ok(UnlockStatus {
            unlocked: response[0] != 0,
            in_progress: response[1] != 0,
            required_keys,
        })
    }

    pub fn begin_unlock(&mut self) -> Result<(), ClientError> {
        self.request_vial_echo(VIAL_UNLOCK_START, &[])?;
        Ok(())
    }

    pub fn poll_unlock(&mut self) -> Result<UnlockProgress, ClientError> {
        let response = self.request_vial(VIAL_UNLOCK_POLL, &[])?;
        Ok(UnlockProgress {
            unlocked: response[0] != 0,
            in_progress: response[1] != 0,
            remaining_polls: response[2],
        })
    }

    pub fn lock(&mut self) -> Result<(), ClientError> {
        self.request_vial_echo(VIAL_LOCK, &[])?;
        Ok(())
    }

    pub fn read_vialrgb(&mut self) -> Result<(VialRgbInfo, VialRgbState), ClientError> {
        let info_response = self.request_vialrgb_value(VIA_LIGHTING_GET_VALUE, VIALRGB_GET_INFO, &[])?;
        let protocol_version = u16::from_le_bytes([info_response[2], info_response[3]]);
        if protocol_version != VIALRGB_PROTOCOL_VERSION {
            return Err(ClientError::UnsupportedVialRgbProtocol {
                expected: VIALRGB_PROTOCOL_VERSION,
                actual: protocol_version,
            });
        }

        let info = VialRgbInfo {
            protocol_version,
            maximum_brightness: info_response[4],
            supported_modes: self.read_vialrgb_supported_modes()?,
        };
        let state = self.read_vialrgb_state()?;
        Ok((info, state))
    }

    pub fn write_vialrgb(&mut self, next: &VialRgbState) -> Result<VialRgbState, ClientError> {
        let [mode_low, mode_high] = next.mode.to_le_bytes();
        self.request_vialrgb_value(
            VIA_LIGHTING_SET_VALUE,
            VIALRGB_SET_MODE,
            &[
                mode_low,
                mode_high,
                next.speed,
                next.hue,
                next.saturation,
                next.brightness,
            ],
        )?;

        let actual = self.read_vialrgb_state()?;
        if actual != *next {
            return Err(ClientError::VialRgbReadbackMismatch {
                expected: next.clone(),
                actual,
            });
        }

        self.request_via(VIA_LIGHTING_SAVE, &[])?;
        Ok(actual)
    }

    pub fn read_macro_buffer(&mut self) -> Result<MacroBuffer, ClientError> {
        let count_response = self.request_via(VIA_DYNAMIC_KEYMAP_MACRO_GET_COUNT, &[])?;
        let size_response = self.request_via(VIA_DYNAMIC_KEYMAP_MACRO_GET_BUFFER_SIZE, &[])?;
        let count = count_response[1];
        let size = u16::from_be_bytes([size_response[1], size_response[2]]) as usize;
        let mut bytes = Vec::with_capacity(size);

        for offset in (0..size).step_by(MACRO_BUFFER_CHUNK_BYTES) {
            let chunk_size = (size - offset).min(MACRO_BUFFER_CHUNK_BYTES) as u8;
            bytes.extend(self.read_macro_chunk(offset as u16, chunk_size)?);
        }

        Ok(MacroBuffer { count, bytes })
    }

    pub fn write_macro_buffer(&mut self, next: &[u8]) -> Result<MacroBuffer, ClientError> {
        let current = self.read_macro_buffer()?;
        if current.bytes.len() != next.len() {
            return Err(ClientError::MacroBufferLengthMismatch {
                expected: current.bytes.len(),
                actual: next.len(),
            });
        }
        if next.is_empty() {
            return Err(ClientError::MacroBufferLengthMismatch {
                expected: 1,
                actual: 0,
            });
        }

        let mut expected = next.to_vec();
        let guard_offset = expected.len() - 1;
        expected[guard_offset] = 0;

        self.write_macro_chunk(guard_offset as u16, &[1])?;
        for (chunk_index, chunk) in expected[..guard_offset]
            .chunks(MACRO_BUFFER_CHUNK_BYTES)
            .enumerate()
        {
            self.write_macro_chunk((chunk_index * MACRO_BUFFER_CHUNK_BYTES) as u16, chunk)?;
        }
        self.write_macro_chunk(guard_offset as u16, &[0])?;

        let actual = self.read_macro_buffer()?;
        if actual.bytes != expected {
            return Err(ClientError::MacroReadbackMismatch {
                expected,
                actual: actual.bytes,
            });
        }
        Ok(actual)
    }

    fn validate_matrix_position(&self, layer: u8, row: u8, column: u8) -> Result<(), ClientError> {
        if layer as usize >= VIAL_LAYER_COUNT
            || row as usize >= MATRIX_ROWS
            || column as usize >= MATRIX_COLUMNS
        {
            return Err(ClientError::InvalidMatrixPosition { layer, row, column });
        }

        Ok(())
    }

    fn validate_layer(&self, layer: u8) -> Result<(), ClientError> {
        if layer as usize >= VIAL_LAYER_COUNT {
            return Err(ClientError::InvalidLayer { layer });
        }

        Ok(())
    }

    fn read_layer_count(&mut self) -> Result<u8, ClientError> {
        let response = self.request_via(VIA_DYNAMIC_KEYMAP_GET_LAYER_COUNT, &[])?;
        Ok(response[1])
    }

    fn read_keycode(&mut self, layer: u8, row: u8, column: u8) -> Result<u16, ClientError> {
        let response = self.request_via(VIA_DYNAMIC_KEYMAP_GET_KEYCODE, &[layer, row, column])?;
        if response[1] != layer || response[2] != row || response[3] != column {
            return Err(ClientError::UnexpectedKeycodeCoordinates {
                requested_layer: layer,
                requested_row: row,
                requested_column: column,
                actual_layer: response[1],
                actual_row: response[2],
                actual_column: response[3],
            });
        }

        Ok(u16::from_be_bytes([response[4], response[5]]))
    }

    fn write_keycode(&mut self, change: &KeyChange) -> Result<(), ClientError> {
        let [keycode_high, keycode_low] = change.keycode.to_be_bytes();
        self.request_via(
            VIA_DYNAMIC_KEYMAP_SET_KEYCODE,
            &[
                change.layer,
                change.row,
                change.column,
                keycode_high,
                keycode_low,
            ],
        )?;
        Ok(())
    }

    fn read_encoder(&mut self, layer: u8) -> Result<EncoderBinding, ClientError> {
        let response = self.request_vial(VIAL_GET_ENCODER, &[layer, 0])?;
        Ok(EncoderBinding {
            layer,
            counter_clockwise: u16::from_be_bytes([response[0], response[1]]),
            clockwise: u16::from_be_bytes([response[2], response[3]]),
        })
    }

    fn read_vialrgb_state(&mut self) -> Result<VialRgbState, ClientError> {
        let response = self.request_vialrgb_value(VIA_LIGHTING_GET_VALUE, VIALRGB_GET_MODE, &[])?;
        Ok(VialRgbState {
            mode: u16::from_le_bytes([response[2], response[3]]),
            speed: response[4],
            hue: response[5],
            saturation: response[6],
            brightness: response[7],
        })
    }

    fn read_vialrgb_supported_modes(&mut self) -> Result<Vec<u16>, ClientError> {
        let mut modes = vec![0];
        let mut greater_than = 0u16;

        loop {
            let page_start = greater_than;
            let response = self.request_vialrgb_value(
                VIA_LIGHTING_GET_VALUE,
                VIALRGB_GET_SUPPORTED,
                &greater_than.to_le_bytes(),
            )?;
            for bytes in response[2..].as_chunks::<2>().0 {
                let mode = u16::from_le_bytes([bytes[0], bytes[1]]);
                if mode == u16::MAX {
                    return Ok(modes);
                }
                if mode > greater_than && !modes.contains(&mode) {
                    modes.push(mode);
                }
                greater_than = greater_than.max(mode);
            }

            if greater_than <= page_start {
                return Err(ClientError::UnterminatedVialRgbSupportedModes);
            }
        }
    }

    fn read_macro_chunk(&mut self, offset: u16, size: u8) -> Result<Vec<u8>, ClientError> {
        let [offset_high, offset_low] = offset.to_be_bytes();
        let response = self.request_via(
            VIA_DYNAMIC_KEYMAP_MACRO_GET_BUFFER,
            &[offset_high, offset_low, size],
        )?;
        let actual_offset = u16::from_be_bytes([response[1], response[2]]);
        if actual_offset != offset || response[3] != size {
            return Err(ClientError::UnexpectedMacroBufferResponse {
                requested_offset: offset,
                actual_offset,
                actual_size: response[3],
            });
        }
        Ok(response[4..4 + size as usize].to_vec())
    }

    fn write_macro_chunk(&mut self, offset: u16, bytes: &[u8]) -> Result<(), ClientError> {
        let [offset_high, offset_low] = offset.to_be_bytes();
        let mut payload = Vec::with_capacity(bytes.len() + 3);
        payload.extend_from_slice(&[offset_high, offset_low, bytes.len() as u8]);
        payload.extend_from_slice(bytes);
        let response = self.request_via(VIA_DYNAMIC_KEYMAP_MACRO_SET_BUFFER, &payload)?;
        let actual_offset = u16::from_be_bytes([response[1], response[2]]);
        if actual_offset != offset || response[3] != bytes.len() as u8 {
            return Err(ClientError::UnexpectedMacroBufferResponse {
                requested_offset: offset,
                actual_offset,
                actual_size: response[3],
            });
        }
        Ok(())
    }

    fn request_via(
        &mut self,
        command: u8,
        payload: &[u8],
    ) -> Result<[u8; VIAL_REPORT_BYTES], ClientError> {
        let request = encode_via(command, payload)?;
        self.transport.write(&request)?;
        let response = self.transport.read_timeout(VIAL_TIMEOUT_MS)?;
        Ok(parse_via_response(&response, command)?)
    }

    fn request_vialrgb_value(
        &mut self,
        command: u8,
        subcommand: u8,
        payload: &[u8],
    ) -> Result<[u8; VIAL_REPORT_BYTES], ClientError> {
        let mut full_payload = Vec::with_capacity(payload.len() + 1);
        full_payload.push(subcommand);
        full_payload.extend_from_slice(payload);
        let request = encode_via(command, &full_payload)?;
        self.transport.write(&request)?;
        let response = self.transport.read_timeout(VIAL_TIMEOUT_MS)?;
        if response[0] == 0xff {
            return Err(ClientError::VialRgbUnsupported);
        }
        let parsed = parse_via_response(&response, command)?;
        if parsed[1] != subcommand {
            return Err(ClientError::UnexpectedVialRgbSubcommand {
                expected: subcommand,
                actual: parsed[1],
            });
        }
        Ok(parsed)
    }

    fn request_vial(
        &mut self,
        command: u8,
        payload: &[u8],
    ) -> Result<[u8; VIAL_REPORT_BYTES], ClientError> {
        let request = encode_vial(command, payload)?;
        self.transport.write(&request)?;
        Ok(self.transport.read_timeout(VIAL_TIMEOUT_MS)?)
    }

    fn request_vial_echo(
        &mut self,
        command: u8,
        payload: &[u8],
    ) -> Result<[u8; VIAL_REPORT_BYTES], ClientError> {
        let request = encode_vial(command, payload)?;
        self.transport.write(&request)?;
        let response = self.transport.read_timeout(VIAL_TIMEOUT_MS)?;
        Ok(parse_vial_echo_response(&response, command)?)
    }
}
