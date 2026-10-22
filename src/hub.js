// -----------------------------------------------------------------------------
// The scanservjs hub: its files read on a timer of the container (the interval
// chosen in the configuration), its scanners every hour (scanservjs runs
// `scanimage -L` for them when it has none cached); the states of the added
// devices published when they change; the scans started from Gladys (one at
// a time: scanservjs shares one temporary folder between its scans); the scene
// events of a file made, from Gladys or from the web interface, and of a scan
// from Gladys that failed.
//
// Gladys never polls these devices (should_poll: false): the scene event of a
// file made from the web interface must fire whether a device is added or not.
//
// The newest file announced is kept in /data (src/store.js): a scan made while
// the integration or Gladys restarted is still announced, once.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { ScanservjsClient, ScanservjsError } from './scanservjs/client.js';
import {
  buildScannerDevice,
  buildServerDevice,
  isScannerId,
  scannerIds,
  scannerValues,
  serverIds,
  serverValues,
} from './devices.js';
import { hostOf, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { PresetError, pipelineLabel, scanRequest } from './scan.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  PRESET_TEXT,
  REPORT_TEXT,
  fill,
  labelled,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'scanservjs-hub' });

export const WIDGET_KEY = 'scanservjs';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  COMPLETED: 'scan_completed',
  FAILED: 'scan_failed',
});

// Where a file comes from (the `origin` filter of "A scan is done").
export const ORIGINS = Object.freeze({ GLADYS: 'gladys', SCANSERVJS: 'scanservjs' });

export const HUB_TIMINGS = {
  // The scanners are read again this often (and on "Search", and after a
  // failed scan).
  contextEveryMs: 3600_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // Between the end of a scan from Gladys and the next one: scanservjs names
  // its files after the second, and replaces a file of the same name.
  sameNameGuardMs: 1000,
};

// New files announced per reading, the newest: the others are only recorded
// (a folder filled while the integration was stopped for a month).
export const MAX_ANNOUNCED = 10;
// Pages counted kept in /data, by file name.
const MAX_PAGES_KEPT = 20;
const MAX_TRANSPORTS_PER_REQUEST = 100;

/**
 * The key of a file in the pages counted: its name and its time. scanservjs
 * names a file after the second it was made: a second scan within the same
 * second replaces the first file, under the same name.
 */
const pagesKey = (file) => `${file.name}@${file.time}`;

/** The error of a scan, in the language of the configuration. */
export function scanErrorText(err, language) {
  if (err instanceof PresetError) {
    return fill(pick(PRESET_TEXT[err.reason], language), err.values);
  }
  if (err instanceof ScanservjsError) {
    return err.detail || pick(ERROR_TEXT[err.kind], language);
  }
  return err.message;
}

export class ScanservjsHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/scanservjs/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    this.context = null;
    this.contextAt = 0;
    /** @type {Array<{ name, extension, time, size }>|null} newest first */
    this.files = null;
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    /** @type {{ scannerId: string, preset: object }|null} the scan from Gladys running */
    this.scanning = null;
    // When the last scan from Gladys ended (sameNameGuardMs).
    this.lastScanAt = -Infinity;
    /** @type {Set<string>} files of the scans from Gladys, announced by them */
    this.announced = new Set();
    /** @type {Map<string, string>} the last scan from Gladys failed, by scanner id */
    this.scanErrors = new Map();
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    this.saved = { newest: null, pages: {} };
    this.pollTimer = null;
    this.stopped = false;
    this.problems = new ProblemLog(logger);
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = {
      url: typeof saved?.url === 'string' ? saved.url : null,
      newest: saved?.newest && typeof saved.newest === 'object' ? saved.newest : null,
      pages: saved?.pages && typeof saved.pages === 'object' ? saved.pages : {},
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const languageChanged = this.signature !== null && this.config.language !== config.language;
    this.config = config;
    const signature = JSON.stringify([config.url, config.username, config.password]);
    if (signature !== this.signature) {
      if (config.url && this.saved.url !== config.url) {
        // Another instance: what was seen of the previous one means nothing here.
        this.saved = { url: config.url, newest: null, pages: {} };
        this.store.save(this.saved);
      }
      this.signature = signature;
      this.client = config.url
        ? new ScanservjsClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
          })
        : null;
      this.context = null;
      this.contextAt = 0;
      this.files = null;
      this.readAt = 0;
      this.error = null;
      this.polling = null;
      this.scanErrors.clear();
    }
    if (languageChanged) {
      this.discovered = null; // new names for the Discovery tab
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading scanservjs works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Reading scanservjs ------------------------------------------------------

  /**
   * Read scanservjs now and publish what changed.
   * @param {object} [options]
   * @param {boolean} [options.publish] publish the Discovery list again
   * @param {boolean} [options.context] read the scanners again too
   */
  async pollNow({ publish = false, context = false } = {}) {
    if (context) {
      this.contextAt = 0;
    }
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
  }

  /**
   * Read scanservjs and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let snapshot;
    try {
      snapshot = await this.fetch(client);
    } catch (err) {
      if (!(err instanceof ScanservjsError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(client, snapshot);
  }

  async fetch(client) {
    const now = this.now();
    let context = this.context;
    if (!context || now - this.contextAt >= this.timings.contextEveryMs) {
      context = await client.context();
    }
    const files = await client.files();
    return { context, contextRead: context !== this.context, files, now };
  }

  /** The pages counted of a file, null if not yet. */
  knownPages(file) {
    const known = this.saved.pages[pagesKey(file)];
    return Number.isInteger(known) ? known : null;
  }

  /** The pages of a file: counted once, kept in /data; 0 when unreadable. */
  async pagesOf(client, file) {
    const known = this.knownPages(file);
    if (known !== null) {
      return known;
    }
    let pages = 0;
    try {
      pages = await client.pages(file);
    } catch (err) {
      logger.debug(`Pages of ${file.name} unreadable: ${err.message}`);
    }
    this.rememberPages(pagesKey(file), pages);
    return pages;
  }

  rememberPages(key, pages) {
    this.saved.pages[key] = pages;
    const names = Object.keys(this.saved.pages);
    for (const old of names.slice(0, Math.max(0, names.length - MAX_PAGES_KEPT))) {
      delete this.saved.pages[old];
    }
  }

  /**
   * The files newer than the newest one announced, newest first. By time only
   * (to the millisecond): a file renamed in the web interface keeps its time,
   * and is no news.
   */
  newFiles(files) {
    const newest = this.saved.newest;
    if (!Number.isFinite(newest?.time)) {
      return null; // first sight: nothing is news
    }
    return files.filter((file) => file.time > newest.time);
  }

  /** Record `files` (newest first) as seen. */
  recordNewest(files) {
    const time = files[0]?.time;
    if (time === undefined || (this.saved.newest && this.saved.newest.time >= time)) {
      return false;
    }
    this.saved.newest = { time };
    this.saved.url = this.config.url;
    return true;
  }

  async applySuccess(client, { context, contextRead, files, now }) {
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('scanservjs answers again');
    }
    if (contextRead) {
      const before = JSON.stringify(this.context?.scanners.map((scanner) => scanner.id));
      if (this.readAt === 0 || before !== JSON.stringify(context.scanners.map((s) => s.id))) {
        logger.info(
          `scanservjs ${context.version} (${hostOf(this.config.url)}): ${context.scanners.length} scanner(s)`,
        );
        widgetChanged = true;
      }
      this.context = context;
      this.contextAt = now;
    }
    this.error = null;
    this.readAt = now;

    const previousNewest = this.files?.[0]?.name ?? null;
    let dirty = false;
    // While a scan from Gladys runs, its file must be announced by it, with
    // its preset: new files wait for the read that follows its end.
    if (!this.scanning) {
      const fresh = this.newFiles(files);
      const news = (fresh ?? []).filter((file) => !this.announced.has(file.name));
      for (const file of news.slice(0, MAX_ANNOUNCED).reverse()) {
        await this.fire(TRIGGERS.COMPLETED, {
          ...(await this.fileData(client, file)),
          origin: ORIGINS.SCANSERVJS,
          pipeline: '',
          preset: '',
          scanner: '',
        });
      }
      if (fresh !== null && fresh.length > 0) {
        logger.debug(`${fresh.length} new file(s) in scanservjs`);
      }
      dirty = this.recordNewest(files) || dirty;
      // Recorded now: a file of Gladys not in this list (read before its scan
      // ended) stays to be skipped by the next read.
      for (const file of files) {
        this.announced.delete(file.name);
      }
    }
    this.files = files;
    if (files[0] && this.knownPages(files[0]) === null) {
      await this.pagesOf(client, files[0]);
      dirty = true;
    }
    if (files[0]?.name !== previousNewest) {
      widgetChanged = true;
    }
    // Written only when something changed: no wear of the SD card at every read.
    if (dirty) {
      this.store.save(this.saved);
    }
    await this.publishStates();
    return widgetChanged;
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.readAt = this.now();
    if (wasError !== err.kind) {
      logger.warn(`scanservjs: ${err.message}`);
    }
    return wasError !== err.kind;
  }

  /** The variables of "A scan is done" that describe the file. */
  async fileData(client, file) {
    return {
      file: file.name,
      format: file.extension,
      pages: await this.pagesOf(client, file),
      size_kb: Math.round(file.size / 1024),
    };
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  /** The scanners of the last read; [] before it. */
  scanners() {
    return this.context?.scanners ?? [];
  }

  /** The state of a scanner: scanning, error (its last scan failed) or ready. */
  stateOf(scanner) {
    if (this.scanning?.scannerId === scanner.id) {
      return 'scanning';
    }
    return this.scanErrors.has(scanner.id) ? 'error' : 'ready';
  }

  discoveredDevices() {
    const language = this.config.language;
    if (!this.client || !this.context || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    return [
      buildServerDevice(this.gladys, language),
      ...this.scanners().map((scanner) => buildScannerDevice(this.gladys, scanner, language)),
    ];
  }

  /** Publish the Discovery list when it changed (a scanner added, removed…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read the scanners again, publish the list. */
  async rediscover() {
    await this.pollNow({ publish: true, context: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were dropped
   * by Gladys, and a device deleted then added again needs its badge.
   */
  async onDeviceCreated(device) {
    this.gladys.forgetPublishedStates?.(device.external_id);
    this.transports.delete(device.external_id);
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** The scanner devices added to Gladys, by external id. */
  createdScanners() {
    return (this.gladys.devices ?? [])
      .map((device) => device.external_id)
      .filter((externalId) => isScannerId(this.gladys, externalId));
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`).
   */
  async publishStates() {
    if (!this.context || this.files === null || this.error) {
      return;
    }
    const language = this.config.language;
    const values = [];
    const seen = new Set();
    for (const scanner of this.scanners()) {
      const externalId = scannerIds(this.gladys, scanner.id).device;
      seen.add(externalId);
      if (this.isCreated(externalId)) {
        values.push(...scannerValues(externalId, this.stateOf(scanner), language));
      }
    }
    // A scanner scanservjs no longer lists (removed from its config, unplugged
    // when its device list was read again).
    for (const externalId of this.createdScanners()) {
      if (!seen.has(externalId)) {
        values.push(...scannerValues(externalId, 'missing', language));
      }
    }
    if (this.isCreated(serverIds(this.gladys).device)) {
      values.push(
        ...serverValues(this.gladys, {
          files: this.files,
          pages: this.files[0] ? this.knownPages(this.files[0]) : null,
          now: this.now(),
          language,
        }),
      );
    }
    if (values.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(values, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const ids = [
      serverIds(this.gladys).device,
      ...this.scanners().map((scanner) => scannerIds(this.gladys, scanner.id).device),
    ];
    const entries = ids
      .filter((id) => this.isCreated(id) && this.transports.get(id) !== transport)
      .map((id) => ({ external_id: id, transport }));
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.urlTyped) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (widget, scene actions, report) --------------------------------------

  /** Throws the reason scanservjs cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** Read scanservjs when nothing was read yet or it failed; throws a readable error. */
  async ensureRead() {
    if (!this.client) {
      this.assertReadable();
    }
    if (!this.context || this.error) {
      await this.pollNow();
    }
    this.assertReadable();
  }

  /** The scanner of a device external id, or the first one; throws a readable error. */
  scannerFor(deviceExternalId) {
    const language = this.config.language;
    if (deviceExternalId) {
      const scanner = this.scanners().find(
        (item) => scannerIds(this.gladys, item.id).device === deviceExternalId,
      );
      if (!scanner) {
        throw new Error(pick(ACTION_TEXT.unknownScanner, language));
      }
      return scanner;
    }
    const first = this.scanners()[0];
    if (!first) {
      throw new Error(pick(ACTION_TEXT.noScanner, language));
    }
    return first;
  }

  /**
   * Start a scan with a preset of the configuration, on the scanner of a
   * device (the first scanner of scanservjs by default). Resolves to the
   * promise of its end, `{ file, pages }`, which rejects with a readable error.
   */
  async startScan({ preset: index, device }) {
    const language = this.config.language;
    const preset = this.config.presets[Number(index) - 1];
    if (!preset) {
      throw new Error(`Unknown preset ${index}`);
    }
    if (!preset.name) {
      throw new Error(pick(ACTION_TEXT.presetOff, language));
    }
    if (this.scanning) {
      throw new Error(pick(ACTION_TEXT.busy, language));
    }
    await this.ensureRead();
    const scanner = this.scannerFor(device);
    if (this.scanning) {
      throw new Error(pick(ACTION_TEXT.busy, language)); // started while reading
    }
    let request;
    try {
      request = scanRequest(scanner, preset);
    } catch (err) {
      const message = scanErrorText(err, language);
      await this.fire(TRIGGERS.FAILED, this.failureData(scanner, preset, message));
      throw new Error(labelled(preset.name, message, language), { cause: err });
    }
    this.scanning = { scannerId: scanner.id, preset };
    logger.info(`Scan started from Gladys: "${preset.name}" on ${scanner.name}`);
    const guard = this.lastScanAt + this.timings.sameNameGuardMs - this.now();
    if (guard > 0) {
      await new Promise((resolve) => {
        setTimeout(resolve, guard);
      });
    }
    await this.publishStates();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
    return { done: this.runScan(this.client, scanner, preset, request) };
  }

  failureData(scanner, preset, message) {
    return {
      device: scannerIds(this.gladys, scanner.id).device,
      scanner: scanner.name,
      preset: preset.name,
      message,
    };
  }

  async runScan(client, scanner, preset, request) {
    const language = this.config.language;
    try {
      const file = await client.scan(request);
      this.lastScanAt = this.now();
      this.announced.add(file.name);
      const data = await this.fileData(client, file);
      this.scanErrors.delete(scanner.id);
      logger.info(`Scan done: ${file.name} (${data.pages} page(s))`);
      await this.fire(TRIGGERS.COMPLETED, {
        ...data,
        origin: ORIGINS.GLADYS,
        pipeline: pipelineLabel(request.pipeline),
        preset: preset.name,
        scanner: scanner.name,
      });
      return { file: file.name, pages: data.pages };
    } catch (err) {
      const message = scanErrorText(err, language);
      this.scanErrors.set(scanner.id, message);
      logger.warn(`Scan "${preset.name}" on ${scanner.name} failed: ${err.message}`);
      await this.fire(TRIGGERS.FAILED, this.failureData(scanner, preset, message));
      throw new Error(labelled(preset.name, message, language), { cause: err });
    } finally {
      if (this.scanning?.scannerId === scanner.id) {
        this.scanning = null;
      }
      // The file in the device states, the scanner ready again; after a
      // failure, the scanners read again (one unplugged?).
      // A read already running may predate the file: wait for it, then read.
      if (client === this.client) {
        await (this.polling ?? Promise.resolve())
          .catch(() => {})
          .then(() => this.pollNow({ context: this.scanErrors.has(scanner.id) }))
          .catch((err) => logger.debug(`Read after scan failed: ${err.message}`));
      }
    }
  }

  /** Delete the newest file of scanservjs (when allowed); its name. */
  async deleteLastFile() {
    const language = this.config.language;
    if (!this.config.allowDelete) {
      throw new Error(pick(ACTION_TEXT.deleteDisabled, language));
    }
    if (!this.client) {
      this.assertReadable();
    }
    await this.pollNow();
    this.assertReadable();
    const newest = this.files?.[0];
    if (!newest) {
      throw new Error(pick(ACTION_TEXT.noFile, language));
    }
    if (!(await this.client.deleteFile(newest.name))) {
      throw new Error(pick(ACTION_TEXT.notDeleted, language));
    }
    logger.info(`File deleted from Gladys: ${newest.name}`);
    await this.pollNow();
    return newest.name;
  }

  /** "Test the connection": read scanservjs now (scanners too), one line. */
  async testConnection() {
    await this.pollNow({ publish: true, context: true });
    const message = {};
    const status = this.connectionStatus();
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!status.connected) {
        message[language] = pick(status.message, language);
        continue;
      }
      const parts = [
        `${text.ok} (scanservjs ${this.context.version})`,
        text.scanners(this.scanners().length),
        text.files(this.files.length),
      ];
      message[language] = labelled('scanservjs', parts.join(', '), language);
    }
    return message;
  }
}
