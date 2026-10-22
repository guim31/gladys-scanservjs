// -----------------------------------------------------------------------------
// The hub against the SDK's fake Gladys and a fake scanservjs: discovery,
// states, scans from Gladys (presets, one at a time, failures), scans of the
// web interface, persistence across restarts, deletion, errors, quiet logs,
// the widget and the reading timer of the container.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { SCANNER_KEYS, SERVER_KEYS } from '../src/devices.js';
import { MAX_ANNOUNCED, ORIGINS, TRIGGERS, WIDGET_KEY } from '../src/hub.js';
import { SCENE_ACTIONS } from '../src/scenes.js';
import {
  BASE,
  FakeScanservjs,
  HOUR,
  MINUTE,
  PASSWORD,
  USERNAME,
  createClock,
  createDevices,
  createWorld,
  scannerIdsOf,
  serverIdsOf,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const scannerState = (world, key) => world.fake.lastState(scannerIdsOf(world).feature(key));
const serverState = (world, key) => world.fake.lastState(serverIdsOf(world).feature(key));
const CONFIG = { url: BASE, username: USERNAME, password: PASSWORD, language: 'en' };
const settle = async () => {
  for (let i = 0; i < 20; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
};
const scan = (world, fields) => world.fake.sceneAction('start_scan', fields);

test('one device per scanner and one for the files, nothing polled by Gladys', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    ['scanservjs', 'test:0', 'test:1'],
  );
  for (const device of devices) {
    assert.equal(device.should_poll, false);
    assert.equal(device.poll_frequency, undefined);
  }
  assert.match(devices[1].external_id, /:scanner:test-0-[0-9a-f]{8}$/);
  // Nothing is published for devices not added, and the first read fires nothing.
  assert.equal(world.fake.states.length, 0);
  assert.equal(world.fake.sceneEvents.length, 0);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.ok(!JSON.stringify(devices).includes(PASSWORD));
});

test('the states of the added devices', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Ready');
  assert.equal(scannerState(world, SCANNER_KEYS.SCANNING), 0);
  assert.equal(serverState(world, SERVER_KEYS.LAST_FILE), 'scan_2026-10-22 08.00.00.pdf');
  assert.equal(serverState(world, SERVER_KEYS.LAST_PAGES), 1);
  // Yesterday's file is not of today (Gladys' time zone, TZ).
  assert.equal(serverState(world, SERVER_KEYS.SCANS_TODAY), 1);
  assert.equal(serverState(world, SERVER_KEYS.FILES), 2);
  assert.match(String(serverState(world, SERVER_KEYS.LAST_SCAN)), /^22\/10, \d\d:00$/);
  const badges = world.fake.transports.map((entry) => entry.transport);
  assert.deepEqual([...new Set(badges)], ['local']);
});

test('a scan of the web interface fires "A scan is done", with its pages, once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const { scanservjs, clock } = world;
  clock.advance(MINUTE);
  const adf = (await import('./helpers/fakeScanservjs.js')).readFixture('adf-10-pages.pdf');
  scanservjs.addFile('scan_2026-10-22 10.01.00.pdf', { content: adf });
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.COMPLETED), [
    {
      key: TRIGGERS.COMPLETED,
      data: {
        file: 'scan_2026-10-22 10.01.00.pdf',
        format: 'pdf',
        pages: 10,
        size_kb: 76,
        origin: ORIGINS.SCANSERVJS,
        pipeline: '',
        preset: '',
        scanner: '',
      },
    },
  ]);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 1, 'not twice');
  // Renamed in the web interface: same time, no news.
  scanservjs.files.at(-1).name = 'invoice.pdf';
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 1);
  // Two files at the same time are both announced.
  clock.advance(MINUTE);
  scanservjs.addFile('a.jpg', { content: Buffer.from('x') });
  scanservjs.addFile('b.jpg', { content: Buffer.from('y') });
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.COMPLETED)
      .slice(1)
      .map((event) => [event.data.file, event.data.pages]),
    [
      ['a.jpg', 1],
      ['b.jpg', 1],
    ],
  );
});

test('"Scan" with the default preset: the request, the outputs, the event, once', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.clock.advance(MINUTE);
  const ack = await scan(world, { preset: '1' });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(world.scanservjs.lastScan, {
    params: { deviceId: 'test:0', resolution: 300, mode: 'Gray' },
    pipeline: 'PDF (JPG | @:pipeline.high-quality)',
    batch: 'none',
    index: 1,
  });
  const file = 'scan_2026-10-22 10.01.00.pdf';
  assert.deepEqual(ack.data.outputs, { done: true, file, pages: 1 });
  assert.deepEqual(events(world, TRIGGERS.COMPLETED).at(-1).data, {
    file,
    format: 'pdf',
    pages: 1,
    size_kb: 8,
    origin: ORIGINS.GLADYS,
    pipeline: 'PDF (JPG | high quality)',
    preset: 'Document',
    scanner: 'test:0',
  });
  assert.equal(serverState(world, SERVER_KEYS.LAST_FILE), file);
  assert.equal(serverState(world, SERVER_KEYS.SCANS_TODAY), 2);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 1, 'not announced again by the reading');
  // The scanner went through "scanning" and is ready again.
  const scanning = world.fake.states
    .filter((s) => s.device_feature_external_id === scannerIdsOf(world).feature('scanning'))
    .map((s) => s.state);
  assert.deepEqual(scanning, [0, 1, 0]);
});

test('a feeder preset scans every sheet; colour and line art find the scanner words', async (t) => {
  const world = await createWorld({
    config: {
      ...CONFIG,
      preset_2_name: 'Couleur',
      preset_2_format: 'png',
      preset_2_mode: 'lineart',
      preset_2_resolution: '200',
      preset_3_name: 'Courrier',
    },
  });
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  const ack = await scan(world, { preset: '3', device: scannerIdsOf(world).device });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(world.scanservjs.lastScan.params, {
    deviceId: 'test:0',
    resolution: 150,
    mode: 'Gray',
    source: 'Automatic Document Feeder',
  });
  assert.equal(world.scanservjs.lastScan.batch, 'auto');
  assert.equal(ack.data.outputs.pages, 10);
  // Line art: the "test" scanner has only Gray and Color. 200 dpi: 150 is closer than 300.
  world.clock.advance(MINUTE);
  assert.equal((await scan(world, { preset: '2' })).success, true);
  assert.deepEqual(world.scanservjs.lastScan.params, {
    deviceId: 'test:0',
    resolution: 150,
    mode: 'Gray',
  });
  assert.equal(world.scanservjs.lastScan.pipeline, 'PNG');
});

test('one scan at a time; the scanner shows "Scanning" while it runs', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.scanservjs.holdScans = true;
  const { done } = await world.hub.startScan({ preset: '1' });
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Scanning');
  assert.equal(scannerState(world, SCANNER_KEYS.SCANNING), 1);
  const second = await scan(world, { preset: '2' });
  assert.equal(second.success, false);
  assert.match(second.error, /already running/);
  // A file of the web interface during the scan waits for its end.
  world.scanservjs.addFile('web.pdf');
  await world.hub.pollNow();
  assert.equal(world.fake.sceneEvents.length, 0);
  world.scanservjs.release();
  await done;
  await settle();
  assert.deepEqual(
    events(world, TRIGGERS.COMPLETED).map((event) => event.data.origin),
    [ORIGINS.GLADYS, ORIGINS.SCANSERVJS],
  );
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Ready');
});

test('two scans within a second: the pages of each file, and the second waits', async (t) => {
  const world = await createWorld({
    config: { ...CONFIG, preset_3_name: 'Courrier' },
    timings: { sameNameGuardMs: 50 },
  });
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  assert.equal((await scan(world, { preset: '3' })).data.outputs.pages, 10);
  // 300 ms later, the same second for scanservjs: the same name, the first
  // file replaced. The pages are the new file's, not the 10 of the old one.
  world.clock.advance(300);
  const second = await scan(world, { preset: '1' });
  assert.equal(second.data.outputs.pages, 1);
  assert.equal(world.scanservjs.files.length, 3);
  const widget = await world.fake.widgetGet(WIDGET_KEY, { settings: {} });
  assert.equal(widget.data.content.components[1].value, 1);
  // Gladys waits for the next second (here 50 ms) before the next scan.
  const started = Date.now();
  assert.equal((await scan(world, { preset: '2' })).success, true);
  assert.ok(Date.now() - started >= 45);
});

test('an empty folder at first: its first file is news', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock, scanservjs: new FakeScanservjs({ now: clock.now }) });
  t.after(() => world.app.stop());
  world.clock.advance(MINUTE);
  world.scanservjs.addFile('first.pdf');
  await world.hub.pollNow();
  assert.deepEqual(
    events(world, TRIGGERS.COMPLETED).map((event) => event.data.file),
    ['first.pdf'],
  );
});

test('scanservjs lost during a scan: the scanner does not stay "Scanning"', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.scanservjs.holdScans = true;
  const { done } = await world.hub.startScan({ preset: '1' });
  assert.equal(scannerState(world, SCANNER_KEYS.SCANNING), 1);
  world.scanservjs.down = true;
  world.scanservjs.release();
  await assert.rejects(done);
  await settle();
  assert.equal(scannerState(world, SCANNER_KEYS.SCANNING), 0);
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Last scan failed');
});

test('a scene starting a scan on "A scan is done" is not refused as busy', async (t) => {
  const world = await createWorld({ timings: { sameNameGuardMs: 0 } });
  t.after(() => world.app.stop());
  let next = null;
  const fire = world.gladys.publishSceneEvent.bind(world.gladys);
  world.gladys.publishSceneEvent = async (key, data) => {
    await fire(key, data);
    if (key === TRIGGERS.COMPLETED && !next) {
      world.clock.advance(MINUTE);
      next = world.hub.startScan({ preset: '2' });
    }
  };
  await scan(world, { preset: '1' });
  await (
    await next
  ).done;
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 2);
});

test('pages not readable for a while are counted again later', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const request = world.scanservjs.request;
  let failing = true;
  world.hub.client.request = async (url, options) => {
    if (failing && url.endsWith('.pdf')) {
      throw new Error('socket hang up');
    }
    return request(url, options);
  };
  world.clock.advance(MINUTE);
  world.scanservjs.addFile('new.pdf');
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.COMPLETED)[0].data.pages, 0);
  failing = false;
  await world.hub.pollNow();
  assert.equal(world.hub.knownPages(world.hub.files[0]), 1);
});

test('a scan that cannot start (scanservjs down) fires "A scan fails" too', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.scanservjs.down = true;
  await world.hub.pollNow();
  const ack = await scan(world, { preset: '1' });
  assert.equal(ack.success, false);
  assert.deepEqual(events(world, TRIGGERS.FAILED).at(-1).data, {
    device: '',
    scanner: '',
    preset: 'Document',
    message: 'scanservjs does not answer',
  });
});

test('a long scan: the action answers "not done yet", the event comes at its end', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.scanservjs.holdScans = true;
  const outputs = SCENE_ACTIONS.start_scan(world.hub, { fields: { preset: '1' } }, { waitMs: 5 });
  assert.deepEqual(await outputs, { done: false, file: '', pages: 0 });
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 0);
  world.scanservjs.release();
  await settle();
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 1);
});

test('a failed scan: the action error, "A scan fails", the state, until the next success', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.scanservjs.scanFailure = 'Error: scanimage: sane_start: Document feeder out of documents';
  const ack = await scan(world, { preset: '1' });
  assert.equal(ack.success, false);
  assert.equal(
    ack.error,
    'Document: Error: scanimage: sane_start: Document feeder out of documents',
  );
  assert.deepEqual(events(world, TRIGGERS.FAILED).at(-1).data, {
    device: scannerIdsOf(world).device,
    scanner: 'test:0',
    preset: 'Document',
    message: 'Error: scanimage: sane_start: Document feeder out of documents',
  });
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Last scan failed');
  assert.equal(scannerState(world, SCANNER_KEYS.SCANNING), 0);
  world.clock.advance(MINUTE);
  assert.equal((await scan(world, { preset: '1' })).success, true);
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Ready');
});

test('a preset off, a feeder the scanner lacks, a pipeline unknown: readable refusals', async (t) => {
  const world = await createWorld({
    config: { ...CONFIG, preset_2_source: 'adf_duplex', preset_1_pipeline: 'Paperless' },
  });
  t.after(() => world.app.stop());
  const off = await scan(world, { preset: '3' });
  assert.match(off.error, /no name in the configuration/);
  const duplex = await scan(world, { preset: '2' });
  assert.equal(duplex.error, 'Photo: this scanner has no duplex feeder');
  assert.equal(
    events(world, TRIGGERS.FAILED).at(-1).data.message,
    'this scanner has no duplex feeder',
  );
  const pipeline = await scan(world, { preset: '1' });
  assert.equal(pipeline.error, 'Document: pipeline "Paperless" unknown to scanservjs');
  assert.equal(world.scanservjs.lastScan, null, 'nothing sent to scanservjs');
  const unknown = await scan(world, { preset: '1', device: 'ext:other:scanner:x' });
  assert.match(unknown.error, /not a scanner of scanservjs/);
});

test('a custom pipeline of scanservjs is used as typed, any case', async (t) => {
  const scanservjs = new FakeScanservjs({ now: createClock().now });
  scanservjs.context.devices[0].settings.pipeline.options.push('Paperless | PDF');
  const world = await createWorld({
    scanservjs,
    config: { ...CONFIG, preset_1_pipeline: 'paperless | pdf' },
  });
  t.after(() => world.app.stop());
  // The fake makes the file only for the pipelines it knows: the request is what counts.
  await scan(world, { preset: '1' });
  assert.equal(scanservjs.lastScan.pipeline, 'Paperless | PDF');
});

test('"Delete the last file": off by default, then the newest file', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const off = await world.fake.sceneAction('delete_last_file', {});
  assert.match(off.error, /disabled in the configuration/);
  await world.fake.configUpdated({ ...CONFIG, allow_delete: true });
  const ack = await world.fake.sceneAction('delete_last_file', {});
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { file: 'scan_2026-10-22 08.00.00.pdf' });
  assert.deepEqual(
    world.scanservjs.files.map((file) => file.name),
    ['scan_2026-10-21 18.30.00.pdf'],
  );
  // A deletion is no scan.
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('a scan made while the integration was stopped is announced after a restart, once', async (t) => {
  const clock = createClock();
  const first = await createWorld({ clock });
  await first.app.stop();
  clock.advance(HOUR);
  first.scanservjs.addFile('while-stopped.pdf');
  const second = await createWorld({
    clock,
    scanservjs: first.scanservjs,
    dataDir: first.dataDir,
  });
  t.after(() => second.app.stop());
  assert.deepEqual(
    second.fake.sceneEvents.map((event) => event.data.file),
    ['while-stopped.pdf'],
  );
  // Another scanservjs: nothing of the previous one is news there.
  await second.app.stop();
  const third = await createWorld({
    clock,
    scanservjs: first.scanservjs,
    dataDir: first.dataDir,
    config: { ...CONFIG, url: 'http://192.0.2.21:8080' },
  });
  t.after(() => third.app.stop());
  assert.equal(third.fake.sceneEvents.length, 0);
});

test(`a folder filled while stopped announces its ${MAX_ANNOUNCED} newest files`, async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  for (let i = 0; i < 15; i += 1) {
    world.clock.advance(MINUTE);
    world.scanservjs.addFile(`f${String(i).padStart(2, '0')}.jpg`, { content: Buffer.from('x') });
  }
  await world.hub.pollNow();
  const files = events(world, TRIGGERS.COMPLETED).map((event) => event.data.file);
  assert.equal(files.length, MAX_ANNOUNCED);
  assert.equal(files[0], 'f05.jpg');
  assert.equal(files.at(-1), 'f14.jpg');
});

test('scanservjs down, then back: the status, the badge, the scanner missing', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  world.scanservjs.down = true;
  await world.hub.pollNow();
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.equal(world.fake.connectionStatus.message.en, 'scanservjs does not answer');
  assert.equal(world.fake.transports.at(-1).transport, 'unreachable');
  const ack = await scan(world, { preset: '1' });
  assert.equal(ack.error, 'scanservjs does not answer');
  world.scanservjs.down = false;
  world.scanservjs.context.devices = [];
  await world.fake.scanRequest();
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.transports.at(-1).transport, 'local');
  assert.equal(scannerState(world, SCANNER_KEYS.STATE), 'Not found');
  const none = await scan(world, { preset: '1' });
  assert.equal(none.error, 'scanservjs sees no scanner.');
});

test('the password refused, an address that is not scanservjs, an address not understood', async (t) => {
  const refused = await createWorld({ config: { ...CONFIG, password: 'wrong' } });
  t.after(() => refused.app.stop());
  assert.equal(
    refused.fake.connectionStatus.message.en,
    'username or password missing or refused by scanservjs',
  );
  const other = await createWorld({ config: { ...CONFIG, url: `${BASE}/elsewhere` } });
  t.after(() => other.app.stop());
  // The fake answers 404 to any other path, like Express.
  assert.equal(other.fake.connectionStatus.message.en, 'no scanservjs at this address');
  const typo = await createWorld({ config: { ...CONFIG, url: 'ftp://nas' } });
  t.after(() => typo.app.stop());
  assert.match(typo.fake.connectionStatus.message.en, /Address not understood/);
  assert.equal(typo.fake.discoveredDevices.length, 0);
});

test('"Test the connection" reports the version, the scanners and the files', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.action('test_connection');
  assert.equal(ack.success, true, ack.error);
  assert.equal(
    ack.data.message.fr,
    'scanservjs : Connecté (scanservjs 3.3.0), 2 scanner(s), 2 fichier(s)',
  );
});

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('a normal reading cycle writes nothing at the info level, never the password', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const all = await captureLogs(t, 'debug', async () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      world.clock.advance(HOUR);
      await world.hub.pollNow();
    }
    await scan(world, { preset: '1' });
  });
  assert.ok(all.some((line) => line.includes('Scan started from Gladys')));
  assert.ok(!all.join('\n').includes(PASSWORD));
  const quiet = await captureLogs(t, 'info', async () => {
    world.clock.advance(2 * HOUR);
    await world.hub.pollNow();
    world.scanservjs.addFile('web.pdf');
    await world.hub.pollNow();
  });
  assert.deepEqual(quiet, []);
  // A failure that repeats is logged once, and its end once.
  const down = await captureLogs(t, 'info', async () => {
    world.scanservjs.down = true;
    await world.hub.pollNow();
    await world.hub.pollNow();
    world.scanservjs.down = false;
    await world.hub.pollNow();
  });
  assert.equal(down.length, 2, down.join('\n'));
});

test('the widget: tiles, the scanner, the last files, one button per preset', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' });
  assert.equal(ack.success, true, ack.error);
  const content = ack.data.content;
  assert.deepEqual(validateWidgetContent(content).errors ?? [], []);
  assert.deepEqual(
    content.components.map((c) => c.type),
    ['value', 'value', 'status', 'button', 'button'],
  );
  assert.equal(content.components[0].value, 1);
  assert.deepEqual(content.components[2].items[0], {
    label: 'test:0',
    value: 'Prêt',
    icon: 'check-circle',
    color: 'success',
  });
  assert.equal(content.components[2].items.length, 3);
  assert.deepEqual(
    content.components.filter((c) => c.type === 'button').map((c) => [c.label, c.action.key]),
    [
      ['Document', 'scan_1'],
      ['Photo', 'scan_2'],
    ],
  );
  world.clock.advance(MINUTE);
  const tap = await world.fake.widgetAction(WIDGET_KEY, 'scan_2', {}, { settings: {} });
  assert.equal(tap.success, true, tap.error);
  assert.match(tap.data.message, /^Scanned: scan_2026-10-22 10\.01\.00\.jpg \(1 p\.\)$/);
  assert.ok(world.fake.widgetRefreshes.includes(WIDGET_KEY));
});

test('the widget without address, and with scanservjs down', async (t) => {
  const empty = await createWorld({ config: { language: 'en' } });
  t.after(() => empty.app.stop());
  const none = await empty.fake.widgetGet(WIDGET_KEY, { settings: {} });
  assert.match(none.data.content.components[0].text, /Enter the address/);
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.scanservjs.down = true;
  await world.hub.pollNow();
  const down = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  const texts = down.data.content.components.filter((c) => c.type === 'text');
  assert.deepEqual(
    texts.map((c) => c.text),
    ['scanservjs antwortet nicht'],
  );
  assert.ok(!down.data.content.components.some((c) => c.type === 'button'));
});

test('the internal timer reads the files at the configured interval', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const world = await createWorld({ timers: true, config: { ...CONFIG, poll_interval: '30' } });
  t.after(() => world.app.stop());
  const reads = () => world.scanservjs.calls.filter((call) => call === 'GET /api/v1/files').length;
  const before = reads();
  world.scanservjs.addFile('web.pdf');
  t.mock.timers.tick(30_000);
  await settle();
  assert.equal(reads(), before + 1);
  assert.equal(events(world, TRIGGERS.COMPLETED).length, 1);
});
