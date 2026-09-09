use thiserror::Error;

use crate::device::VIAL_REPORT_BYTES;

pub const VIAL_MAGIC_PREFIX: u8 = 0xFE;

#[derive(Debug, Error, Eq, PartialEq)]
pub enum VialFrameError {
    #[error("payload length {actual} exceeds fixed report capacity {maximum}")]
    PayloadTooLong { actual: usize, maximum: usize },
    #[error("expected a {expected}-byte report, received {actual} bytes")]
    InvalidReportLength { expected: usize, actual: usize },
    #[error("expected VIA response command {expected:#04x}, received {actual:#04x}")]
    UnexpectedCommand { expected: u8, actual: u8 },
    #[error(
        "expected Vial magic/command {prefix:#04x}/{expected:#04x}, received {actual_prefix:#04x}/{actual_command:#04x}",
        prefix = VIAL_MAGIC_PREFIX
    )]
    UnexpectedVialCommand {
        expected: u8,
        actual_prefix: u8,
        actual_command: u8,
    },
}

pub fn encode_via(command: u8, payload: &[u8]) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError> {
    let maximum = VIAL_REPORT_BYTES - 1;
    if payload.len() > maximum {
        return Err(VialFrameError::PayloadTooLong {
            actual: payload.len(),
            maximum,
        });
    }

    let mut frame = [0; VIAL_REPORT_BYTES];
    frame[0] = command;
    frame[1..1 + payload.len()].copy_from_slice(payload);
    Ok(frame)
}

pub fn encode_vial(command: u8, payload: &[u8]) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError> {
    let maximum = VIAL_REPORT_BYTES - 2;
    if payload.len() > maximum {
        return Err(VialFrameError::PayloadTooLong {
            actual: payload.len(),
            maximum,
        });
    }

    let mut frame = [0; VIAL_REPORT_BYTES];
    frame[0] = VIAL_MAGIC_PREFIX;
    frame[1] = command;
    frame[2..2 + payload.len()].copy_from_slice(payload);
    Ok(frame)
}

pub fn parse_via_response(
    frame: &[u8],
    expected_command: u8,
) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError> {
    if frame.len() != VIAL_REPORT_BYTES {
        return Err(VialFrameError::InvalidReportLength {
            expected: VIAL_REPORT_BYTES,
            actual: frame.len(),
        });
    }
    if frame[0] != expected_command {
        return Err(VialFrameError::UnexpectedCommand {
            expected: expected_command,
            actual: frame[0],
        });
    }

    let mut report = [0; VIAL_REPORT_BYTES];
    report.copy_from_slice(frame);
    Ok(report)
}

pub fn parse_vial_echo_response(
    frame: &[u8],
    expected_command: u8,
) -> Result<[u8; VIAL_REPORT_BYTES], VialFrameError> {
    if frame.len() != VIAL_REPORT_BYTES {
        return Err(VialFrameError::InvalidReportLength {
            expected: VIAL_REPORT_BYTES,
            actual: frame.len(),
        });
    }
    if frame[0] != VIAL_MAGIC_PREFIX || frame[1] != expected_command {
        return Err(VialFrameError::UnexpectedVialCommand {
            expected: expected_command,
            actual_prefix: frame[0],
            actual_command: frame[1],
        });
    }

    let mut report = [0; VIAL_REPORT_BYTES];
    report.copy_from_slice(frame);
    Ok(report)
}
