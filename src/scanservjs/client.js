// -----------------------------------------------------------------------------
// scanservjs client: the REST API its web interface uses, read in the code of
// scanservjs 3.3.0 (app/server/express-configurer.js) and checked against a
// real 3.3.0 driving the "test" backend of SANE.
//
//   GET    /api/v1/context        scanners (id, name, SANE options: --mode,
//                                 --resolution, --source…), pipelines, version.
//                                 Cached by scanservjs (devices.json); without
//                                 a scanner, every call runs `scanimage -L`
//                                 again (seconds): read rarely.
//   GET    /api/v1/files          the files of its output folder, newest first
//                                 ({ name, extension, lastModified, size }).
//   GET    /api/v1/files/<name>   one file (to count its pages).
//   POST   /api/v1/scan           { params: { deviceId, resolution, mode,
//                                 source }, pipeline, batch, index: 1 }.
//                                 Answers when the scan is done: { file }.
//   DELETE /api/v1/files/<name>   { deleted: true|false }, always HTTP 200.
//
// Errors: HTTP 500 { message } (a device or pipeline unknown, a scanimage
// failure: jam, no paper, scanner off). Authentication: HTTP Basic when users
// are declared in its config.local.js, 401 otherwise.
//
// Redirects are not followed: the password would go wherever they point.
// -----------------------------------------------------------------------------

import { pageCounterFor } from './pages.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // credentials missing or refused
  NOT_SCANSERVJS: 'not_scanservjs', // something answers, not scanservjs
  REDIRECT: 'redirect', // the address redirects (usually HTTP to HTTPS)
  SCAN: 'scan', // scanservjs refused or failed the scan, its message in `detail`
  HTTP: 'http', // any other error, its message in `detail`
});

export class ScanservjsError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, detail }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'ScanservjsError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

export const MAX_BODY_BYTES = 8 * 1024 * 1024;
// A file is read to count its pages up to this size (streamed, not kept).
export const MAX_FILE_BYTES = 500 * 1024 * 1024;

export const TIMEOUTS = {
  default: 15_000,
  // Without a cached scanner, scanservjs runs `scanimage -L` (network scanners
  // included) before it answers.
  context: 90_000,
  // A long batch of the document feeder at 600 dpi.
  scan: 30 * 60_000,
  file: 120_000,
};

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory scanservjs
 * (test/helpers/fakeScanservjs.js). With `sink`, the body is handed over
 * chunk by chunk and not kept.
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs, sink, maxBytes = MAX_BODY_BYTES } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs ?? TIMEOUTS.default),
  });
  // Counted while read: a chunked answer has no content-length.
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.length;
    if (size > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new Error('Response too large');
    }
    if (sink && response.status === 200) {
      sink(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }
  return { status: response.status, body: Buffer.concat(chunks).toString('utf8') };
}

// --- Parsing ---------------------------------------------------------------------

const text = (value) => (typeof value === 'string' ? value : '');

/** A message for a person: one line, 200 characters at most. */
export function cleanMessage(value) {
  const line = text(value)
    .replace(/\s*\n\s*/g, ': ')
    .replace(/\/\/[^/\s:@]+:[^@\s]+@/g, '//***@')
    .trim();
  return line.length > 200 ? `${line.slice(0, 199)}…` : line;
}

const stringsOf = (list) =>
  Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item) : [];

/** The SANE resolutions of a scanner: its list, or its range. */
function resolutionsOf(feature) {
  if (!feature || typeof feature !== 'object') {
    return null;
  }
  const options = Array.isArray(feature.options)
    ? feature.options.map(Number).filter((value) => Number.isFinite(value) && value > 0)
    : [];
  const limits = Array.isArray(feature.limits) ? feature.limits.map(Number) : [];
  return {
    options,
    min: Number.isFinite(limits[0]) ? limits[0] : null,
    max: Number.isFinite(limits[1]) ? limits[1] : null,
  };
}

/** One scanner of /api/v1/context, reduced to what a scan needs. */
export function normalizeScanner(device) {
  if (!device || typeof device !== 'object' || !text(device.id)) {
    return null;
  }
  const features = device.features && typeof device.features === 'object' ? device.features : {};
  const settings = device.settings && typeof device.settings === 'object' ? device.settings : {};
  return {
    id: device.id,
    name: (text(device.name) || device.id).slice(0, 100),
    modes: stringsOf(features['--mode']?.options),
    defaultMode: text(features['--mode']?.default),
    sources: stringsOf(features['--source']?.options),
    defaultSource: text(features['--source']?.default),
    resolutions: resolutionsOf(features['--resolution']),
    pipelines: stringsOf(settings.pipeline?.options),
    batchModes: stringsOf(settings.batchMode?.options),
  };
}

/** /api/v1/context: the scanners and the version; null when it is not one. */
export function normalizeContext(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.devices)) {
    return null;
  }
  return {
    version: text(data.version),
    scanners: data.devices.map(normalizeScanner).filter(Boolean),
  };
}

/** One file of /api/v1/files (or of a scan answer); null when unusable. */
export function normalizeFile(file) {
  if (!file || typeof file !== 'object' || !text(file.name) || file.isDirectory === true) {
    return null;
  }
  const time = Date.parse(text(file.lastModified));
  if (!Number.isFinite(time)) {
    return null;
  }
  const name = file.name;
  const dot = name.lastIndexOf('.');
  return {
    name,
    extension: dot > 0 ? name.slice(dot + 1).toLowerCase() : '',
    time,
    size: Number.isFinite(file.size) && file.size >= 0 ? file.size : 0,
  };
}

/** The message of a scanservjs error body, `{ message }`; '' otherwise. */
function errorMessage(body) {
  try {
    return cleanMessage(JSON.parse(body)?.message);
  } catch {
    return '';
  }
}

// --- Client ------------------------------------------------------------------------

export class ScanservjsClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} [options.username] empty without basic authentication
   * @param {string} [options.password]
   * @param {typeof httpRequest} [options.request] test seam
   */
  constructor({ url, username = '', password = '', request = httpRequest }) {
    this.url = url;
    this.authorization = username
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : null;
    this.request = request;
  }

  async send(path, { method = 'GET', body, timeoutMs, sink, maxBytes } = {}) {
    try {
      return await this.request(`${this.url}${path}`, {
        method,
        headers: {
          accept: 'application/json',
          ...(body ? { 'content-type': 'application/json' } : {}),
          ...(this.authorization ? { authorization: this.authorization } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        timeoutMs: timeoutMs ?? TIMEOUTS.default,
        sink,
        maxBytes,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new ScanservjsError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      throw new ScanservjsError(ERROR_KINDS.UNREACHABLE, code ?? err.name ?? err.message);
    }
  }

  /** One request; the answer of a 2xx, or a ScanservjsError. */
  async call(path, options = {}) {
    const response = await this.send(path, options);
    const { status } = response;
    if (status >= 300 && status < 400) {
      throw new ScanservjsError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 401 || status === 403) {
      throw new ScanservjsError(ERROR_KINDS.AUTH, `Refused (HTTP ${status})`, { status });
    }
    if (status === 404 || status === 405) {
      throw new ScanservjsError(ERROR_KINDS.NOT_SCANSERVJS, `Not found (HTTP ${status})`, {
        status,
      });
    }
    if (status < 200 || status >= 300) {
      const detail = errorMessage(response.body);
      throw new ScanservjsError(
        status === 500 && detail ? ERROR_KINDS.SCAN : ERROR_KINDS.HTTP,
        `HTTP ${status}${detail ? `: ${detail}` : ''}`,
        { status, detail },
      );
    }
    return response;
  }

  async json(path, options) {
    const response = await this.call(path, options);
    try {
      return JSON.parse(response.body);
    } catch {
      throw new ScanservjsError(ERROR_KINDS.NOT_SCANSERVJS, 'The answer is not JSON');
    }
  }

  /** The scanners and the version of scanservjs. */
  async context() {
    const context = normalizeContext(
      await this.json('/api/v1/context', { timeoutMs: TIMEOUTS.context }),
    );
    if (!context) {
      throw new ScanservjsError(
        ERROR_KINDS.NOT_SCANSERVJS,
        'The answer is not a scanservjs context',
      );
    }
    return context;
  }

  /** The files of the output folder, newest first. */
  async files() {
    const data = await this.json('/api/v1/files');
    if (!Array.isArray(data)) {
      throw new ScanservjsError(ERROR_KINDS.NOT_SCANSERVJS, 'The answer is not a file list');
    }
    return data
      .map(normalizeFile)
      .filter(Boolean)
      .sort((a, b) => b.time - a.time || b.name.localeCompare(a.name));
  }

  /**
   * Scan, and wait for the file. `request` is the body of POST /api/v1/scan.
   * @returns {Promise<{ name, extension, time, size }>}
   */
  async scan(request) {
    const data = await this.json('/api/v1/scan', {
      method: 'POST',
      body: request,
      timeoutMs: TIMEOUTS.scan,
    });
    const file = normalizeFile(data?.file);
    if (!file) {
      throw new ScanservjsError(ERROR_KINDS.NOT_SCANSERVJS, 'The scan answer holds no file');
    }
    return file;
  }

  /** The pages of a file: read for a PDF or a ZIP, 1 otherwise, 0 if unknown. */
  async pages(file) {
    const counter = pageCounterFor(file.extension);
    if (!counter) {
      return 1;
    }
    if (file.size > MAX_FILE_BYTES) {
      return 0;
    }
    await this.call(`/api/v1/files/${encodeURIComponent(file.name)}`, {
      timeoutMs: TIMEOUTS.file,
      maxBytes: MAX_FILE_BYTES,
      sink: (chunk) => counter.push(chunk),
    });
    return counter.finish();
  }

  /** Delete a file of the output folder; whether scanservjs deleted it. */
  async deleteFile(name) {
    const data = await this.json(`/api/v1/files/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
    return data?.deleted === true;
  }
}
