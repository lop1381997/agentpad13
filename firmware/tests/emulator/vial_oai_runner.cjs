// Execute the shared OAI smoke runner against the standard Vial Raw HID transport.
'use strict';

process.env.AGENTPAD_OAI_VIAL = '1';
const runner = require('./oai_runner.cjs');

try {
  runner.main();
} catch (error) {
  console.error(`VIAL OAI EMULATOR SMOKE: FAIL: ${error.message}`);
  process.exitCode = 1;
}
