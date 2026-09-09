pub const AGENTPAD_VENDOR_ID: u16 = 0x303A;
pub const AGENTPAD_PRODUCT_ID: u16 = 0x8360;
pub const VIAL_USAGE_PAGE: u16 = 0xFF60;
pub const VIAL_USAGE: u16 = 0x0061;
pub const VIAL_REPORT_BYTES: usize = 32;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HidCandidate {
    pub vendor_id: u16,
    pub product_id: u16,
    pub usage_page: u16,
    pub usage: u16,
    pub report_id: Option<u8>,
    pub report_bytes: usize,
    pub path: String,
}

#[derive(Debug, Error, Eq, PartialEq)]
pub enum DeviceSelectionError {
    #[error("AgentPad13 Vial collection (usage page 0xff60, usage 0x0061) was not found")]
    VialCollectionNotFound,
}

pub fn is_agentpad_vial(candidate: &HidCandidate) -> bool {
    candidate.vendor_id == AGENTPAD_VENDOR_ID
        && candidate.product_id == AGENTPAD_PRODUCT_ID
        && candidate.usage_page == VIAL_USAGE_PAGE
        && candidate.usage == VIAL_USAGE
        && candidate.report_id.is_none()
        && candidate.report_bytes == VIAL_REPORT_BYTES
}

pub fn select_agentpad_vial(
    candidates: &[HidCandidate],
) -> Result<&HidCandidate, DeviceSelectionError> {
    candidates
        .iter()
        .find(|candidate| is_agentpad_vial(candidate))
        .ok_or(DeviceSelectionError::VialCollectionNotFound)
}
use thiserror::Error;
