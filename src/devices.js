// -----------------------------------------------------------------------------
// The Gladys devices, proposed in the Discovery tab (the user adds the ones to
// follow, nothing is created on their behalf):
//
//   - one device per scanner of scanservjs, identified by its SANE id:
//       state         text/text     "Ready", "Scanning", "Last scan failed",
//                                   "Not found" (language of the configuration)
//       scanning      input/binary  1 while a scan from Gladys runs on it
//
//   - one "scanservjs" device for the files of its output folder:
//       last_scan     text/text     day/month hours:minutes of the newest file
//       last_file     text/text     its name
//       last_pages    counter-sensor/integer  its pages (0 when unknown)
//       scans_today   counter-sensor/integer  files made since midnight
//       files         counter-sensor/integer  files in the folder
//
// The files are not on the scanners: scanservjs does not record which scanner
// made a file, and the scans of its web interface land in the same folder.
//
// Published with should_poll: false: the integration reads scanservjs on its
// own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';
import { STATE_TEXT, formatTime, pick } from './texts.js';

export const SCANNER_TYPE = 'scanner';
export const SERVER_TYPE = 'server';
export const SERVER_ID = 'main';
export const MODEL = 'scanservjs';

// Suffixes of the feature external ids: permanent once published.
export const SCANNER_KEYS = Object.freeze({
  STATE: 'state',
  SCANNING: 'scanning',
});

export const SERVER_KEYS = Object.freeze({
  LAST_SCAN: 'last_scan',
  LAST_FILE: 'last_file',
  LAST_PAGES: 'last_pages',
  SCANS_TODAY: 'scans_today',
  FILES: 'files',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [SCANNER_KEYS.STATE]: 'State',
    [SCANNER_KEYS.SCANNING]: 'Scanning',
    [SERVER_KEYS.LAST_SCAN]: 'Last scan',
    [SERVER_KEYS.LAST_FILE]: 'Last file',
    [SERVER_KEYS.LAST_PAGES]: 'Pages of the last scan',
    [SERVER_KEYS.SCANS_TODAY]: 'Scans today',
    [SERVER_KEYS.FILES]: 'Files',
  },
  fr: {
    [SCANNER_KEYS.STATE]: 'État',
    [SCANNER_KEYS.SCANNING]: 'Numérisation en cours',
    [SERVER_KEYS.LAST_SCAN]: 'Dernier scan',
    [SERVER_KEYS.LAST_FILE]: 'Dernier fichier',
    [SERVER_KEYS.LAST_PAGES]: 'Pages du dernier scan',
    [SERVER_KEYS.SCANS_TODAY]: 'Scans du jour',
    [SERVER_KEYS.FILES]: 'Fichiers',
  },
  de: {
    [SCANNER_KEYS.STATE]: 'Zustand',
    [SCANNER_KEYS.SCANNING]: 'Scan läuft',
    [SERVER_KEYS.LAST_SCAN]: 'Letzter Scan',
    [SERVER_KEYS.LAST_FILE]: 'Letzte Datei',
    [SERVER_KEYS.LAST_PAGES]: 'Seiten des letzten Scans',
    [SERVER_KEYS.SCANS_TODAY]: 'Scans heute',
    [SERVER_KEYS.FILES]: 'Dateien',
  },
  es: {
    [SCANNER_KEYS.STATE]: 'Estado',
    [SCANNER_KEYS.SCANNING]: 'Escaneo en curso',
    [SERVER_KEYS.LAST_SCAN]: 'Último escaneo',
    [SERVER_KEYS.LAST_FILE]: 'Último archivo',
    [SERVER_KEYS.LAST_PAGES]: 'Páginas del último escaneo',
    [SERVER_KEYS.SCANS_TODAY]: 'Escaneos de hoy',
    [SERVER_KEYS.FILES]: 'Archivos',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_PAGES = 10_000;
export const MAX_FILES = 1_000_000;

/**
 * The platform id of a scanner: its SANE id ("airscan:e0:Canon TR8500 series",
 * "pixma:04A91234_ABCDEF") made safe for an external id, and a hash of the
 * whole id, so that two ids slugged alike stay two devices.
 */
export function scannerSlug(id) {
  const slug = id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
  const hash = createHash('sha256').update(id).digest('hex').slice(0, 8);
  return `${slug || 'scanner'}-${hash}`;
}

export const scannerIds = (gladys, id) => gladys.externalIds(SCANNER_TYPE, scannerSlug(id));
export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

/** Whether a device external id is one of our scanners. */
export function isScannerId(gladys, externalId) {
  const prefix = gladys.externalIds(SCANNER_TYPE, '').device;
  return typeof externalId === 'string' && externalId.startsWith(prefix);
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const counter = (name, externalId, max) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max },
  );

const namesOf = (language) => NAMES[language] ?? NAMES.en;

/** The discovery payload of a scanner. */
export function buildScannerDevice(gladys, scanner, language = 'en') {
  const ids = scannerIds(gladys, scanner.id);
  const names = namesOf(language);
  return {
    name: scanner.name,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'SANE_DEVICE', value: scanner.id.slice(0, 255) }],
    features: [
      text(names[SCANNER_KEYS.STATE], ids.feature(SCANNER_KEYS.STATE)),
      sensor(
        names[SCANNER_KEYS.SCANNING],
        ids.feature(SCANNER_KEYS.SCANNING),
        DEVICE_FEATURE_CATEGORIES.INPUT,
        DEVICE_FEATURE_TYPES.SENSOR.BINARY,
        { keep_history: true, min: 0, max: 1 },
      ),
    ],
  };
}

/** The discovery payload of the files device. */
export function buildServerDevice(gladys, language = 'en') {
  const ids = serverIds(gladys);
  const names = namesOf(language);
  return {
    name: 'scanservjs',
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [],
    features: [
      text(names[SERVER_KEYS.LAST_SCAN], ids.feature(SERVER_KEYS.LAST_SCAN)),
      text(names[SERVER_KEYS.LAST_FILE], ids.feature(SERVER_KEYS.LAST_FILE)),
      counter(names[SERVER_KEYS.LAST_PAGES], ids.feature(SERVER_KEYS.LAST_PAGES), MAX_PAGES),
      counter(names[SERVER_KEYS.SCANS_TODAY], ids.feature(SERVER_KEYS.SCANS_TODAY), MAX_FILES),
      counter(names[SERVER_KEYS.FILES], ids.feature(SERVER_KEYS.FILES), MAX_FILES),
    ],
  };
}

/** The values of a scanner device: `{ device_feature_external_id, state|text }`. */
export function scannerValues(deviceExternalId, state, language) {
  return [
    {
      device_feature_external_id: `${deviceExternalId}:${SCANNER_KEYS.STATE}`,
      text: pick(STATE_TEXT[state], language),
    },
    {
      device_feature_external_id: `${deviceExternalId}:${SCANNER_KEYS.SCANNING}`,
      state: state === 'scanning' ? 1 : 0,
    },
  ];
}

/** Midnight of the day of `now`, in the time zone of Gladys (TZ). */
export function startOfDay(now) {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/**
 * The values of the files device. `files` newest first; `pages` the pages of
 * the newest one, null while unknown.
 */
export function serverValues(gladys, { files, pages, now, language }) {
  const ids = serverIds(gladys);
  const newest = files[0] ?? null;
  const today = startOfDay(now);
  const values = [
    {
      device_feature_external_id: ids.feature(SERVER_KEYS.LAST_SCAN),
      text: newest ? formatTime(newest.time, language) : '-',
    },
    {
      device_feature_external_id: ids.feature(SERVER_KEYS.LAST_FILE),
      text: newest ? newest.name.slice(0, 255) : '-',
    },
    {
      device_feature_external_id: ids.feature(SERVER_KEYS.SCANS_TODAY),
      state: Math.min(files.filter((file) => file.time >= today).length, MAX_FILES),
    },
    {
      device_feature_external_id: ids.feature(SERVER_KEYS.FILES),
      state: Math.min(files.length, MAX_FILES),
    },
  ];
  if (newest && pages !== null && pages !== undefined) {
    values.push({
      device_feature_external_id: ids.feature(SERVER_KEYS.LAST_PAGES),
      state: Math.min(pages, MAX_PAGES),
    });
  }
  return values;
}
