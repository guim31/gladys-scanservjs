// -----------------------------------------------------------------------------
// From a preset of the configuration to the body of POST /api/v1/scan, for one
// scanner: the SANE names differ from a backend to another ("Color", "Colour",
// "24bit Color"; "ADF", "Automatic Document Feeder", "ADF Duplex"), so the
// preset says what it wants and this module finds the scanner's word for it.
// What the scanner cannot do is refused with a readable reason, never sent:
// scanservjs would answer an HTTP 500.
// -----------------------------------------------------------------------------

export class PresetError extends Error {
  /**
   * @param {string} reason a key of PRESET_TEXT (src/texts.js)
   * @param {object} [values] what the message quotes
   */
  constructor(reason, values = {}) {
    super(`Preset not applicable: ${reason}`);
    this.name = 'PresetError';
    this.reason = reason;
    this.values = values;
  }
}

const MODE_PATTERNS = {
  color: [/^colou?r$/i, /colou?r/i],
  gray: [/^gr[ae]y(scale)?$/i, /gr[ae]y/i],
  lineart: [/^lineart$/i, /lineart|binary|black ?& ?white|halftone/i],
};

// When the scanner has no line art, grey is the closest.
const MODE_FALLBACK = { lineart: 'gray' };

const SOURCE_PATTERNS = {
  flatbed: [/flatbed|platen|normal/i],
  adf: [/^adf$/i, /^adf front$/i, /^automatic document feeder$/i, /(adf|feeder)(?!.*duplex)/i],
  adf_duplex: [/duplex/i],
};

/** The first option matching the patterns, in their order; null if none. */
function find(options, patterns) {
  for (const pattern of patterns) {
    const found = options.find((option) => pattern.test(option));
    if (found) {
      return found;
    }
  }
  return null;
}

/** The scanner's mode for `mode`; undefined to keep its default. */
export function modeFor(scanner, mode) {
  if (scanner.modes.length === 0) {
    return undefined;
  }
  let wanted = mode;
  while (wanted) {
    const found = find(scanner.modes, MODE_PATTERNS[wanted]);
    if (found) {
      return found;
    }
    wanted = MODE_FALLBACK[wanted];
  }
  return undefined;
}

/** The scanner's source for `source`; undefined to keep its default. */
export function sourceFor(scanner, source) {
  if (source === 'default') {
    return undefined;
  }
  const found = find(scanner.sources, SOURCE_PATTERNS[source]);
  if (found) {
    return found;
  }
  if (source === 'flatbed') {
    // A feeder-only scanner: its default source is the only one.
    return undefined;
  }
  throw new PresetError(source === 'adf_duplex' ? 'noDuplex' : 'noFeeder');
}

/** The closest resolution the scanner offers; undefined without the option. */
export function resolutionFor(scanner, resolution) {
  const range = scanner.resolutions;
  if (!range) {
    return undefined;
  }
  // The "test" backend lists fractions (1.17, 2.34…): whole dpi only.
  const options = range.options.filter((value) => Number.isInteger(value));
  if (options.length > 0) {
    return options.reduce((best, value) =>
      Math.abs(value - resolution) < Math.abs(best - resolution) ? value : best,
    );
  }
  let value = resolution;
  if (range.min !== null) {
    value = Math.max(value, range.min);
  }
  if (range.max !== null) {
    value = Math.min(value, range.max);
  }
  return value;
}

// Per format of the presets: the default pipeline of scanservjs, then what
// else may do, best first (a configuration of scanservjs with its own
// pipelines: "Paperless (PDF)").
const FORMAT_PIPELINES = {
  pdf: ['PDF (JPG | @:pipeline.high-quality)', /^PDF/i, /^(?!.*ocr).*PDF/i],
  pdf_ocr: ['@:pipeline.ocr | PDF (JPG | @:pipeline.high-quality)', /ocr.*PDF/i],
  jpg: ['JPG | @:pipeline.high-quality', /^JPE?G/i, /JPE?G/i],
  png: ['PNG', /^PNG/i, /PNG/i],
};

/** The pipeline of a preset: the one typed, or the best of its format. */
export function pipelineFor(scanner, preset) {
  if (preset.pipeline) {
    const typed = scanner.pipelines.find(
      (pipeline) => pipeline.toLowerCase() === preset.pipeline.toLowerCase(),
    );
    if (!typed) {
      throw new PresetError('unknownPipeline', { pipeline: preset.pipeline });
    }
    return typed;
  }
  const [best, ...patterns] = FORMAT_PIPELINES[preset.format];
  const found = scanner.pipelines.includes(best) ? best : find(scanner.pipelines, patterns);
  if (!found) {
    throw new PresetError('noPipeline', { format: preset.format.toUpperCase() });
  }
  return found;
}

/** The scanservjs words of its interface ("@:pipeline.high-quality"), readable. */
export function pipelineLabel(pipeline) {
  return pipeline.replace(/@:pipeline\.([a-z-]+)/g, (_, key) => key.replace(/-/g, ' '));
}

const FEEDER = /adf|feeder|duplex/i;

/**
 * The body of POST /api/v1/scan for this preset on this scanner. A feeder
 * scans every sheet it holds ("auto" batch); a flatbed, one page.
 */
export function scanRequest(scanner, preset) {
  const source = sourceFor(scanner, preset.source);
  const params = { deviceId: scanner.id };
  const resolution = resolutionFor(scanner, preset.resolution);
  if (resolution !== undefined) {
    params.resolution = resolution;
  }
  const mode = modeFor(scanner, preset.mode);
  if (mode !== undefined) {
    params.mode = mode;
  }
  if (source !== undefined) {
    params.source = source;
  }
  const effectiveSource = source ?? scanner.defaultSource;
  const feeder = FEEDER.test(effectiveSource) && scanner.batchModes.includes('auto');
  return {
    params,
    pipeline: pipelineFor(scanner, preset),
    batch: feeder ? 'auto' : 'none',
    index: 1,
  };
}
