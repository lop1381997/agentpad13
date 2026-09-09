use crate::device::{
    AGENTPAD_PRODUCT_ID, AGENTPAD_VENDOR_ID, DeviceSelectionError, HidCandidate, VIAL_REPORT_BYTES,
    VIAL_USAGE, VIAL_USAGE_PAGE, is_agentpad_vial, select_agentpad_vial,
};

fn matching_vial_candidate() -> HidCandidate {
    HidCandidate {
        vendor_id: AGENTPAD_VENDOR_ID,
        product_id: AGENTPAD_PRODUCT_ID,
        usage_page: VIAL_USAGE_PAGE,
        usage: VIAL_USAGE,
        report_id: None,
        report_bytes: VIAL_REPORT_BYTES,
        path: "agentpad-vial".into(),
    }
}

#[test]
fn accepts_only_the_exact_agentpad_vial_collection() {
    assert!(is_agentpad_vial(&matching_vial_candidate()));
}

#[test]
fn rejects_oai_collection_with_matching_vid_pid() {
    let mut candidate = matching_vial_candidate();
    candidate.usage_page = 0xFF00;
    candidate.report_id = Some(6);
    candidate.report_bytes = 64;

    assert!(!is_agentpad_vial(&candidate));
}

#[test]
fn selects_vial_and_never_the_oai_collection_when_both_are_present() {
    let mut oai_candidate = matching_vial_candidate();
    oai_candidate.usage_page = 0xff00;
    oai_candidate.report_id = Some(6);
    oai_candidate.report_bytes = 64;
    oai_candidate.path = "agentpad-oai".into();
    let vial_candidate = matching_vial_candidate();

    let candidates = [oai_candidate, vial_candidate];
    let selected = select_agentpad_vial(&candidates).expect("the Vial collection must be selected");

    assert_eq!(selected.path, "agentpad-vial");
}

#[test]
fn reports_when_the_vial_collection_is_not_available() {
    assert_eq!(
        select_agentpad_vial(&[]),
        Err(DeviceSelectionError::VialCollectionNotFound)
    );
}
