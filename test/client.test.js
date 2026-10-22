// -----------------------------------------------------------------------------
// The client: its answers parsed from the real scanservjs 3.3.0
// (test/fixtures/scanservjs), its errors, and the page counts of real files,
// read in chunks of any size.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ERROR_KINDS,
  ScanservjsClient,
  normalizeContext,
  normalizeFile,
} from '../src/scanservjs/client.js';
import { PdfPageCounter, ZipEntryCounter, pageCounterFor } from '../src/scanservjs/pages.js';
import { CONTEXT, readFixture } from './helpers/fakeScanservjs.js';

const count = (Counter, buffer, size) => {
  const counter = new Counter();
  for (let at = 0; at < buffer.length; at += size) {
    counter.push(buffer.subarray(at, at + size));
  }
  return counter.finish();
};

test('the real context: two scanners of the "test" backend, version 3.3.0', () => {
  const context = normalizeContext(CONTEXT);
  assert.equal(context.version, '3.3.0');
  assert.deepEqual(
    context.scanners.map((s) => s.id),
    ['test:0', 'test:1'],
  );
  assert.equal(normalizeContext({ message: 'nope' }), null);
});

test('the real file list and scan answer', () => {
  const files = JSON.parse(readFixture('files.json')).map(normalizeFile);
  assert.deepEqual(files[0], {
    name: 'scan_2026-10-22 21.06.14.pdf',
    extension: 'pdf',
    time: Date.parse('2026-10-22T21:06:14.418Z'),
    size: 78077,
  });
  assert.equal(normalizeFile(JSON.parse(readFixture('scan-pdf.json')).file).size, 8443);
  assert.equal(normalizeFile({ name: 'x', lastModified: 'no' }), null);
  assert.equal(normalizeFile({ name: 'dir', isDirectory: true, lastModified: '2026-01-01' }), null);
});

test('the pages of real files, whatever the chunks', () => {
  for (const size of [1, 7, 64, 4096, 1 << 20]) {
    assert.equal(count(PdfPageCounter, readFixture('flatbed-1-page.pdf'), size), 1, `${size}`);
    assert.equal(count(PdfPageCounter, readFixture('adf-10-pages.pdf'), size), 10, `${size}`);
    assert.equal(count(ZipEntryCounter, readFixture('adf-10-pages.zip'), size), 10, `${size}`);
  }
  // "/Pages" is no page; compressed objects: the /Count of the page tree.
  assert.equal(count(PdfPageCounter, Buffer.from('<< /Type /Pages /Count 3 >> /Type/Page'), 5), 1);
  assert.equal(count(PdfPageCounter, Buffer.from('<< /Type /Pages /Count 7 >>'), 3), 7);
  assert.equal(count(PdfPageCounter, Buffer.from('not a pdf'), 3), 0);
  assert.equal(count(ZipEntryCounter, Buffer.from('not a zip'), 3), 0);
  assert.equal(pageCounterFor('.PDF') instanceof PdfPageCounter, true);
  assert.equal(pageCounterFor('jpg'), null);
});

test('the errors: refused, not scanservjs, scan failed, unreachable, redirect', async () => {
  const answer =
    (status, body = '') =>
    async () => ({ status, body });
  const client = (request) => new ScanservjsClient({ url: 'http://192.0.2.20:8080', request });
  await assert.rejects(client(answer(401)).files(), { kind: ERROR_KINDS.AUTH });
  await assert.rejects(client(answer(404, 'Cannot GET')).files(), {
    kind: ERROR_KINDS.NOT_SCANSERVJS,
  });
  await assert.rejects(client(answer(200, '<html>')).files(), { kind: ERROR_KINDS.NOT_SCANSERVJS });
  await assert.rejects(client(answer(200, '{}')).context(), { kind: ERROR_KINDS.NOT_SCANSERVJS });
  await assert.rejects(client(answer(302)).files(), { kind: ERROR_KINDS.REDIRECT });
  await assert.rejects(client(answer(500, readFixture('error-mode.json').toString())).scan({}), {
    kind: ERROR_KINDS.SCAN,
    detail: "Invalid --mode: 'Lineart' not in 'Gray,Color'",
  });
  await assert.rejects(client(answer(502, 'Bad gateway')).files(), { kind: ERROR_KINDS.HTTP });
  const refused = async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'ECONNREFUSED' };
    throw err;
  };
  await assert.rejects(client(refused).files(), {
    kind: ERROR_KINDS.UNREACHABLE,
    message: 'ECONNREFUSED',
  });
  const tls = async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' };
    throw err;
  };
  await assert.rejects(client(tls).files(), { kind: ERROR_KINDS.TLS });
});

test('basic authentication, file names with spaces, deletion', async () => {
  const seen = [];
  const request = async (url, options) => {
    seen.push([url, options.method, options.headers.authorization]);
    return { status: 200, body: JSON.stringify({ deleted: true }) };
  };
  const client = new ScanservjsClient({
    url: 'http://192.0.2.20:8080',
    username: 'a',
    password: 'b',
    request,
  });
  assert.equal(await client.deleteFile('scan_2026-10-22 21.06.13.pdf'), true);
  assert.deepEqual(seen[0], [
    'http://192.0.2.20:8080/api/v1/files/scan_2026-10-22%2021.06.13.pdf',
    'DELETE',
    `Basic ${Buffer.from('a:b').toString('base64')}`,
  ]);
  assert.equal(await client.pages({ name: 'a.jpg', extension: 'jpg', size: 1 }), 1);
});

test('httpRequest on a real HTTP server: body, sink, size limit, timeout, no redirect', async (t) => {
  const { createServer } = await import('node:http');
  const { httpRequest } = await import('../src/scanservjs/client.js');
  const server = createServer((req, res) => {
    if (req.url === '/slow') {
      setTimeout(() => res.end('late'), 500);
      return;
    }
    if (req.url === '/moved') {
      res.writeHead(302, { location: 'http://192.0.2.1/' }).end();
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () =>
      res.end(JSON.stringify({ method: req.method, body, auth: req.headers.authorization })),
    );
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const answer = await httpRequest(`${base}/x`, {
    method: 'POST',
    headers: { authorization: 'Basic eA==' },
    body: '{"a":1}',
  });
  assert.deepEqual(JSON.parse(answer.body), {
    method: 'POST',
    body: '{"a":1}',
    auth: 'Basic eA==',
  });
  const chunks = [];
  const sunk = await httpRequest(`${base}/x`, { sink: (chunk) => chunks.push(chunk) });
  assert.equal(sunk.body, '');
  assert.match(Buffer.concat(chunks).toString(), /GET/);
  await assert.rejects(httpRequest(`${base}/x`, { maxBytes: 5 }), { code: 'ETOOLARGE' });
  await assert.rejects(httpRequest(`${base}/slow`, { timeoutMs: 50 }), { code: 'ETIMEDOUT' });
  assert.equal((await httpRequest(`${base}/moved`)).status, 302);
});
