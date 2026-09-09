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
const DEFAULT_DEADLINE_MS = 15000;
// ChibiOS allocates the keyboard IN endpoint first, then the standard Vial RAW
// pair, then OAI_RAW_IN followed immediately by OAI_RAW_OUT. These fallback
// numbers are used only when the emulator truncates the configuration transfer
// before interface 2 appears.
const OAI_RAW_IN_EPNUM = 3;
const OAI_RAW_OUT_EPNUM = 4;
let activeDeadline = null;

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
  if (!uf2Path || rest[0] !== '--json' || !rest[1]) {
    throw new Error('usage: node dual_oai_vial_runner.cjs <uf2-file> --json <evidence-file> [--deadline-ms <ms>]');
  }
  let deadlineMs = DEFAULT_DEADLINE_MS;
  if ((rest.length - 2) % 2 !== 0) {
    throw new Error('usage: node dual_oai_vial_runner.cjs <uf2-file> --json <evidence-file> [--deadline-ms <ms>]');
  }
  for (let index = 2; index < rest.length; index += 2) {
    if (rest[index] !== '--deadline-ms' || !/^\d+$/.test(rest[index + 1])) {
      throw new Error('usage: node dual_oai_vial_runner.cjs <uf2-file> --json <evidence-file> [--deadline-ms <ms>]');
    }
    deadlineMs = Number(rest[index + 1]);
  }
  if (deadlineMs < 1) throw new Error('--deadline-ms must be at least 1');
  return { uf2Path, evidencePath: rest[1], deadlineMs };
}

function createDeadline(deadlineMs, evidencePath) {
  const deadlineAt = Date.now() + deadlineMs;
  const temporaryEvidencePath = `${evidencePath}.tmp-${process.pid}`;
  const cleanup = () => {
    if (fs.existsSync(temporaryEvidencePath)) fs.unlinkSync(temporaryEvidencePath);
  };
  const timer = setTimeout(() => {
    cleanup();
    console.error(`DUAL OAI/VIAL EMULATOR SMOKE: FAIL: emulator deadline exceeded after ${deadlineMs}ms`);
    process.exit(1);
  }, deadlineMs);
  return {
    temporaryEvidencePath,
    check() {
      if (Date.now() >= deadlineAt) throw new Error(`emulator deadline exceeded after ${deadlineMs}ms`);
    },
    cleanup,
    clear() {
      clearTimeout(timer);
      cleanup();
    },
  };
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
        inAddress: null, outAddress: null,
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
        current.inAddress = address;
        current.inBytes = bytes;
      } else {
        current.outEp = address & 0x0f;
        current.outAddress = address;
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
  if (frame.length === channels.vial.inBytes && [0x01, 0x04, 0x05, 0x0c, 0x0d, 0xfe].includes(frame[0])) return 'vial';
  if (frame.length === channels.oai.inBytes && frame[0] === OAI_REPORT_ID && frame[1] === 2) return 'oai';
  return null;
}

function keyboardHid(interfaces) {
  return interfaces.find((iface) => iface.cls === 3 && iface.sub === 1 && iface.proto === 1 && iface.inEp >= 0);
}

function hasValidatedDualConfigPrefix(desc) {
  if (desc.length < 9 || desc[0] !== 9 || desc[1] !== DescriptorType.Configration || desc[4] !== 3) return false;
  const interfaces = parseConfig(desc);
  const keyboard = interfaces.find((iface) =>
    iface.number === 0 && iface.cls === 3 && iface.sub === 1 && iface.proto === 1 &&
    iface.inEp >= 0 && iface.inAddress === 0x85
  );
  const vial = interfaces.find((iface) =>
    iface.number === 1 && iface.cls === 3 && iface.sub === 0 && iface.proto === 0 &&
    iface.inEp >= 0 && iface.inAddress === 0x81 && iface.inBytes === VIAL_REPORT_BYTES
  );
  return Boolean(keyboard && vial);
}

function vendorHids(interfaces) {
  return interfaces.filter((iface) => iface.cls === 3 && iface.proto === 0 && iface.inEp >= 0 && iface.outEp >= 0);
}

function recoverTruncatedConfig(interfaces, { complete, prefixValidated }) {
  const recovery = { used: false, syntheticVialOutEndpoint: null, syntheticOaiEndpoint: null };
  if (complete || !prefixValidated) return recovery;
  const vial = interfaces.find((iface) => iface.number === 1);
  if (vial && vial.outEp < 0) {
    // rp2040js stops after the Vial IN endpoint. ChibiOS places Vial OUT next;
    // only fill this absent endpoint and record that it is not descriptor proof.
    vial.outEp = vial.inEp + 1;
    vial.outAddress = 0x02;
    vial.outBytes = VIAL_REPORT_BYTES;
    recovery.used = true;
    recovery.syntheticVialOutEndpoint = {
      interface_number: 1,
      out_endpoint: vial.outEp,
      out_endpoint_address: vial.outAddress,
      not_descriptor_proof: true,
    };
  }
  if (!interfaces.some((iface) => iface.number === 2)) {
    interfaces.push({
      number: 2, cls: 3, sub: 0, proto: 0, inEp: -1, outEp: -1,
      inAddress: null, outAddress: null,
      inBytes: OAI_REPORT_BYTES, outBytes: OAI_REPORT_BYTES, reportBytes: 0,
    });
    const oai = interfaces[interfaces.length - 1];
    // The Task-3 ELF verifier proves this ChibiOS allocation. This synthetic
    // runtime endpoint is solely an emulator transport recovery, never
    // configuration-descriptor proof.
    oai.inEp = OAI_RAW_IN_EPNUM;
    oai.outEp = OAI_RAW_OUT_EPNUM;
    oai.inAddress = 0x83;
    oai.outAddress = 0x04;
    recovery.used = true;
    recovery.syntheticOaiEndpoint = {
      interface_number: 2,
      in_endpoint: OAI_RAW_IN_EPNUM,
      out_endpoint: OAI_RAW_OUT_EPNUM,
      in_endpoint_address: oai.inAddress,
      out_endpoint_address: oai.outAddress,
      not_descriptor_proof: true,
    };
  }
  return recovery;
}

function hasDistinctRawEndpointPairs(vial, oai) {
  const address = (iface, direction) => iface[`${direction}Address`] ?? iface[`${direction}Ep`];
  return Boolean(vial && oai && vial.number !== oai.number &&
    vial.inEp >= 0 && oai.inEp >= 0 && vial.outEp >= 0 && oai.outEp >= 0 &&
    address(vial, 'in') !== address(oai, 'in') && address(vial, 'out') !== address(oai, 'out') &&
    address(vial, 'in') !== address(vial, 'out') && address(oai, 'in') !== address(oai, 'out'));
}

function readUsbStringDescriptor(descriptor) {
  if (!descriptor || descriptor.length < 2 || descriptor[1] !== 3 || descriptor[0] > descriptor.length || descriptor[0] < 2 || descriptor[0] % 2 !== 0) return null;
  return descriptor.subarray(2, descriptor[0]).toString('utf16le');
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

function oaiHidEnumerated(oai, reportDescriptors, reportDescriptorRequests) {
  return Boolean(oai && oai.number === 2 && reportDescriptorRequests.includes(2) &&
    reportDescriptors.has(2) && reportDescriptorMatches(reportDescriptors.get(2), {
      usage: 'ff00:0061', report_id: OAI_REPORT_ID, report_bytes: OAI_REPORT_BYTES,
    }));
}

function main() {
  const { uf2Path, evidencePath, deadlineMs } = parseArguments(process.argv.slice(2));
  activeDeadline = createDeadline(deadlineMs, evidencePath);
  activeDeadline.check();
  if (!fs.existsSync(uf2Path)) throw new Error(`pre-hardware build gate: dual OAI/Vial UF2 is unavailable: ${uf2Path}`);
  activeDeadline.check();
  const uf2Data = fs.readFileSync(uf2Path);
  activeDeadline.check();
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
  let configRecovery = { used: false, syntheticVialOutEndpoint: null, syntheticOaiEndpoint: null };
  const reportDescriptors = new Map();
  let reportDescriptorTarget = null;
  let reportDescriptorDone = false;
  let deviceDescriptor = Buffer.alloc(0);
  let manufacturerString = null;
  let productString = null;
  const captures = new Map();
  const txQueues = new Map();
  const armedReads = new Map();
  const reportDescriptorRequests = [];
  const eventLog = [];

  const log = (message) => eventLog.push(`[${(sim.clock.micros / 1000).toFixed(1)}ms] ${message}`);
  const endpointOwner = (endpoint, direction = 'in') => {
    activeDeadline.check();
    const iface = interfaces.find((candidate) => candidate[`${direction}Ep`] === endpoint);
    return iface ? iface.number : null;
  };

  usb.onUSBEnabled = () => { log('USB controller enabled'); usb.resetDevice(); };
  usb.onResetReceived = () => { activeDeadline.check(); resetSeen = true; log('USB reset'); };
  usb.onEndpointWrite = (endpoint, buffer) => {
    activeDeadline.check();
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
          configRecovery = recoverTruncatedConfig(interfaces, {
            complete: configBytes.length >= configLength,
            prefixValidated: hasValidatedDualConfigPrefix(Buffer.from(configBytes)),
          });
        }
        return;
      }
      if (enumState === 'device' && bytes[1] === DescriptorType.Device) {
        deviceDescriptor = bytes;
        const manufacturerIndex = bytes[14];
        const productIndex = bytes[15];
        enumState = 'manufacturer-string';
        usb.sendSetupPacket(createSetupPacket({
          bRequest: 6, wValue: (DescriptorType.String << 8) | manufacturerIndex,
          wIndex: 0x0409, wLength: 255, dataDirection: DataDirection.DeviceToHost,
          type: SetupType.Standard, recipient: SetupRecipient.Device,
        }));
      } else if (enumState === 'manufacturer-string' && bytes[1] === DescriptorType.String) {
        manufacturerString = readUsbStringDescriptor(bytes);
        if (manufacturerString === null) throw new Error('malformed USB manufacturer string descriptor');
        const productIndex = deviceDescriptor[15];
        enumState = 'product-string';
        usb.sendSetupPacket(createSetupPacket({
          bRequest: 6, wValue: (DescriptorType.String << 8) | productIndex,
          wIndex: 0x0409, wLength: 255, dataDirection: DataDirection.DeviceToHost,
          type: SetupType.Standard, recipient: SetupRecipient.Device,
        }));
      } else if (enumState === 'product-string' && bytes[1] === DescriptorType.String) {
        productString = readUsbStringDescriptor(bytes);
        if (productString === null) throw new Error('malformed USB product string descriptor');
        enumState = 'config-header';
        usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, 9));
      } else if (enumState === 'config-header' && bytes.length === 9 && bytes[1] === DescriptorType.Configration) {
        configLength = bytes[2] | (bytes[3] << 8);
        enumState = 'config';
        usb.sendSetupPacket(getDescriptorPacket(DescriptorType.Configration, configLength));
      } else if (enumState === 'config') {
        configBytes.push(...bytes);
        interfaces = parseConfig(Buffer.from(configBytes));
        const complete = configBytes.length >= configLength;
        const prefixValidated = hasValidatedDualConfigPrefix(Buffer.from(configBytes));
        if (complete || prefixValidated) {
          configRecovery = recoverTruncatedConfig(interfaces, { complete, prefixValidated });
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
    activeDeadline.check();
    if (endpointOwner(endpoint, 'out') !== null && txQueues.get(endpoint)?.length) {
      usb.endpointReadDone(endpoint, txQueues.get(endpoint).shift());
    } else {
      armedReads.set(endpoint, byteCount);
    }
  };

  function sendFrame(channel, frame) {
    activeDeadline.check();
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
  const deadlineAt = wallStart + deadlineMs;
  let pioTick = 0;
  function runForMicros(micros) {
    activeDeadline.check();
    const target = sim.clock.nanos + micros * 1000;
    let stallGuard = 0;
    while (sim.clock.nanos < target) {
      activeDeadline.check();
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
    activeDeadline.check();
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
    activeDeadline.check();
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
  if (!hasDistinctRawEndpointPairs(vial, oai)) throw new Error('dual HID endpoint pairs are not distinct');
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
  const vialRequest = (request, responsePredicate) => {
    const before = vialFrames().length;
    sendFrame(vial, request);
    runForMicros(250000);
    return vialFrames().slice(before).find((frame) =>
      frame.length === VIAL_REPORT_BYTES && responsePredicate(frame)
    ) || null;
  };
  const vialEncoderMap = () => {
    const request = Buffer.alloc(VIAL_REPORT_BYTES);
    request[0] = 0xfe; // Vial prefix
    request[1] = 0x03; // vial_get_encoder
    request[2] = 0; // layer 0
    request[3] = 0; // encoder 0
    const response = vialRequest(request, (frame) => frame[0] !== 0xfe);
    return response ? {
      ccw: (response[0] << 8) | response[1],
      clockwise: (response[2] << 8) | response[3],
    } : null;
  };
  const setVialEncoderKeycode = (direction, keycode) => {
    const request = Buffer.alloc(VIAL_REPORT_BYTES);
    request[0] = 0xfe; // Vial prefix
    request[1] = 0x04; // vial_set_encoder
    request[2] = 0; // layer 0
    request[3] = 0; // encoder 0
    request[4] = direction;
    request[5] = keycode >> 8;
    request[6] = keycode & 0xff;
    return vialRequest(request, (frame) => frame[0] === 0xfe && frame[1] === 0x04);
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

  const encoderMapBefore = vialEncoderMap();
  const encoderStates = [
    [[true, true], [false, true], [false, false], [true, false], [true, true]],
    [[true, true], [true, false], [false, false], [false, true], [true, true]],
  ];
  const rotateEncoder = (states) => {
    const beforeOai = oaiFrames().length;
    const beforeKeyboard = (captures.get(keyboard.inEp) || []).length;
    for (const [a, b] of states) {
      mcu.gpio[13].setInputValue(a);
      mcu.gpio[14].setInputValue(b);
      runForMicros(50000);
    }
    return {
      oaiMessages: readOaiMessages(oaiFrames().slice(beforeOai)),
      keyboardFrames: (captures.get(keyboard.inEp) || []).slice(beforeKeyboard),
    };
  };
  let clockwiseStates = encoderStates[0];
  let clockwiseRotation = rotateEncoder(clockwiseStates);
  if (!clockwiseRotation.oaiMessages.some((message) => message.includes('"k":"ENC_CW"'))) {
    clockwiseStates = encoderStates[1];
    clockwiseRotation = rotateEncoder(clockwiseStates);
  }
  const expectedClockwiseOaiEvent = '{"method":"v.oai.hid","params":{"k":"ENC_CW","act":2}}\r\n';
  const initialRotationOaiEvents = clockwiseRotation.oaiMessages.filter((message) => message.includes('"k":"ENC_'));
  const dynamicEncoderKeycode = 0x52; // KC_UP
  const encoderWrite = setVialEncoderKeycode(1, dynamicEncoderKeycode);
  const encoderMapAfter = vialEncoderMap();
  const rotationAfterMapWrite = rotateEncoder(clockwiseStates);
  const rotationKeyboardFrames = rotationAfterMapWrite.keyboardFrames.filter(
    (frame) => frame.length === 9 && frame[0] === 1
  );
  const encoderRotationBehavior = {
    initial_map_readback_verified: encoderMapBefore.ccw !== null && encoderMapBefore.clockwise !== null,
    initial_rotation_emitted_oai_event: clockwiseRotation.oaiMessages.some((message) => message.includes('"k":"ENC_CW"')),
    initial_rotation_event: clockwiseRotation.oaiMessages.find((message) => message.includes('"k":"ENC_')) || null,
    initial_rotation_oai_events: initialRotationOaiEvents,
    initial_rotation_oai_event_count: initialRotationOaiEvents.length,
    initial_rotation_emitted_exactly_one_oai_event:
      initialRotationOaiEvents.length === 1 && initialRotationOaiEvents[0] === expectedClockwiseOaiEvent,
    dynamic_map_write_ack: encoderWrite !== null,
    initial_map_readback: encoderMapBefore,
    programmed_clockwise_keycode: dynamicEncoderKeycode,
    map_readback_after_write: encoderMapAfter ? encoderMapAfter.clockwise : null,
    rotation_after_map_write_seen: rotationKeyboardFrames.length > 0,
    rotation_used_programmed_keycode: rotationKeyboardFrames.some((frame) => frame.includes(dynamicEncoderKeycode)),
  };
  const beforeKeyboardKey = (captures.get(keyboard.inEp) || []).length;
  // Rebind K00 through the live Vial dynamic-keymap path, then press SW1.
  // This produces a genuine boot-keyboard report while retaining the OAI AG00
  // assertion above; both transports and the dynamic map are covered.
  const setK00Esc = Buffer.alloc(VIAL_REPORT_BYTES);
  setK00Esc[0] = 0x05;
  setK00Esc[5] = 0x29;
  sendFrame(vial, setK00Esc);
  runForMicros(250000);
  mcu.gpio[12].setInputValue(false);
  runForMicros(150000);
  mcu.gpio[12].setInputValue(true);
  runForMicros(150000);
  const keyboardFrames = () => captures.get(keyboard.inEp) || [];
  const keyboardReports = keyboardFrames().filter((frame) => frame.length === 9 && frame[0] === 1);
  const keyboardReportsAfterInput = keyboardFrames()
    .slice(beforeKeyboardKey)
    .filter((frame) => frame.length === 9 && frame[0] === 1);
  const keyboardReportsAfterKey = keyboardReportsAfterInput.length;
  const keyboardPressSeen = keyboardReportsAfterInput.some((frame) => frame.subarray(2).some((byte) => byte !== 0));
  const keyboardReleaseSeen = keyboardReportsAfterInput.some((frame) => frame.subarray(2).every((byte) => byte === 0));
  const keyboardReportBehavior = {
    report_bytes: 8,
    report_count: keyboardReports.length,
    reports_after_key: Math.max(0, keyboardReportsAfterKey),
    press_seen: keyboardPressSeen,
    release_seen: keyboardReleaseSeen,
  };

  const joystickFrames = () => keyboardFrames().filter((frame) => frame.length >= 5 && frame[0] === 7);
  const sampleJoystick = (x12, y12) => {
    const before = joystickFrames().length;
    mcu.adc.channelValues[0] = x12;
    mcu.adc.channelValues[1] = y12;
    runForMicros(700000);
    return joystickFrames().slice(before);
  };
  const joystickA = sampleJoystick(4000, 100);
  const joystickB = sampleJoystick(100, 4000);
  const lastJoystick = (frames) => frames.length ? frames[frames.length - 1] : null;
  const joystickAxes = (frame) => {
    if (!frame) return null;
    const signed16 = (offset) => {
      const value = frame[offset] | (frame[offset + 1] << 8);
      return value >= 0x8000 ? value - 0x10000 : value;
    };
    return [signed16(1), signed16(3)];
  };
  const joystickAAxes = joystickAxes(lastJoystick(joystickA));
  const joystickBAxes = joystickAxes(lastJoystick(joystickB));
  const joystickReportBehavior = {
    report_id: 7,
    report_count: joystickFrames().length,
    axes_a: joystickAAxes,
    axes_b: joystickBAxes,
    axes_swung: Boolean(joystickAAxes && joystickBAxes &&
      Math.sign(joystickAAxes[0]) === -Math.sign(joystickBAxes[0]) &&
      Math.sign(joystickAAxes[1]) === -Math.sign(joystickBAxes[1])),
  };

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
    config_descriptor_recovery_used: configRecovery.used,
    synthetic_vial_out_endpoint: configRecovery.syntheticVialOutEndpoint,
    synthetic_oai_endpoint: configRecovery.syntheticOaiEndpoint,
    keyboard_hid_enumerated: Boolean(keyboard && keyboardReports.length > 0),
    keyboard_report_behavior: keyboardReportBehavior,
    joystick_report_behavior: joystickReportBehavior,
    encoder_rotation_behavior: encoderRotationBehavior,
    shared_keyboard_joystick_endpoint: {
      keyboard_endpoint: keyboard.inEp,
      joystick_endpoint: keyboard.inEp,
    },
    oai_hid_enumerated: oaiHidEnumerated(oai, reportDescriptors, reportDescriptorRequests),
    report_descriptors_verified: reportDescriptorMatches(reportDescriptors.get(vial.number), vialEvidence) && reportDescriptorMatches(reportDescriptors.get(oai.number), oaiEvidence),
    configuration_descriptor_verified: !configRecovery.used,
    descriptor_verified: !configRecovery.used && reportDescriptorMatches(reportDescriptors.get(vial.number), vialEvidence) && reportDescriptorMatches(reportDescriptors.get(oai.number), oaiEvidence),
    device_identity: { manufacturer: manufacturerString, product: productString },
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
  activeDeadline.check();
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(activeDeadline.temporaryEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  activeDeadline.check();
  const checkNames = [
    'vid_pid', 'report_descriptors_verified', 'keyboard_hid_enumerated',
    'oai_hid_enumerated', 'vial_protocol_ack', 'vial_default_k00',
    'rgbcfg_ack', 'thstatus_ack', 'device_status_ack',
    'task_status_fragment_count', 'key_event', 'manufacturer', 'product',
    'ws2812_activity', 'channels_isolated', 'encoder_rotation_behavior',
  ];
  const checks = [
    evidence.vid_pid === '303a:8360', evidence.report_descriptors_verified,
    evidence.keyboard_hid_enumerated, evidence.oai_hid_enumerated, evidence.vial_protocol_ack,
    evidence.vial_default_k00 !== null, evidence.rgbcfg_ack,
    evidence.thstatus_ack, evidence.device_status_ack,
    evidence.task_status_fragment_count > 1, evidence.key_event !== null,
    evidence.device_identity.manufacturer === 'hirlu', evidence.device_identity.product === 'Codex Micro Lab OAI LED',
    evidence.ws2812_activity, evidence.channels_isolated,
    evidence.encoder_rotation_behavior.initial_map_readback_verified &&
      evidence.encoder_rotation_behavior.initial_rotation_emitted_oai_event &&
      evidence.encoder_rotation_behavior.dynamic_map_write_ack &&
      evidence.encoder_rotation_behavior.map_readback_after_write === dynamicEncoderKeycode &&
      evidence.encoder_rotation_behavior.rotation_after_map_write_seen &&
      evidence.encoder_rotation_behavior.rotation_used_programmed_keycode,
  ];
  const failedChecks = checkNames.filter((_name, index) => !checks[index]);
  if (failedChecks.length) {
    const keyboardFrameSummary = (captures.get(keyboard.inEp) || [])
      .map((frame) => `${frame.length}:${frame[0]}`)
      .join(',');
    throw new Error(
      `dual OAI/Vial smoke failed; evidence was not published (${failedChecks.join(', ')}; ` +
      `keyboard_in_bytes=${keyboard.inBytes}; keyboard_frames=${keyboardFrameSummary || 'none'}; ` +
      `encoder=${JSON.stringify(encoderRotationBehavior)})`
    );
  }
  activeDeadline.check();
  fs.renameSync(activeDeadline.temporaryEvidencePath, evidencePath);
  activeDeadline.clear();
  console.log(JSON.stringify(evidence));
  process.exit(0);
}

module.exports = {
  main,
  oaiReport,
  oaiReports,
  parseConfig,
  parseReportDescriptor,
  hidByReportDescriptor,
  reportDescriptorSetup,
  reportDescriptorMatches,
  hasValidatedDualConfigPrefix,
  recoverTruncatedConfig,
  hasDistinctRawEndpointPairs,
  readUsbStringDescriptor,
  oaiHidEnumerated,
  routeFrame,
  readOaiMessages,
};

if (require.main === module) {
  try { main(); } catch (error) {
    if (activeDeadline) activeDeadline.cleanup();
    console.error(`DUAL OAI/VIAL EMULATOR SMOKE: FAIL: ${error.message}`);
    process.exit(1);
  }
}
