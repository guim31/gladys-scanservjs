// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One scanservjs instance, reached with the user and password of its basic
// authentication when it has one, and three scan presets (name, resolution,
// colour mode, format, source, optional scanservjs pipeline). A preset with an
// empty name is off: no widget button, refused by the scene action.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// How often the files of scanservjs are read, in seconds.
export const POLL_INTERVALS = ['30', '60', '300'];

export const PRESET_COUNT = 3;
export const RESOLUTIONS = ['75', '100', '150', '200', '300', '600'];
export const MODES = ['color', 'gray', 'lineart'];
export const FORMATS = ['pdf', 'pdf_ocr', 'jpg', 'png'];
export const SOURCES = ['default', 'flatbed', 'adf', 'adf_duplex'];

export const DEFAULT_PORT = 8080;

export const DEFAULT_CONFIG = {
  url: '',
  username: '',
  password: '',
  preset_1_name: 'Document',
  preset_1_resolution: '300',
  preset_1_mode: 'gray',
  preset_1_format: 'pdf',
  preset_1_source: 'default',
  preset_1_pipeline: '',
  preset_2_name: 'Photo',
  preset_2_resolution: '300',
  preset_2_mode: 'color',
  preset_2_format: 'jpg',
  preset_2_source: 'default',
  preset_2_pipeline: '',
  preset_3_name: '',
  preset_3_resolution: '150',
  preset_3_mode: 'gray',
  preset_3_format: 'pdf',
  preset_3_source: 'adf',
  preset_3_pipeline: '',
  poll_interval: '60',
  allow_delete: false,
  language: 'fr',
};

// The pages of the web interface (#/scan, #/files) and the API itself, when
// the address is copied from the browser.
const INTERFACE_PATH = /\/(api(\/v1)?|api-docs|index\.html)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 8080 then), or a URL copied from the browser
 * (`http://192.0.2.10:8080/#/scan`). HTTP by default for a bare host. A path is
 * kept (a reverse proxy sub-path), the interface pages dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const bare = !/^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(bare ? `http://${text}` : text);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  if (bare && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

const choice = (value, allowed, fallback) =>
  allowed.includes(String(value)) ? String(value) : fallback;

/** The presets of the configuration, the ones turned off included. */
function presetsOf(source) {
  const presets = [];
  for (let index = 1; index <= PRESET_COUNT; index += 1) {
    const key = (field) => `preset_${index}_${field}`;
    const text = (field) =>
      typeof source[key(field)] === 'string'
        ? source[key(field)].trim()
        : DEFAULT_CONFIG[key(field)];
    presets.push({
      index,
      name: text('name').slice(0, 24),
      resolution: Number(
        choice(source[key('resolution')], RESOLUTIONS, DEFAULT_CONFIG[key('resolution')]),
      ),
      mode: choice(source[key('mode')], MODES, DEFAULT_CONFIG[key('mode')]),
      format: choice(source[key('format')], FORMATS, DEFAULT_CONFIG[key('format')]),
      source: choice(source[key('source')], SOURCES, DEFAULT_CONFIG[key('source')]),
      pipeline: text('pipeline'),
    });
  }
  return presets;
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const typed = text('url');
  return {
    url: typed ? parseServerUrl(typed) : null,
    urlTyped: Boolean(typed),
    username: text('username'),
    // Never trimmed: a password may end with a space.
    password: typeof source.password === 'string' ? source.password : '',
    presets: presetsOf(source),
    pollIntervalMs:
      Number(choice(source.poll_interval, POLL_INTERVALS, DEFAULT_CONFIG.poll_interval)) * 1000,
    allowDelete: source.allow_delete === true || source.allow_delete === 'true',
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
