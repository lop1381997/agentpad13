// Independent process watchdog for the synchronous rp2040js dual-HID runner.
// The runner remains responsible for simulator guards and atomic evidence; this
// parent is the only deadline that can interrupt a non-returning child tick.
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_DEADLINE_MS = 15000;
const USAGE = 'usage: node dual_oai_vial_watchdog.cjs <uf2-file> --json <evidence-file> [--deadline-ms <ms>]';

function parseArguments(argv) {
  const [uf2Path, ...rest] = argv;
  if (!uf2Path || rest[0] !== '--json' || !rest[1] || (rest.length - 2) % 2 !== 0) throw new Error(USAGE);
  let deadlineMs = DEFAULT_DEADLINE_MS;
  for (let index = 2; index < rest.length; index += 2) {
    if (rest[index] !== '--deadline-ms' || !/^\d+$/.test(rest[index + 1])) throw new Error(USAGE);
    deadlineMs = Number(rest[index + 1]);
  }
  if (deadlineMs < 1) throw new Error('--deadline-ms must be at least 1');
  return { uf2Path, evidencePath: rest[1], deadlineMs };
}

function cleanupTemporaryEvidence(evidencePath, childPid) {
  const temporaryPath = `${evidencePath}.tmp-${childPid}`;
  if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
}

function main() {
  const { uf2Path, evidencePath, deadlineMs } = parseArguments(process.argv.slice(2));
  const childArgs = [
    path.join(__dirname, 'dual_oai_vial_runner.cjs'),
    uf2Path,
    '--json', evidencePath,
    '--deadline-ms', String(deadlineMs),
  ];
  const child = spawn(process.execPath, childArgs, { stdio: 'inherit' });
  let finished = false;
  const deadline = setTimeout(() => {
    if (finished) return;
    finished = true;
    child.kill('SIGKILL');
    cleanupTemporaryEvidence(evidencePath, child.pid);
    console.error(`DUAL OAI/VIAL WATCHDOG: FAIL: watchdog deadline exceeded after ${deadlineMs}ms`);
    process.exit(1);
  }, deadlineMs);

  child.once('error', (error) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    cleanupTemporaryEvidence(evidencePath, child.pid);
    console.error(`DUAL OAI/VIAL WATCHDOG: FAIL: ${error.message}`);
    process.exit(1);
  });
  child.once('exit', (code, signal) => {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    cleanupTemporaryEvidence(evidencePath, child.pid);
    if (signal) {
      console.error(`DUAL OAI/VIAL WATCHDOG: FAIL: runner terminated by ${signal}`);
      process.exit(1);
    }
    process.exit(code === 0 ? 0 : 1);
  });
}

try {
  main();
} catch (error) {
  console.error(`DUAL OAI/VIAL WATCHDOG: FAIL: ${error.message}`);
  process.exit(1);
}
