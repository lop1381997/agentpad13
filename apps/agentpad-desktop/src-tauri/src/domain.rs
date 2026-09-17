use serde::{Deserialize, Serialize};

pub const VIAL_LAYER_COUNT: usize = 8;
pub const MATRIX_ROWS: usize = 4;
pub const MATRIX_COLUMNS: usize = 4;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct KeyChange {
    pub layer: u8,
    pub row: u8,
    pub column: u8,
    pub keycode: u16,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EncoderDirection {
    CounterClockwise,
    Clockwise,
}

impl EncoderDirection {
    pub fn vial_direction(self) -> u8 {
        match self {
            Self::CounterClockwise => 0,
            Self::Clockwise => 1,
        }
    }

    pub fn selected_keycode(self, binding: &EncoderBinding) -> u16 {
        match self {
            Self::CounterClockwise => binding.counter_clockwise,
            Self::Clockwise => binding.clockwise,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EncoderChange {
    pub layer: u8,
    pub direction: EncoderDirection,
    pub keycode: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct EncoderBinding {
    pub layer: u8,
    pub counter_clockwise: u16,
    pub clockwise: u16,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MatrixPosition {
    pub row: u8,
    pub column: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct UnlockStatus {
    pub unlocked: bool,
    pub in_progress: bool,
    pub required_keys: Vec<MatrixPosition>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct UnlockProgress {
    pub unlocked: bool,
    pub in_progress: bool,
    pub remaining_polls: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VialRgbInfo {
    pub protocol_version: u16,
    pub maximum_brightness: u8,
    pub supported_modes: Vec<u16>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VialRgbState {
    pub mode: u16,
    pub speed: u8,
    pub hue: u8,
    pub saturation: u8,
    pub brightness: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LedRgb {
    pub red: u8,
    pub green: u8,
    pub blue: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LiveMonitorInfo {
    pub major: u8,
    pub minor: u8,
    pub led_count: u8,
    pub chunk_led_count: u8,
    pub chunk_count: u8,
    pub maximum_fps: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct LiveLedFrame {
    pub sequence: u16,
    pub active_layer: u8,
    pub flags: u8,
    pub leds: Vec<LedRgb>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct MacroBuffer {
    pub count: u8,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct KeymapSnapshot {
    pub layers: Vec<Vec<Vec<u16>>>,
    pub encoders: Vec<EncoderBinding>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SaveResult {
    pub applied: Vec<KeyChange>,
}
