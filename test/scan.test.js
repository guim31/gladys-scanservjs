// -----------------------------------------------------------------------------
// From a preset to the request of POST /api/v1/scan: the SANE words of the
// "test" backend (the real context of test/fixtures) and of other backends
// (airscan, a Fujitsu feeder-only scanner, as their scanimage --help names
// them), the resolutions, the pipelines.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeScanner } from '../src/scanservjs/client.js';
import {
  PresetError,
  modeFor,
  pipelineFor,
  pipelineLabel,
  resolutionFor,
  scanRequest,
  sourceFor,
} from '../src/scan.js';
import { CONTEXT } from './helpers/fakeScanservjs.js';

const TEST = normalizeScanner(CONTEXT.devices[0]);
const preset = (extra) => ({
  index: 1,
  name: 'Document',
  resolution: 300,
  mode: 'gray',
  format: 'pdf',
  source: 'default',
  pipeline: '',
  ...extra,
});

const scanner = (extra) => ({
  ...TEST,
  modes: [],
  sources: [],
  defaultSource: '',
  resolutions: null,
  ...extra,
});

test('the real "test" scanner: its modes, sources, whole resolutions, pipelines', () => {
  assert.deepEqual(TEST.modes, ['Gray', 'Color']);
  assert.deepEqual(TEST.sources, ['Flatbed', 'Automatic Document Feeder']);
  assert.equal(resolutionFor(TEST, 300), 300);
  assert.equal(resolutionFor(TEST, 100), 75);
  assert.equal(resolutionFor(TEST, 200), 150);
  assert.equal(TEST.pipelines.length, 13);
  assert.deepEqual(scanRequest(TEST, preset({ source: 'flatbed', mode: 'color' })), {
    params: { deviceId: 'test:0', resolution: 300, mode: 'Color', source: 'Flatbed' },
    pipeline: 'PDF (JPG | @:pipeline.high-quality)',
    batch: 'none',
    index: 1,
  });
});

test('the words of other backends', () => {
  const airscan = scanner({
    modes: ['Color', 'Gray'],
    sources: ['Flatbed', 'ADF', 'ADF Duplex'],
    resolutions: { options: [75, 100, 150, 200, 300, 600], min: 75, max: 600 },
  });
  assert.equal(modeFor(airscan, 'lineart'), 'Gray');
  assert.equal(sourceFor(airscan, 'adf'), 'ADF');
  assert.equal(sourceFor(airscan, 'adf_duplex'), 'ADF Duplex');
  const fujitsu = scanner({
    modes: ['Lineart', 'Halftone', 'Gray', 'Color'],
    sources: ['ADF Front', 'ADF Back', 'ADF Duplex'],
    defaultSource: 'ADF Front',
    batchModes: ['none', 'manual', 'auto'],
    resolutions: { options: [], min: 50, max: 600 },
  });
  assert.equal(modeFor(fujitsu, 'lineart'), 'Lineart');
  assert.equal(sourceFor(fujitsu, 'adf'), 'ADF Front');
  // A feeder-only scanner: "flatbed" keeps its default, and a feeder scans all.
  assert.equal(sourceFor(fujitsu, 'flatbed'), undefined);
  assert.equal(scanRequest(fujitsu, preset({ source: 'flatbed' })).batch, 'auto');
  assert.equal(resolutionFor(fujitsu, 1200), 600);
  assert.equal(resolutionFor(fujitsu, 300), 300);
  const hp = scanner({ modes: ['24bit Color', 'Gray'], sources: ['Flatbed'] });
  assert.equal(modeFor(hp, 'color'), '24bit Color');
  assert.throws(
    () => sourceFor(hp, 'adf'),
    (err) => err instanceof PresetError && err.reason === 'noFeeder',
  );
  assert.equal(modeFor(scanner({}), 'color'), undefined);
  assert.equal(resolutionFor(scanner({}), 300), undefined);
  assert.deepEqual(scanRequest(scanner({}), preset()).params, { deviceId: 'test:0' });
});

test('the pipeline of a format, or the one typed', () => {
  assert.equal(
    pipelineFor(TEST, preset({ format: 'pdf_ocr' })),
    '@:pipeline.ocr | PDF (JPG | @:pipeline.high-quality)',
  );
  assert.equal(pipelineFor(TEST, preset({ format: 'jpg' })), 'JPG | @:pipeline.high-quality');
  assert.equal(pipelineFor(TEST, preset({ format: 'png' })), 'PNG');
  assert.equal(
    pipelineFor(TEST, preset({ pipeline: 'pdf (tif | @:pipeline.lzw-compressed)' })),
    'PDF (TIF | @:pipeline.lzw-compressed)',
  );
  // A configuration of scanservjs with its own pipelines only.
  const custom = { ...TEST, pipelines: ['Paperless (PDF)', 'Photos'] };
  assert.equal(pipelineFor(custom, preset()), 'Paperless (PDF)');
  assert.throws(
    () => pipelineFor(custom, preset({ format: 'png' })),
    (err) => err.reason === 'noPipeline' && err.values.format === 'PNG',
  );
  assert.equal(
    pipelineLabel('@:pipeline.ocr | PDF (JPG | @:pipeline.high-quality)'),
    'ocr | PDF (JPG | high quality)',
  );
});
