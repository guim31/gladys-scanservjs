// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of scanservjs 3.3.0 (test/fixtures/scanservjs: its "test" backend,
// two scanners; its files, a PDF of 10 pages), idle and while a scan from
// Gladys runs, in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createClock, createWorld } from './helpers/world.js';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

async function discover(language, scanning) {
  const world = await createWorld({
    clock: createClock(),
    config: {
      url: 'http://192.0.2.20:8080',
      username: 'gladys',
      password: 'scan-secret-42',
      language,
    },
  });
  // Every device added: its states must be accepted too.
  for (const device of world.fake.discoveredDevices) {
    await world.fake.deviceCreated(device);
  }
  if (scanning) {
    world.scanservjs.holdScans = true;
    await world.hub.startScan({ preset: '1' });
    world.scanservjs.release();
  }
  await world.app.stop();
  return { devices: world.fake.discoveredDevices, states: world.fake.states };
}

const scenarios = [
  { label: 'idle, English names', language: 'en', scanning: false },
  { label: 'scanning, French names', language: 'fr', scanning: true },
  { label: 'idle, German names', language: 'de', scanning: false },
  { label: 'scanning, Spanish names', language: 'es', scanning: true },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const { devices, states } = await discover(scenario.language, scenario.scanning);
    assert.equal(devices.length, 3, 'the two scanners of the fixture, the files');
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }

    // Every state lands on a declared feature, within its bounds.
    const features = new Map(
      devices.flatMap((device) => device.features).map((f) => [f.external_id, f]),
    );
    assert.ok(states.length > 0);
    for (const state of states) {
      const feature = features.get(state.device_feature_external_id);
      assert.ok(feature, `${state.device_feature_external_id}: unknown feature`);
      if (feature.type === 'text') {
        assert.ok(typeof state.text === 'string' && state.text.length > 0, `${feature.name}: text`);
      } else {
        assert.ok(
          state.state >= feature.min && state.state <= feature.max,
          `${feature.name}: ${state.state} out of [${feature.min}, ${feature.max}]`,
        );
      }
    }
  });
}
