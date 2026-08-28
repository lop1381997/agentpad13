// AgentPad13 dual OAI + Vial HID smoke test on rp2040js.
//
// This is intentionally a USB host fixture, not descriptor proof. The Task-3
// ELF verifier owns the complete configuration descriptor contract; this
// runner dynamically requests both raw HID report descriptors and exercises
// the two known endpoint pairs.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  Simulator,
  ConsoleLogger,
  LogLevel,
  DescriptorType,
  createSetupPacket,
  getDescriptorPacket,
  setDeviceAddressPacket,
  setDeviceConfigurationPacket,
  DataDirection,
  SetupType,
  SetupRecipient,
} = require('rp2040js');
const { bootromB1 } = require('./bootrom.cjs');

const UF2_MAGIC0 = 0x0a324655;
const UF2_MAGIC1 = 0x9e5d5157;
const FLASH_START = 0x10000000;
const VIAL_REPORT_BYTES = 32;
const OAI_REPORT_BYTES = 64;
const OAI_REPORT_ID = 6;
const OAI_MAX_PAYLOAD = OAI_REPORT_BYTES - 3;
// ChibiOS allocates the standard Vial RAW pair first, then OAI_RAW_IN followed
// immediately by OAI_RAW_OUT. These fallback numbers are used only when the
// emulator truncates the configuration transfer before interface 2 appears.
const OAI_RAW_IN_EPNUM = 4;
const OAI_RAW_OUT_EPNUM = 5;

function usageHex(value, width) {
  return value.toString(16).padStart(width, '0');
}

function oaiReport(json) {
  const payload = Buffer.from(json, 'utf8');
  if (payload.length > OAI_MAX_PAYLOAD) throw new Error('single-frame fixture too large');
  const report = Buffer.alloc(OAI_REPORT_BYTES);
  report[0] = OAI_REPORT_ID;
  report[1] = 2;
  report[2] = payload.length;
  payload.copy(report, 3);
  return report;
}

function oaiReports(json) {
  const payload = Buffer.from(json, 'utf8');
  if (payload.length === 0) return [oaiReport('')];
  const reports = [];
  for (let offset = 0; offset < payload.length; offset += OAI_MAX_PAYLOAD) {
    reports.push(oaiReport(payload.subarray(offset, offset + OAI_MAX_PAYLOAD).toString('utf8')));
  }
  return reports;
}

function loadUF2(filename, rp2040) {
  const data = fs.readFileSync(filename);
  let blocks = 0;
  for (let off = 0; off + 512 <= data.length; off += 512) {
    if (data.readUInt32LE(off) !== UF2_MAGIC0 || data.readUInt32LE(off + 4) !== UF2_MAGIC1) continue;
    const target = data.readUInt32LE(off + 12);
    const size = data.readUInt32LE(off + 16);
    rp2040.flash.set(data.subarray(off + 32, off + 32 + size), target - FLASH_START);
    blocks++;
  }
  if (!blocks) throw new Error(`no UF2 blocks found in ${filename}`);
  return blocks;
}

function parseArguments(argv) {
  const [uf2Path, ...rest] = argv;
  if (!uf2Path || rest.length !== 2 || rest[0] !== '--json' || !rest[1]) {
    throw new Error('usage: node dual_oai_vial_runner.cjs <uf2-file> --json <evidence-file>');
  }
  return { uf2Path, evidencePath: rest[1] };
}

function parseConfig(desc) {
  const interfaces = [];
  let current = null;
  for (let offset = 0; offset + 2 <= desc.length;) {
    const length = desc[offset];
    const type = desc[offset + 1];
    if (length < 2 || offset + length > desc.length) break;
    if (type === DescriptorType.Interface && length === 9) {
      current = {
        number: desc[offset + 2], cls: desc[offset + 5], sub: desc[offset + 6],
        proto: desc[offset + 7], inEp: -1, outEp: -1, inBytes: 0, outBytes: 0,
        reportBytes: 0,
      };
      interfaces.push(current);
    } else if (type === 0x21 && length >= 9 && current && desc[offset + 6] === 0x22) {
      current.reportBytes = desc[offset + 7] | (desc[offset + 8] << 8);
    } else if (type === DescriptorType.Endpoint && length === 7 && current) {
      const address = desc[offset + 2];
      const bytes = desc[offset + 4] | (desc[offset + 5] << 8);
      if (address & 0x80) {
        current.inEp = address & 0x0f;
        current.inBytes = bytes;
      } else {
        current.outEp = address & 0x0f;
        current.outBytes = bytes;
      }
    }
    offset += length;
  }
  return interfaces;
}

function parseReportDescriptor(report) {
  let usagePage = null;
  let usage = null;
  let reportId = null;
  const reportCounts = [];
  for (let index = 0; index + 1 < report.length;) {
    const prefix = report[index++];
    const size = (prefix & 0x03) === 3 ? 4 : (prefix & 0x03);
    if (index + size > report.length) break;
    const value = report.subarray(index, index + size);
    const tag = prefix & 0xfc;
    if (tag === 0x04 && size === 2) usagePage = value[0] | (value[1] << 8);
    else if (tag === 0x08 && size === 1 && usage === null) usage = value[0];
    else if (tag === 0x84 && size === 1) reportId = value[0];
    else if (tag === 0x94 && size === 1) reportCounts.push(value[0]);
    index += size;
  }
  return { usagePage, usage, reportId, reportCounts };
}

function hidByReportDescriptor(hidDescriptors, expected) {
  const descriptor = hidDescriptors.find((candidate) => {
    const report = candidate.report || candidate.reportDescriptor || Buffer.alloc(0);
    const parsed = parseReportDescriptor(report);
    const expectedPayload = parsed.reportId === null
      ? expected.reportBytes : expected.reportBytes - 1;
    return parsed.usagePage === expected.usagePage &&
      parsed.usage === 0x61 &&
      candidate.inBytes === expected.reportBytes &&
      candidate.outBytes === expected.reportBytes &&
      parsed.reportCounts.includes(expectedPayload) &&
      (expected.reportId === undefined || parsed.reportId === expected.reportId);
  });
  if (!descriptor) return undefined;
  const report = descriptor.report || descriptor.reportDescriptor || Buffer.alloc(0);
  const parsed = parseReportDescriptor(report);
  return {
    ...descriptor,
    reportId: parsed.reportId,
    usagePage: parsed.usagePage,
    usage: parsed.usage,
  };
}

function reportDescriptorSetup(interfaceNumber, reportLength) {
  return { bRequest: 6, wValue: 0x2200, wIndex: interfaceNumber, wLength: reportLength };
}

function routeFrame(frame, channels) {
  if (frame.length === channels.vial.inBytes && (frame[0] === 0x01 || frame[0] === 0x04)) return 'vial';
  if (frame.length === channels.oai.inBytes && frame[0] === OAI_REPORT_ID && frame[1] === 2) return 'oai';
  return null;
}

function keyboardHid(interfaces) {
  return interfaces.find((iface) => iface.cls === 3 && iface.sub === 1 && iface.proto === 1 && iface.inEp >= 0);
}

function vendorHids(interfaces) {
  return interfaces.filter((iface) => iface.cls === 3 && iface.proto === 0 && iface.inEp >= 0 && iface.outEp >= 0);
}

function recoverTruncatedOai(interfaces, complete) {
  if (complete) return;
  let oai = interfaces.find((iface) => iface.number === 2);
  if (!oai) {
    oai = {
      number: 2, cls: 3, sub: 0, proto: 0, inEp: -1, outEp: -1,
      inBytes: OAI_REPORT_BYTES, outBytes: OAI_REPORT_BYTES, reportBytes: 0,
    };
    interfaces.push(oai);
  }
  oai.inEp = OAI_RAW_IN_EPNUM;
  oai.outEp = OAI_RAW_OUT_EPNUM;
  oai.inBytes = OAI_REPORT_BYTES;
  oai.outBytes = OAI_REPORT_BYTES;
}

function readOaiFrame(frame) {
  if (frame.length !== OAI_REPORT_BYTES || frame[0] !== OAI_REPORT_ID || frame[1] !== 2 || frame[2] > OAI_MAX_PAYLOAD) return null;
  return frame.subarray(3, 3 + frame[2]).toString('utf8');
}

function readOaiMessages(frames) {
  const messages = [];
  let pending = '';
  for (const frame of frames) {
    const fragment = readOaiFrame(frame);
    if (fragment === null) continue;
    pending += fragment;
    for (;;) {
      const end = pending.indexOf('\r\n');
      if (end < 0) break;
      messages.push(pending.slice(0, end + 2));
      pending = pending.slice(end + 2);
    }
  }
  return messages;
}

function reportDescriptorMatches(report, expected) {
  const parsed = parseReportDescriptor(report);
  const payload = expected.report_id === null ? expected.report_bytes : expected.report_bytes - 1;
  const usagePage = parseInt(expected.usage.split(':')[0], 16);
  return parsed.usagePage === usagePage && parsed.usage === 0x61 &&
    parsed.reportId === expected.report_id && parsed.reportCounts.includes(payload);
}

function main() {
  const { uf2Path, evidencePath } = parseArguments(process.argv.slice(2));
  if (!fs.existsSync(uf2Path)) throw new Error(`pre-hardware build gate: dual OAI/Vial UF2 is unavailable: ${uf2Path}`);
  const uf2Data = fs.readFileSync(uf2Path);
  const uf2Sha256 = crypto.createHash('sha256').update(uf2Data).digest('hex');

  const sim = new Simulator();
  const mcu = sim.rp2040;
  mcu.loadBootrom(bootromB1);
  mcu.logger = new ConsoleLogger(LogLevel.Error);
  const blocks = loadUF2(uf2Path, mcu);
  {
    const adc = mcu.adc;
    const originalRead = adc.readUint32.bind(adc);
    adc.readUint32 = (offset) => {
      const value = originalRead(offset);
      if (offset === 0x0c) adc.checkInterrupts();
      return value;
    };
    adc.channelValues[0] = 2048;
    adc.channelValues[1] = 2048;
  }
  {
    const dma = mcu.dma;
    const originalRead = dma.readUint32.bind(dma);
    dma.readUint32 = (offset) => (offset === 0x444 ? 0 : originalRead(offset));
  }
  for (let pin = 0; pin <= 15; pin++) mcu.gpio[pin].setInputValue(true);
  mcu.gpio[16].setInputValue(false);
  let gp17Edges = 0;
  mcu.gpio[17].addListener(() => gp17Edges++);

  const usb = mcu.usbCtrl;
  let resetSeen = false;
  let configured = false;
  let enumState = 'address';
  let ep0Activity = 0;
  let configLength = 0;
  const configBytes = [];
  let interfaces = [];
  const reportDescriptors = new Map();
  let reportDescriptorTarget = null;
  let reportDescriptorDone = false;
  let deviceDescriptor = Buffer.alloc(0);
  const captures = new Map();
  const txQueues = new Map();
  const armedReads = new Map();
  const reportDescriptorRequests = [];
  const eventLog = [];

  const log = (message) => eventLog.push(`[${(sim.clock.micros / 1000).toFixed(1)}ms] ${message}`);
  const endpointOwner = (endpoint, direction = 'in') => {
    const iface = interfaces.find((candidate) => candidate[`${direction}Ep`] === endpoint);
    return iface ? iface.number : null;
  };

  usb.onUSBEnabled = () => { log('USB controller enabled'); usb.resetDevice(); };
  usb.onResetReceived = () => { resetSeen = true; log('USB reset'); };
  usb.onEndpointWrite = (endpoint, buffer) => {
    const bytes = Buffer.from(buffer);
    if (endpoint === 0) {
      ep0Activity++;
      if (bytes.length === 0) {
        if (enumState === 'address') {
          enumState = 'device';
          usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Device, 18));
        } else if (enumState === 'set-configuration') {
          configured = true;
          enumState = 'configured';
          interfaces = parseConfig(Buffer.from(configBytes));
          recoverTruncatedOai(interfaces, configBytes.length >= configLength);
        }
        return;
      }
      if (enumState === 'device' && bytes[1] === DescriptorType.Device) {
        deviceDescriptor = bytes;
        enumState = 'config-header';
        usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, 9));
      } else if (enumState === 'config-header' && bytes.length === 9 && bytes[1] === DescriptorType.Configration) {
        configLength = bytes[2] | (bytes[3] << 8);
        enumState = 'config';
        usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, configLength));
      } else if (enumState === 'config') {
        configBytes.push(...bytes);
        interfaces = parseConfig(Buffer.from(configBytes));
        if (configBytes.length >= configLength || (keyboardHid(interfaces) && vendorHids(interfaces).length > 0)) {
          recoverTruncatedOai(interfaces, configBytes.length >= configLength);
          enumState = 'set-configuration';
          usb.sendSetupPacket(setDeviceConfigurationPacket(1));
        }
      } else if (enumState === 'report-descriptor') {
        reportDescriptors.set(reportDescriptorTarget, bytes);
        reportDescriptorDone = true;
        enumState = 'configured';
      }
      return;
    }
    const owner = endpointOwner(endpoint);
    if (owner !== null) {
      if (!captures.has(endpoint)) captures.set(endpoint, []);
      captures.get(endpoint).push(bytes);
      log(`${owner === 1 ? 'vial' : owner === 2 ? 'oai' : `hid${owner}`} IN ${bytes.length}B`);
    }
  };
  usb.onEndpointRead = (endpoint, byteCount) => {
    if (endpointOwner(endpoint, 'out') !== null && txQueues.get(endpoint)?.length) {
      usb.endpointReadDone(endpoint, txQueues.get(endpoint).shift());
    } else {
      armedReads.set(endpoint, byteCount);
    }
  };

  function sendFrame(channel, frame) {
    if (frame.length !== channel.inBytes) throw new Error(`frame must be ${channel.inBytes} bytes`);
    if (routeFrame(frame, { vial, oai }) !== channel.kind) throw new Error(`frame routed to the wrong HID channel: ${channel.kind}`);
    if (!txQueues.has(channel.outEp)) txQueues.set(channel.outEp, []);
    if (armedReads.has(channel.outEp)) {
      armedReads.delete(channel.outEp);
      usb.endpointReadDone(channel.outEp, frame);
    } else {
      txQueues.get(channel.outEp).push(frame);
    }
  }

  const cycleNanos = 1e9 / 125000000;
  const wallStart = Date.now();
  let pioTick = 0;
  function runForMicros(micros) {
    const target = sim.clock.nanos + micros * 1000;
    let stallGuard = 0;
    while (sim.clock.nanos < target) {
      if (Date.now() - wallStart > 25 * 60 * 1000) throw new Error('emulator wall-clock budget exceeded');
      const before = sim.clock.nanos;
      if (mcu.core.waiting) sim.clock.tick(Math.min(sim.clock.nanosToNextAlarm, target - sim.clock.nanos));
      else sim.clock.tick(mcu.core.executeInstruction() * cycleNanos);
      if ((++pioTick & 3) === 0) {
        if (!mcu.pio[0].stopped) mcu.pio[0].step();
        if (!mcu.pio[1].stopped) mcu.pio[1].step();
      }
      if (sim.clock.nanos === before) {
        if (++stallGuard > 1e7) throw new Error(`simulation stalled at PC=0x${mcu.core.PC.toString(16)}`);
      } else stallGuard = 0;
    }
  }

  mcu.core.PC = 0x10000000;
  let addressAttempts = 0;
  let lastActivity = 0;
  for (let attempt = 0; attempt < 80 && !configured; attempt++) {
    runForMicros(100000);
    if (resetSeen && enumState === 'address' && ep0Activity === 0 && addressAttempts < 5) {
      addressAttempts++;
      usb.sendSetupPacket(setDeviceAddressPacket(1));
    } else if (ep0Activity > 0 && ep0Activity === lastActivity && attempt % 5 === 4) {
      if (enumState === 'device') usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Device, 18));
      else if (enumState === 'config-header') usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, 9));
      else if (enumState === 'config') {
        configBytes.length = 0;
        usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, configLength));
      } else if (enumState === 'set-configuration') usb.sendSetupPacket(setDeviceConfigurationPacket(1));
    }
    lastActivity = ep0Activity;
  }
  if (!configured) throw new Error(`USB enumeration did not complete (state=${enumState})`);

  for (const dreq of [0, 1, 2, 3, 8, 9, 10, 11]) mcu.dma.setDREQ(dreq);
  for (const channel of mcu.dma.channels) {
    const originalStart = channel.start.bind(channel);
    channel.start = () => { originalStart(); if (channel.active && mcu.dma.dreq[channel.treq]) channel.scheduleTransfer(); };
  }

  const keyboard = keyboardHid(interfaces);
  const candidates = vendorHids(interfaces);
  if (!keyboard) throw new Error('USB configuration has no boot keyboard HID interface');
  for (const candidate of candidates) {
    const reportLength = candidate.reportBytes || 255;
    enumState = 'report-descriptor';
    reportDescriptorTarget = candidate.number;
    reportDescriptorDone = false;
    reportDescriptorRequests.push(candidate.number);
    usb.sendSetupPacket(createSetupPacket({
      ...reportDescriptorSetup(candidate.number, reportLength),
      dataDirection: DataDirection.DeviceToHost,
      type: SetupType.Standard,
      recipient: SetupRecipient.Interface,
    }));
    for (let attempt = 0; attempt < 20 && !reportDescriptorDone; attempt++) runForMicros(100000);
    if (!reportDescriptorDone) throw new Error(`HID report descriptor was not returned for interface ${candidate.number}`);
  }

  const hidDescriptors = candidates.map((candidate) => ({ ...candidate, report: reportDescriptors.get(candidate.number) }));
  const vial = hidByReportDescriptor(hidDescriptors, { usagePage: 0xff60, reportId: null, reportBytes: VIAL_REPORT_BYTES });
  const oai = hidByReportDescriptor(hidDescriptors, { usagePage: 0xff00, reportId: OAI_REPORT_ID, reportBytes: OAI_REPORT_BYTES });
  if (!vial || !oai || vial.number === oai.number || vial.inEp === oai.inEp) throw new Error('dual HID interfaces are not distinct');
  if (vial.number !== 1 || oai.number !== 2) throw new Error('unexpected dual HID interface order');
  vial.kind = 'vial';
  oai.kind = 'oai';
  captures.set(vial.inEp, []);
  captures.set(oai.inEp, []);

  const vialFrames = () => captures.get(vial.inEp) || [];
  const oaiFrames = () => captures.get(oai.inEp) || [];
  const sendVial = (command) => {
    const request = Buffer.alloc(VIAL_REPORT_BYTES);
    request[0] = command;
    if (command === 0x04) { request[1] = 0; request[2] = 0; request[3] = 0; }
    sendFrame(vial, request);
  };
  const rpc = (json, ack) => {
    const before = oaiFrames().length;
    const reports = oaiReports(json);
    for (const report of reports) { sendFrame(oai, report); runForMicros(20000); }
    runForMicros(250000);
    return { acknowledged: readOaiMessages(oaiFrames().slice(before)).includes(ack), fragmentCount: reports.length };
  };

  // Interleave one Vial command and one unchanged OAI RPC before reading any reply.
  sendVial(0x01);
  const rgbcfgResult = rpc('{"method":"v.oai.rgbcfg","id":1,"params":{}}', '{"result":true,"id":1}\r\n');
  runForMicros(250000);
  const vialProtocolAck = vialFrames().some((frame) => frame.length === VIAL_REPORT_BYTES && frame[0] === 0x01);
  const beforeKeycode = vialFrames().length;
  sendVial(0x04);
  runForMicros(250000);
  const keycodeFrame = vialFrames().slice(beforeKeycode).find((frame) => frame[0] === 0x04);
  const vialDefaultK00 = keycodeFrame ? (keycodeFrame[4] << 8) | keycodeFrame[5] : null;

  const edgesBeforeStatus = gp17Edges;
  const visibleStatus = { id: 0, c: 3162110, e: 4, b: 1, s: 0.5 };
  const thstatusResult = rpc(
    '{"method":"v.oai.thstatus","id":2,"params":[{"id":0,"c":3162110,"e":4,"b":1,"s":0.5}]}',
    '{"result":true,"id":2}\r\n'
  );
  runForMicros(250000);
  const edgesAfterStatus = gp17Edges;
  const deviceStatusAck = rpc('{"method":"device.status","id":3,"params":{}}', '{"result":{},"id":3}\r\n').acknowledged;
  const beforeKey = oaiFrames().length;
  mcu.gpio[12].setInputValue(false);
  runForMicros(150000);
  mcu.gpio[12].setInputValue(true);
  runForMicros(150000);
  const keyFrame = readOaiMessages(oaiFrames().slice(beforeKey)).find((json) => json === '{"method":"v.oai.hid","params":{"k":"AG00","act":1}}\r\n');

  const vialEvidence = { usage: 'ff60:0061', report_id: null, report_bytes: 32 };
  const oaiEvidence = { usage: 'ff00:0061', report_id: 6, report_bytes: 64 };
  const allEndpointFrames = [...captures.entries()];
  const vialReplyEndpoints = allEndpointFrames.filter(([, frames]) => frames.some((frame) => frame.length === VIAL_REPORT_BYTES && (frame[0] === 0x01 || frame[0] === 0x04))).map(([endpoint]) => endpoint);
  const oaiReplyEndpoints = allEndpointFrames.filter(([, frames]) => readOaiMessages(frames).length > 0).map(([endpoint]) => endpoint);
  const channelsIsolated = vialReplyEndpoints.every((endpoint) => endpoint === vial.inEp) &&
    oaiReplyEndpoints.every((endpoint) => endpoint === oai.inEp) &&
    vialReplyEndpoints.length > 0 && oaiReplyEndpoints.length > 0;
  const vid = deviceDescriptor.length >= 12 ? deviceDescriptor.readUInt16LE(8) : 0;
  const pid = deviceDescriptor.length >= 12 ? deviceDescriptor.readUInt16LE(10) : 0;
  const evidence = {
    uf2_blocks: blocks,
    uf2_size_bytes: uf2Data.length,
    uf2_sha256: uf2Sha256,
    usb_enumerated: configured,
    vid_pid: `${usageHex(vid, 4)}:${usageHex(pid, 4)}`,
    vial_interface: vialEvidence,
    oai_interface: oaiEvidence,
    vial_endpoint: { number: vial.number, in_endpoint: vial.inEp, out_endpoint: vial.outEp, in_bytes: vial.inBytes, out_bytes: vial.outBytes },
    oai_endpoint: { number: oai.number, in_endpoint: oai.inEp, out_endpoint: oai.outEp, in_bytes: oai.inBytes, out_bytes: oai.outBytes },
    report_descriptor_requests: reportDescriptorRequests,
    keyboard_hid_enumerated: true,
    descriptor_verified: reportDescriptorMatches(reportDescriptors.get(vial.number), vialEvidence) && reportDescriptorMatches(reportDescriptors.get(oai.number), oaiEvidence),
    vial_protocol_ack: vialProtocolAck,
    vial_default_k00: vialDefaultK00,
    rgbcfg_ack: rgbcfgResult.acknowledged,
    thstatus_ack: thstatusResult.acknowledged,
    device_status_ack: deviceStatusAck,
    task_status: visibleStatus,
    task_status_fragment_count: thstatusResult.fragmentCount,
    key_event: keyFrame ? { k: 'AG00', act: 1 } : null,
    ws2812_activity: edgesAfterStatus > edgesBeforeStatus && thstatusResult.fragmentCount > 1,
    channels_isolated: channelsIsolated,
    gp17_edges_after_thstatus: edgesAfterStatus - edgesBeforeStatus,
    usb_events: eventLog,
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify(evidence));
  const checks = [
    evidence.vid_pid === '303a:8360', evidence.descriptor_verified,
    evidence.keyboard_hid_enumerated, evidence.vial_protocol_ack,
    evidence.vial_default_k00 !== null, evidence.rgbcfg_ack,
    evidence.thstatus_ack, evidence.device_status_ack,
    evidence.task_status_fragment_count > 1, evidence.key_event !== null,
    evidence.ws2812_activity, evidence.channels_isolated,
  ];
  if (!checks.every(Boolean)) throw new Error(`dual OAI/Vial smoke failed; evidence written to ${evidencePath}`);
  process.exit(0);
}

module.exports = {
  main,
  oaiReport,
  oaiReports,
  parseReportDescriptor,
  hidByReportDescriptor,
  reportDescriptorSetup,
  reportDescriptorMatches,
  routeFrame,
  readOaiMessages,
};

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`DUAL OAI/VIAL EMULATOR SMOKE: FAIL: ${error.message}`);
    process.exitCode = 1;
  }
}
