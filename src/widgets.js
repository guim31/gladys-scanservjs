// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `scanservjs`.
//
// The use case: put the paper on the glass, tap "Document" on the wall tablet,
// and see the file arrive. So the widget shows the scans of the day and the
// pages of the last one, the state of the scanner, the last files, and one
// button per preset of the configuration (three at most). A tap waits for
// the file up to 20 seconds, then answers that the scan goes on: the widget
// refreshes at its end.
//
// Budget (8 components, 2 texts): two tiles, one text when scanservjs cannot
// be read, one status list (the scanner, five files), three buttons.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { startOfDay } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import { within } from './scenes.js';
import { ERROR_TEXT, SCAN_TEXT, STATE_TEXT, formatTime, pick } from './texts.js';

export const WIDGET_WAIT_MS = 20_000;
export const MAX_FILES_SHOWN = 5;

// Action keys of the buttons, one per preset: permanent once published.
export const actionKey = (index) => `scan_${index}`;

export const TEXT = {
  pick: {
    en: 'Enter the address of your scanservjs in the configuration of the integration.',
    fr: "Saisissez l'adresse de votre scanservjs dans la configuration de l'intégration.",
    de: 'Gib die Adresse deines scanservjs in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de su scanservjs en la configuración de la integración.',
  },
  noScanner: {
    en: 'scanservjs sees no scanner: check its connection, then "Search" in Discover.',
    fr: 'scanservjs ne voit aucun scanner : vérifiez son branchement, puis « Rechercher » dans Découverte.',
    de: 'scanservjs sieht keinen Scanner: Prüfe seinen Anschluss, dann „Suchen“ unter Entdecken.',
    es: 'scanservjs no ve ningún escáner: compruebe su conexión y luego «Buscar» en Descubrir.',
  },
  today: { en: 'Scans today', fr: 'Scans du jour', de: 'Scans heute', es: 'Escaneos de hoy' },
  pages: {
    en: 'Last scan, pages',
    fr: 'Dernier scan, pages',
    de: 'Letzter Scan, Seiten',
    es: 'Último, páginas',
  },
};

const STATE_STYLE = {
  ready: { icon: 'check-circle', color: WIDGET_COLORS.SUCCESS },
  scanning: { icon: 'loader', color: WIDGET_COLORS.INFO },
  error: { icon: 'x-circle', color: WIDGET_COLORS.DANGER },
};

const FORMAT_ICON = { pdf: 'file-text', pdf_ocr: 'file-text', jpg: 'image', png: 'image' };

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The scanner of the widget: the one chosen in its settings, or the first. */
function scannerOf(hub, settings) {
  try {
    return hub.scannerFor(typeof settings?.scanner === 'string' ? settings.scanner : '');
  } catch {
    return null;
  }
}

async function get(hub, { settings, language = 'en' }) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  const files = hub.files ?? [];
  const components = [];
  if (hub.files !== null) {
    const today = startOfDay(hub.now());
    const pages = files[0] ? hub.knownPages(files[0]) : null;
    components.push(
      {
        type: 'value',
        value: files.filter((file) => file.time >= today).length,
        label: pick(TEXT.today, language),
        icon: 'file-text',
        color: WIDGET_COLORS.NEUTRAL,
      },
      {
        type: 'value',
        value: Number.isInteger(pages) && pages > 0 ? pages : '-',
        label: pick(TEXT.pages, language),
        icon: 'layers',
        color: WIDGET_COLORS.NEUTRAL,
      },
    );
  }

  const scanner = hub.error ? null : scannerOf(hub, settings);
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  } else if (!scanner && hub.context) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.noScanner, language) });
  }

  const items = [];
  if (scanner) {
    const state = hub.stateOf(scanner);
    items.push({
      label: fit(scanner.name, 40),
      value: fit(pick(STATE_TEXT[state], language), 40),
      ...STATE_STYLE[state],
    });
  }
  for (const file of files.slice(0, MAX_FILES_SHOWN)) {
    const pages = hub.knownPages(file);
    const time = formatTime(file.time, language);
    items.push({
      label: fit(file.name, 40),
      value: Number.isInteger(pages) && pages > 0 ? `${time} · ${pages} p.` : time,
      icon: 'file',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  if (items.length > 0) {
    components.push({ type: 'status', items });
  }

  if (scanner) {
    for (const preset of hub.config.presets.filter((item) => item.name)) {
      components.push({
        type: 'button',
        label: fit(preset.name, 24),
        icon: FORMAT_ICON[preset.format],
        style: 'secondary',
        action: { key: actionKey(preset.index) },
      });
    }
  }
  // A scan running ends soon: refresh sooner.
  return { ttl_seconds: hub.error || hub.scanning ? 30 : 120, components };
}

async function action(hub, { actionKey: key, settings }) {
  const match = /^scan_(\d)$/.exec(key ?? '');
  if (!match) {
    throw new Error(`Unknown action ${key}`);
  }
  const language = hub.config.language;
  const preset = hub.config.presets[Number(match[1]) - 1];
  const device = typeof settings?.scanner === 'string' ? settings.scanner : '';
  const started = Date.now();
  const { done } = await hub.startScan({ preset: match[1], device });
  const result = await within(done, Math.max(0, WIDGET_WAIT_MS - (Date.now() - started)));
  const words = SCAN_TEXT[language] ?? SCAN_TEXT.en;
  return {
    message: fit(result ? words.done(result.file, result.pages) : words.running(preset.name), 200),
  };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
