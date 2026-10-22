// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widget (src/widgets.js):
// connection status, errors, scanner states, the "Test the connection" report,
// scene action errors and messages, dates. Four languages, the four of the
// Gladys interface; German says "du", Spanish "usted". test/i18n.test.js
// checks every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './scanservjs/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noUrl: {
    en: 'Enter the address of your scanservjs in the configuration.',
    fr: "Saisissez l'adresse de votre scanservjs dans la configuration.",
    de: 'Gib die Adresse deines scanservjs in der Konfiguration ein.',
    es: 'Introduzca la dirección de su scanservjs en la configuración.',
  },
  invalidUrl: {
    en: 'Address not understood, e.g. http://192.168.1.2:8080',
    fr: 'Adresse incomprise, ex. http://192.168.1.2:8080',
    de: 'Adresse nicht verstanden, z. B. http://192.168.1.2:8080',
    es: 'Dirección no válida, p. ej. http://192.168.1.2:8080',
  },
};

// One short explanation per error kind (src/scanservjs/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'scanservjs does not answer',
    fr: 'scanservjs ne répond pas',
    de: 'scanservjs antwortet nicht',
    es: 'scanservjs no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use an http:// address or a trusted certificate',
    fr: 'certificat refusé : utilisez une adresse http:// ou un certificat reconnu',
    de: 'Zertifikat abgelehnt: Nutze eine http://-Adresse oder ein vertrauenswürdiges Zertifikat',
    es: 'certificado rechazado: use una dirección http:// o un certificado reconocido',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'username or password missing or refused by scanservjs',
    fr: "nom d'utilisateur ou mot de passe manquant ou refusé par scanservjs",
    de: 'Benutzername oder Passwort fehlt oder von scanservjs abgelehnt',
    es: 'usuario o contraseña ausentes o rechazados por scanservjs',
  },
  [ERROR_KINDS.NOT_SCANSERVJS]: {
    en: 'no scanservjs at this address',
    fr: 'aucun scanservjs à cette adresse',
    de: 'kein scanservjs unter dieser Adresse',
    es: 'no hay ningún scanservjs en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the https:// address',
    fr: "l'adresse redirige : saisissez l'adresse en https://",
    de: 'die Adresse leitet um: Gib die https://-Adresse ein',
    es: 'la dirección redirige: introduzca la dirección https://',
  },
  [ERROR_KINDS.SCAN]: {
    en: 'scanservjs could not scan, see its logs',
    fr: "scanservjs n'a pas pu numériser, voir ses logs",
    de: 'scanservjs konnte nicht scannen, sieh in seine Protokolle',
    es: 'scanservjs no ha podido escanear, consulte sus registros',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The state of a scanner, in words (feature "State", widget rows).
export const STATE_TEXT = {
  ready: { en: 'Ready', fr: 'Prêt', de: 'Bereit', es: 'Listo' },
  scanning: { en: 'Scanning', fr: 'Numérisation', de: 'Scannt', es: 'Escaneando' },
  error: {
    en: 'Last scan failed',
    fr: 'Dernier scan en échec',
    de: 'Letzter Scan fehlgeschlagen',
    es: 'Último escaneo fallido',
  },
  missing: { en: 'Not found', fr: 'Introuvable', de: 'Nicht gefunden', es: 'No encontrado' },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: 'Connected',
    scanners: (count) => `${count} scanner(s)`,
    files: (count) => `${count} file(s)`,
  },
  fr: {
    ok: 'Connecté',
    scanners: (count) => `${count} scanner(s)`,
    files: (count) => `${count} fichier(s)`,
  },
  de: {
    ok: 'Verbunden',
    scanners: (count) => `${count} Scanner`,
    files: (count) => `${count} Datei(en)`,
  },
  es: {
    ok: 'Conectado',
    scanners: (count) => `${count} escáner(es)`,
    files: (count) => `${count} archivo(s)`,
  },
};

// Errors of the scene actions and of the widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  busy: {
    en: 'A scan is already running: wait for its end.',
    fr: 'Une numérisation est déjà en cours : attendez sa fin.',
    de: 'Ein Scan läuft bereits: Warte, bis er fertig ist.',
    es: 'Ya hay un escaneo en curso: espere a que termine.',
  },
  presetOff: {
    en: 'This preset has no name in the configuration of the integration: it is off.',
    fr: "Ce préréglage n'a pas de nom dans la configuration de l'intégration : il est désactivé.",
    de: 'Diese Voreinstellung hat keinen Namen in der Konfiguration der Integration und ist daher aus.',
    es: 'Este preajuste no tiene nombre en la configuración de la integración: está desactivado.',
  },
  noScanner: {
    en: 'scanservjs sees no scanner.',
    fr: 'scanservjs ne voit aucun scanner.',
    de: 'scanservjs sieht keinen Scanner.',
    es: 'scanservjs no ve ningún escáner.',
  },
  unknownScanner: {
    en: 'This device is not a scanner of scanservjs (any more).',
    fr: "Cet appareil n'est pas (ou plus) un scanner de scanservjs.",
    de: 'Dieses Gerät ist kein Scanner von scanservjs (mehr).',
    es: 'Este dispositivo no es (o ya no es) un escáner de scanservjs.',
  },
  deleteDisabled: {
    en: 'Deleting files from Gladys is disabled in the configuration of the integration.',
    fr: "La suppression des fichiers depuis Gladys est désactivée dans la configuration de l'intégration.",
    de: 'Das Löschen von Dateien aus Gladys ist in der Konfiguration der Integration deaktiviert.',
    es: 'La eliminación de archivos desde Gladys está desactivada en la configuración de la integración.',
  },
  noFile: {
    en: 'scanservjs holds no file.',
    fr: 'scanservjs ne contient aucun fichier.',
    de: 'scanservjs enthält keine Datei.',
    es: 'scanservjs no contiene ningún archivo.',
  },
  notDeleted: {
    en: 'scanservjs did not delete the file (rights of its output folder?).',
    fr: "scanservjs n'a pas supprimé le fichier (droits de son dossier de sortie ?).",
    de: 'scanservjs hat die Datei nicht gelöscht (Rechte seines Ausgabeordners?).',
    es: 'scanservjs no ha eliminado el archivo (¿permisos de su carpeta de salida?).',
  },
};

// A preset the scanner cannot apply (src/scan.js).
export const PRESET_TEXT = {
  noFeeder: {
    en: 'this scanner has no document feeder',
    fr: "ce scanner n'a pas de chargeur de documents",
    de: 'dieser Scanner hat keinen Dokumenteneinzug',
    es: 'este escáner no tiene alimentador de documentos',
  },
  noDuplex: {
    en: 'this scanner has no duplex feeder',
    fr: "ce scanner n'a pas de chargeur recto verso",
    de: 'dieser Scanner hat keinen Duplex-Einzug',
    es: 'este escáner no tiene alimentador a doble cara',
  },
  unknownPipeline: {
    en: 'pipeline "{pipeline}" unknown to scanservjs',
    fr: 'pipeline « {pipeline} » inconnu de scanservjs',
    de: 'Pipeline „{pipeline}“ ist scanservjs unbekannt',
    es: 'pipeline «{pipeline}» desconocido para scanservjs',
  },
  noPipeline: {
    en: 'scanservjs has no {format} pipeline',
    fr: "scanservjs n'a pas de pipeline {format}",
    de: 'scanservjs hat keine {format}-Pipeline',
    es: 'scanservjs no tiene ningún pipeline {format}',
  },
};

// The messages of a scan started from Gladys (widget toast).
export const SCAN_TEXT = {
  en: {
    running: (preset) => `${preset}: scan started, the file comes next.`,
    done: (file, pages) => `Scanned: ${file} (${pages} p.)`,
  },
  fr: {
    running: (preset) => `${preset} : numérisation lancée, le fichier arrive.`,
    done: (file, pages) => `Numérisé : ${file} (${pages} p.)`,
  },
  de: {
    running: (preset) => `${preset}: Scan gestartet, die Datei folgt.`,
    done: (file, pages) => `Gescannt: ${file} (${pages} S.)`,
  },
  es: {
    running: (preset) => `${preset}: escaneo iniciado, el archivo llegará enseguida.`,
    done: (file, pages) => `Escaneado: ${file} (${pages} p.)`,
  },
};

export const LANGUAGE_FALLBACK = 'en';

const LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };
const formats = new Map();

/** A date as day/month hours:minutes, in the time zone of Gladys (TZ). */
export function formatTime(time, language) {
  const locale = LOCALES[language] ?? LOCALES.en;
  if (!formats.has(locale)) {
    formats.set(
      locale,
      new Intl.DateTimeFormat(locale, {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formats.get(locale).format(new Date(time));
}

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** A template of PRESET_TEXT with its values. */
export const fill = (template, values = {}) =>
  template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
