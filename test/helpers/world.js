// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake scanservjs, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs: the tests read scanservjs with
// `world.hub.pollNow()`. (From guim31/gladys-backrest.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { scannerIds, serverIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { BASE, FakeScanservjs, PASSWORD, USERNAME, readFixture } from './fakeScanservjs.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
// 22/10/2026 10:00 UTC (12:00 in Paris).
export const START = Date.UTC(2026, 9, 22, 10, 0, 0);
export const SCANNER = 'test:0';

/** A manual clock, shared by the hub, the fake and the tests. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/** The default instance: the "test:0" scanner, two files of yesterday and today. */
export function defaultScanservjs(clock) {
  const fake = new FakeScanservjs({ now: clock.now });
  fake.addFile('scan_2026-10-21 18.30.00.pdf', {
    time: clock.time - 15.5 * HOUR,
    content: readFixture('adf-10-pages.pdf'),
  });
  fake.addFile('scan_2026-10-22 08.00.00.pdf', { time: clock.time - 2 * HOUR });
  return fake;
}

export async function createWorld({
  clock = createClock(),
  scanservjs = defaultScanservjs(clock),
  config = { url: BASE, username: USERNAME, password: PASSWORD, language: 'en' },
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-scanservjs-')),
  timers = false,
  timings,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: scanservjs.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, scanservjs, app, hub: app.hub, clock, dataDir };
}

export const scannerIdsOf = (world, id = SCANNER) => scannerIds(world.gladys, id);
export const serverIdsOf = (world) => serverIds(world.gladys);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { BASE, FakeScanservjs, PASSWORD, USERNAME };
