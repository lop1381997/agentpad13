use crate::vial_frame::{
    VialFrameError, encode_via, encode_vial, parse_via_response, parse_vial_echo_response,
};

#[test]
fn encodes_via_keycode_reads_as_fixed_size_reports() {
    let frame = encode_via(0x04, &[3, 2, 1]).expect("a three-byte request fits");

    assert_eq!(&frame[..6], &[0x04, 3, 2, 1, 0, 0]);
    assert_eq!(frame.len(), 32);
}

#[test]
fn encodes_vial_encoder_reads_with_the_magic_prefix() {
    let frame = encode_vial(0x03, &[4, 0]).expect("a two-byte Vial request fits");

    assert_eq!(&frame[..4], &[0xFE, 0x03, 4, 0]);
    assert_eq!(frame.len(), 32);
}

#[test]
fn rejects_payloads_that_do_not_fit_the_fixed_report() {
    assert!(matches!(
        encode_via(0x04, &[0; 32]),
        Err(VialFrameError::PayloadTooLong { .. })
    ));
}

#[test]
fn rejects_a_via_response_with_a_wrong_command_echo() {
    let mut response = [0; 32];
    response[0] = 0x05;

    assert!(matches!(
        parse_via_response(&response, 0x04),
        Err(VialFrameError::UnexpectedCommand {
            expected: 0x04,
            actual: 0x05
        })
    ));
}

#[test]
fn rejects_a_vial_setter_response_without_its_magic_command_echo() {
    let mut response = [0; 32];
    response[0] = 0xfe;
    response[1] = 0x05;

    assert!(matches!(
        parse_vial_echo_response(&response, 0x04),
        Err(VialFrameError::UnexpectedVialCommand {
            expected: 0x04,
            actual_prefix: 0xfe,
            actual_command: 0x05,
        })
    ));
}
