// -----------------------------------------------------------------------------
// The configuration: the address typed (bare host, copied from the browser,
// behind a proxy), the presets and their defaults.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address: bare host on port 8080, copied from the browser, behind a proxy', () => {
  assert.equal(parseServerUrl('192.0.2.20'), 'http://192.0.2.20:8080');
  assert.equal(parseServerUrl(' scanner.lan:9000 '), 'http://scanner.lan:9000');
  assert.equal(parseServerUrl('http://192.0.2.20:8080/#/scan'), 'http://192.0.2.20:8080');
  assert.equal(
    parseServerUrl('https://home.example/scan/api/v1/context'),
    'https://home.example/scan',
  );
  assert.equal(parseServerUrl('http://192.0.2.20:8080/index.html'), 'http://192.0.2.20:8080');
  assert.equal(parseServerUrl('http://user:pass@192.0.2.20'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.20'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(undefined), null);
});

test('the defaults: two presets on, the third off, delete off, French names', () => {
  const config = normalizeConfig({});
  assert.deepEqual(
    config.presets.map((p) => [p.name, p.resolution, p.mode, p.format, p.source]),
    [
      ['Document', 300, 'gray', 'pdf', 'default'],
      ['Photo', 300, 'color', 'jpg', 'default'],
      ['', 150, 'gray', 'pdf', 'adf'],
    ],
  );
  assert.equal(config.allowDelete, false);
  assert.equal(config.language, 'fr');
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.urlTyped, false);
});

test('the values typed: trimmed names, unknown choices back to the default', () => {
  const config = normalizeConfig({
    preset_1_name: '  Factures  ',
    preset_1_resolution: '1200',
    preset_1_mode: 'sepia',
    preset_2_name: '',
    preset_3_name: 'A very long name for a widget button',
    preset_3_pipeline: ' Paperless ',
    poll_interval: '5',
    allow_delete: 'true',
    password: ' secret ',
    language: 'it',
  });
  assert.equal(config.presets[0].name, 'Factures');
  assert.equal(config.presets[0].resolution, 300);
  assert.equal(config.presets[0].mode, 'gray');
  assert.equal(config.presets[1].name, '');
  assert.equal(config.presets[2].name.length, 24);
  assert.equal(config.presets[2].pipeline, 'Paperless');
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(config.allowDelete, true);
  assert.equal(config.password, ' secret ');
  assert.equal(config.language, 'fr');
});
