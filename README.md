# scanservjs for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that drives [scanservjs](https://github.com/sbs20/scanservjs), the web
interface that scans with SANE: start a scan from a dashboard button or a
scene, and get an event when the file is ready. Where the file goes next (a
shared folder, Paperless-ngx) is up to the pipelines of scanservjs.

- **Three presets** in the configuration: name, resolution, colour mode,
  format (PDF, searchable PDF, JPEG, PNG), source (flatbed, document feeder,
  duplex) and, optionally, a pipeline of scanservjs (yours, sending to
  Paperless). The SANE words of each scanner are found by the integration.
- **One device per scanner**: state (ready, scanning, last scan failed, not
  found) and a scanning sensor.
- **One device for the files**: last scan, last file, its pages (counted in the
  PDF or the ZIP), scans of the day, files in the folder.
- **Scene triggers**: a scan is done (from Gladys or from the web interface of
  scanservjs, with the file, its pages, its type, its preset), a scan from
  Gladys fails (paper jam, empty feeder, scanner off).
- **Scene actions**: scan with a preset and wait for the file (its name and
  pages as results); delete the last file (off by default).
- **Dashboard widget**: one button per preset, the state of the scanner, the
  last files and the scans of the day.
- Texts in English, French, German and Spanish.

Tested against a real scanservjs 3.3.0 (Docker image `sbs20/scanservjs`)
driving the virtual scanner of SANE (`test` backend): flatbed and document
feeder (10 pages), PDF, JPEG and PNG, refused settings, deletion, with and
without basic authentication. **Developed without the hardware: feedback
welcome** on [the issues](https://github.com/guim31/gladys-scanservjs/issues),
especially with a real scanner, and on a real Gladys.

## Requirements

- Gladys Assistant 5.1.0 or later.
- scanservjs 3.x, its web interface reachable from the Gladys machine (port
  8080 by default), and a scanner it sees.

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-scanservjs`. Then open its configuration,
enter the address of scanservjs (and a user and password if you declared
users in its `config.local.js`), check the presets, and add the scanners from
the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The container calls the REST API of scanservjs: `GET /api/v1/files` at the
interval of the configuration (1 minute by default), `GET /api/v1/context`
(scanners, their SANE options and the pipelines) once an hour, and
`POST /api/v1/scan` for a scan, which answers once the file is made. A new
file fires the scene event; its pages are counted by streaming the PDF or the
ZIP, never held in memory. One scan from Gladys at a time: scanservjs shares
one temporary folder between its scans. The newest file announced is kept in
`/data`, so a scan made during a restart is announced once. HTTP Basic
authentication when scanservjs has users; redirects are not followed.

## Limits

- One scanservjs instance per configuration.
- A scan of the web interface is seen at the next reading of the files; its
  failure, its scanner and its settings are not known (scanservjs does not
  record them).
- scanservjs does not prevent a scan of its web interface from running at the
  same time as one from Gladys.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the
scanservjs API.

## Credits

- [scanservjs](https://github.com/sbs20/scanservjs) by Sam Strachan and its
  contributors (GPL-2.0): the API answers and files in
  `test/fixtures/scanservjs` come from its Docker image, and the API from its
  code. The logo on the cover is the scanservjs icon, from its repository
  (`app-ui/src/icons`).
- [SANE](http://www.sane-project.org/) and its `test` backend, which made the
  test scans.
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-backrest](https://github.com/guim31/gladys-backrest).

Not affiliated with scanservjs or SANE.
