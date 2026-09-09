use hidapi::{DeviceInfo, HidApi, HidDevice};
use thiserror::Error;

use crate::{
    device::{DeviceSelectionError, HidCandidate, VIAL_REPORT_BYTES, is_agentpad_vial},
    transport::{TransportError, VialTransport},
};

#[derive(Debug, Error)]
pub enum HidTransportOpenError {
    #[error(transparent)]
    HidApi(#[from] hidapi::HidError),
    #[error(transparent)]
    Selection(#[from] DeviceSelectionError),
}

pub struct HidApiTransport {
    device: HidDevice,
}

impl HidApiTransport {
    pub fn open_agentpad_vial_path(path: &str) -> Result<Self, HidTransportOpenError> {
        let api = HidApi::new()?;
        let info = api
            .device_list()
            .find(|info| {
                info.path().to_string_lossy() == path
                    && is_agentpad_vial(&candidate_from_device_info(info))
            })
            .ok_or(DeviceSelectionError::VialCollectionNotFound)?;
        let device = info.open_device(&api)?;

        Ok(Self { device })
    }
}

pub fn list_hid_candidates() -> Result<Vec<HidCandidate>, hidapi::HidError> {
    let api = HidApi::new()?;
    Ok(api.device_list().map(candidate_from_device_info).collect())
}

fn candidate_from_device_info(info: &DeviceInfo) -> HidCandidate {
    HidCandidate {
        vendor_id: info.vendor_id(),
        product_id: info.product_id(),
        usage_page: info.usage_page(),
        usage: info.usage(),
        // The selected Vial collection is the known unnumbered 32-byte report.
        // HIDAPI does not expose report size/ID from DeviceInfo, so this is a
        // second invariant enforced by the transport below.
        report_id: None,
        report_bytes: VIAL_REPORT_BYTES,
        path: info.path().to_string_lossy().into_owned(),
    }
}

pub fn encode_hidapi_output(report: &[u8; VIAL_REPORT_BYTES]) -> [u8; VIAL_REPORT_BYTES + 1] {
    let mut packet = [0; VIAL_REPORT_BYTES + 1];
    // hidapi requires an explicit report-ID byte even for an unnumbered
    // collection. Vial itself starts immediately after that zero byte.
    packet[1..].copy_from_slice(report);
    packet
}

pub fn decode_hidapi_input(bytes: &[u8]) -> Result<[u8; VIAL_REPORT_BYTES], TransportError> {
    if bytes.len() != VIAL_REPORT_BYTES {
        return Err(TransportError::InvalidReadLength {
            expected: VIAL_REPORT_BYTES,
            actual: bytes.len(),
        });
    }

    let mut report = [0; VIAL_REPORT_BYTES];
    report.copy_from_slice(bytes);
    Ok(report)
}

impl VialTransport for HidApiTransport {
    fn write(&mut self, report: &[u8; VIAL_REPORT_BYTES]) -> Result<(), TransportError> {
        let packet = encode_hidapi_output(report);
        let written = self
            .device
            .write(&packet)
            .map_err(|error| TransportError::Write(error.to_string()))?;
        if written != packet.len() {
            return Err(TransportError::InvalidWriteLength {
                expected: packet.len(),
                actual: written,
            });
        }

        Ok(())
    }

    fn read_timeout(&mut self, timeout_ms: i32) -> Result<[u8; VIAL_REPORT_BYTES], TransportError> {
        let mut packet = [0; VIAL_REPORT_BYTES];
        let received = self
            .device
            .read_timeout(&mut packet, timeout_ms)
            .map_err(|error| TransportError::Read(error.to_string()))?;
        decode_hidapi_input(&packet[..received])
    }
}
