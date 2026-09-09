use crate::{
    device::VIAL_REPORT_BYTES,
    hid_transport::{decode_hidapi_input, encode_hidapi_output},
    transport::TransportError,
};

#[test]
fn prefixes_vial_output_with_the_zero_report_id_required_by_hidapi() {
    let mut vial_report = [0; VIAL_REPORT_BYTES];
    vial_report[..4].copy_from_slice(&[0xfe, 0x03, 4, 0]);

    let packet = encode_hidapi_output(&vial_report);

    assert_eq!(packet.len(), VIAL_REPORT_BYTES + 1);
    assert_eq!(&packet[..5], &[0, 0xfe, 0x03, 4, 0]);
}

#[test]
fn accepts_only_a_complete_32_byte_vial_input_report() {
    let response = [0x42; VIAL_REPORT_BYTES];

    assert_eq!(
        decode_hidapi_input(&response).expect("complete Vial report is accepted"),
        response
    );
    assert!(matches!(
        decode_hidapi_input(&response[..VIAL_REPORT_BYTES - 1]),
        Err(TransportError::InvalidReadLength {
            expected,
            actual,
        }) if expected == VIAL_REPORT_BYTES && actual == VIAL_REPORT_BYTES - 1
    ));
}
