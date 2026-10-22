// -----------------------------------------------------------------------------
// An in-memory scanservjs behind the request seam of src/scanservjs/client.js,
// answering like the real 3.3.0 (test/fixtures/scanservjs, read from one
// driving the "test" backend of SANE): the context of its "test:0" scanner,
// the file list newest first, POST /api/v1/scan answering once the file is
// made, its HTTP 500 { message } errors, DELETE answering 200 { deleted }.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const BASE = 'http://192.0.2.20:8080';
export const USERNAME = 'gladys';
export const PASSWORD = 'scan-secret-42';

const fixture = (name) => new URL(`../fixtures/scanservjs/${name}`, import.meta.url);
export const readFixture = (name) => readFileSync(fixture(name));
export const CONTEXT = JSON.parse(readFixture('context.json'));

const json = (status, data) => ({ status, body: JSON.stringify(data) });

export class FakeScanservjs {
  /**
   * @param {object} options
   * @param {() => number} options.now the clock of the test
   * @param {boolean} [options.auth] basic authentication on
   */
  constructor({ now, auth = true }) {
    this.now = now;
    this.auth = auth;
    this.context = structuredClone(CONTEXT);
    /** @type {Array<{ name, time, content: Buffer }>} */
    this.files = [];
    this.down = false;
    this.calls = [];
    /** The next scan fails with this message (HTTP 500), when set. */
    this.scanFailure = null;
    /** The next scan waits for `release()`, when set. */
    this.holdScans = false;
    this.held = [];
    this.lastScan = null;
    this.request = this.request.bind(this);
  }

  /** A file made by scanservjs (a scan of its web interface), `time` in ms. */
  addFile(name, { time = this.now(), content = readFixture('flatbed-1-page.pdf') } = {}) {
    this.files.push({ name, time, content });
  }

  /** The name scanservjs gives a scan, from its time (UTC in its container). */
  nameFor(time, extension) {
    const iso = new Date(time).toISOString();
    return `scan_${iso.slice(0, 10)} ${iso.slice(11, 19).replace(/:/g, '.')}.${extension}`;
  }

  release() {
    for (const resolve of this.held.splice(0)) {
      resolve();
    }
  }

  fileInfo(file) {
    const dot = file.name.lastIndexOf('.');
    return {
      fullname: `data/output/${file.name}`,
      extension: file.name.slice(dot),
      lastModified: new Date(file.time).toISOString(),
      size: file.content.length,
      sizeString: `${Math.round(file.content.length / 1024)} KB`,
      isDirectory: false,
      name: file.name,
      path: 'data/output',
    };
  }

  async scan(body) {
    this.lastScan = body;
    if (this.holdScans) {
      await new Promise((resolve) => this.held.push(resolve));
    }
    if (this.scanFailure) {
      const message = this.scanFailure;
      this.scanFailure = null;
      return json(500, { message, code: -1 });
    }
    const device = this.context.devices.find((item) => item.id === body.params?.deviceId);
    if (!device) {
      return json(500, { message: `Device ${body.params?.deviceId} not found` });
    }
    const pipelines = device.settings.pipeline.options;
    if (!pipelines.includes(body.pipeline)) {
      return json(500, {
        message: `Invalid pipeline: '${body.pipeline}' not in '${pipelines}'`,
        code: -1,
      });
    }
    const feeder = /Feeder/.test(body.params.source ?? '') && body.batch === 'auto';
    const pdf = body.pipeline.includes('PDF');
    const extension = pdf
      ? 'pdf'
      : feeder
        ? 'zip'
        : body.pipeline.startsWith('PNG')
          ? 'png'
          : 'jpg';
    const content = pdf
      ? readFixture(feeder ? 'adf-10-pages.pdf' : 'flatbed-1-page.pdf')
      : feeder
        ? readFixture('adf-10-pages.zip')
        : Buffer.from('fake image');
    const time = this.now();
    const file = { name: this.nameFor(time, extension), time, content };
    this.files.push(file);
    return json(200, { file: this.fileInfo(file) });
  }

  /** The request seam (src/scanservjs/client.js). */
  async request(url, { method = 'GET', headers = {}, body, sink } = {}) {
    const { pathname } = new URL(url);
    const path = decodeURIComponent(pathname);
    this.calls.push(`${method} ${path}`);
    if (this.down) {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ECONNREFUSED' };
      throw err;
    }
    const expected = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64')}`;
    if (this.auth && headers.authorization !== expected) {
      return { status: 401, body: 'Unauthorized' };
    }
    if (method === 'GET' && path === '/api/v1/context') {
      return json(200, this.context);
    }
    if (method === 'GET' && path === '/api/v1/files') {
      const files = [...this.files].sort((a, b) => b.time - a.time);
      return json(
        200,
        files.map((file) => this.fileInfo(file)),
      );
    }
    if (method === 'POST' && path === '/api/v1/scan') {
      return this.scan(JSON.parse(body));
    }
    const match = /^\/api\/v1\/files\/(.+)$/.exec(path);
    if (match && method === 'GET') {
      const file = this.files.find((item) => item.name === match[1]);
      if (!file) {
        return { status: 404, body: '' };
      }
      sink?.(file.content);
      return { status: 200, body: '' };
    }
    if (match && method === 'DELETE') {
      const before = this.files.length;
      this.files = this.files.filter((item) => item.name !== match[1]);
      return json(200, {
        fullname: `data/output/${match[1]}`,
        name: match[1],
        path: 'data/output',
        deleted: this.files.length < before,
      });
    }
    // Express: "Cannot GET /…".
    return { status: 404, body: `<pre>Cannot ${method} ${path}</pre>` };
  }
}
