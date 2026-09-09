use thiserror::Error;

use crate::device::VIAL_REPORT_BYTES;

#[derive(Debug, Error)]
pub enum TransportError {
    #[error("failed to read Vial report: {0}")]
    Read(String),
    #[error("failed to write Vial report: {0}")]
    Write(String),
    #[error("HIDAPI returned {actual} bytes for a Vial read; expected {expected}")]
    InvalidReadLength { expected: usize, actual: usize },
    #[error("HIDAPI reported writing {actual} bytes; expected {expected}")]
    InvalidWriteLength { expected: usize, actual: usize },
}

pub trait VialTransport: Send {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError>;

    fn read_timeout(&mut self, timeout_ms: i32) -> Result<[u8; VIAL_REPORT_BYTES], TransportError>;
}

impl<T: VialTransport + ?Sized> VialTransport for Box<T> {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError> {
        (**self).write(report)
    }

    fn read_timeout(&mut self, timeout_ms: i32) -> Result<[u8; VIAL_REPORT_BYTES], TransportError> {
        (**self).read_timeout(timeout_ms)
    }
}
