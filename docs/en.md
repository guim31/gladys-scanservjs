# scanservjs

[scanservjs](https://github.com/sbs20/scanservjs) is a web interface that
scans with SANE from any device of your network. This integration lets Gladys
start a scan, with a tap on the dashboard or from a scene, and tells when a
file is ready: from Gladys, or from the web interface of scanservjs. Where the
file then goes (a shared folder, Paperless-ngx…) is the business of
scanservjs and of its pipelines.

Tested against a real scanservjs 3.3 (Docker image `sbs20/scanservjs`) driving
the virtual scanner of SANE (its `test` backend): scans of the flatbed and of
the document feeder (10 pages), in PDF, JPEG and PNG, refused settings, a
deleted file, with and without authentication. Developed without a physical
scanner and not yet tested on a real Gladys: feedback welcome on
[the issues](https://github.com/guim31/gladys-scanservjs/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- scanservjs 3.x (tested with 3.3.0), its web interface reachable from the
  Gladys machine (port 8080 by default), and a scanner it can see.
- If you declared users in its `config.local.js`: one of them and its
  password.

The integration reads the file list of scanservjs every minute by default, and
its scanners once an hour. Nothing is sent outside your network.

## Getting started

### 1. Check the address of scanservjs

Open scanservjs from a browser and note its address, for example
`http://192.168.1.2:8080`. Make a first scan from its web interface: if it
works there, it works from Gladys.

### 2. Configure the integration

In **Integrations → scanservjs → Configuration**:

- **scanservjs address**: the address above. A bare IP address uses port 8080.
- **Username** and **Password**: only if scanservjs asks for them.
- **Preset 1, 2 and 3**: what a tap does. Each preset has a **Name** (the text
  of its button; empty, the preset is off), a **Resolution**, a **Mode**
  (color, grayscale, black and white), a **Format** (PDF, searchable PDF with
  OCR, JPEG, PNG) and a **Source**: the scanner default, the flatbed, or the
  document feeder, which scans every sheet it holds (one file). By default:
  _Document_ (300 dpi, grayscale, PDF) and _Photo_ (300 dpi, color, JPEG).
  The integration finds the words of your scanner (a "Color" mode may be
  called "24bit Color"); a black and white mode it lacks becomes grayscale.
- **scanservjs pipeline (optional)**: the exact name of a pipeline of
  scanservjs, one of yours for example (see _Paperless and shared folders_).
  Empty, the integration takes the one of the format.
- **Refresh interval**: how quickly a scan made from the web interface of
  scanservjs is seen (30 seconds, 1 or 5 minutes). A scan from Gladys is seen
  at once.
- **Allow deleting files**: off by default; see the action below.
- **Language of the names**: the language of the feature names (set when a
  device is added) and of the states.

**Test the connection** reads scanservjs and tells its version, its scanners
and its files.

### 3. Add the devices

In the **Discover** tab, add the scanners and the **scanservjs** device.
Nothing is created without you. The widget and the scenes work without them,
but a scene can only pick a scanner that is added.

## The devices

One device per scanner of scanservjs:

| Feature  | Value                                                                                                      |
| -------- | ---------------------------------------------------------------------------------------------------------- |
| State    | Ready, Scanning, Last scan failed (until the next one succeeds), Not found (scanservjs no longer lists it) |
| Scanning | 1 while a scan started from Gladys runs                                                                    |

One **scanservjs** device for the files of its output folder:

| Feature                | Value                                                     |
| ---------------------- | --------------------------------------------------------- |
| Last scan              | Day and time of the newest file                           |
| Last file              | Its name                                                  |
| Pages of the last scan | Counted in the PDF (or the ZIP of images); 0 when unknown |
| Scans today            | Files made since midnight                                 |
| Files                  | Files in the folder                                       |

The files are not on the scanners: scanservjs does not record which scanner
made a file.

## Dashboard

The **Scanner** widget shows the scans of the day, the pages of the last scan,
the state of the scanner, the last five files, and one button per preset
(_Document_, _Photo_…). A tap scans: the file name and its pages show within 20
seconds, or the widget says the scan goes on and refreshes at its end. In its
settings, choose the scanner (empty: the first one).

## Scenes

### Triggers

- **A scan is done**: a new file in scanservjs, from Gladys or from its web
  interface. Filters: started from (Gladys, the web interface) and file type.
  Variables: the file, its pages, its type, its size, and for a scan from
  Gladys its preset, its pipeline and its scanner.
- **A scan fails**: a scan started from Gladys fails (paper jam, empty feeder,
  scanner off, setting refused). Filter: the scanners. Variables: the scanner,
  the preset and the error of scanservjs.

### Actions

- **Scan**: scans with a preset (and a scanner; empty, the first one) and
  waits for the file, 100 seconds at most. Its results: whether the file is
  ready, its name and its pages. A longer scan goes on, and **A scan is done**
  fires at its end.
- **Delete the last file**: deletes the newest file of scanservjs, for
  example a scan made by mistake. Off unless **Allow deleting files** is on.
  Its result: the name of the file deleted.

### Scene ideas

- A button of the hall (a Zigbee switch) → **Scan** with the _Document_
  preset: put the letter on the glass, press, it is in Paperless.
- **A scan is done** → send a message "Scanned: file (pages)" with the
  variables of the trigger.
- **A scan fails** → notify with the error: the feeder was empty.

## Paperless and shared folders

The integration starts the scans; scanservjs makes and sends the files. To
have them land in Paperless-ngx, either point the output folder of scanservjs
(`/var/lib/scanservjs/output` in its container) at the consume folder of
Paperless, or declare in its `config.local.js` a pipeline whose
`afterAction` moves the file there (see the scanservjs documentation,
"config.local.js"), then type its name in **scanservjs pipeline** of a preset.

## Troubleshooting

- **"scanservjs does not answer"**: check the address and the port from the
  Gladys machine.
- **"username or password missing or refused by scanservjs"**: scanservjs has
  users in its `config.local.js`: type one of them and its password.
- **"no scanservjs at this address"**: the address points at something else.
- **"scanservjs sees no scanner"**: check the scanner in its web interface,
  then **Search** in the Discover tab (the scanners are read again).
- **"this scanner has no document feeder"**: the preset asks for the feeder;
  choose the flatbed or the scanner default.
- **A scan fails with the error of `scanimage`**: the same scan most likely
  fails from the web interface of scanservjs; its logs tell more.
- To see more, set the `LOG_LEVEL` variable of the integration to `debug`.

## Limits

- One scanservjs instance per integration, one scan from Gladys at a time.
  scanservjs itself does not prevent a scan of its web interface from
  running at the same time as one from Gladys: avoid it.
- A scan started from the web interface is seen when its file appears, at the
  next reading: its failure, its preset and its scanner are not known.
- The pages are counted in the PDF files and the ZIP archives; a text file of
  the OCR counts as one page.
- Developed without the hardware: feedback welcome (a virtual scanner of
  SANE only). Not affiliated with scanservjs nor SANE. Report a problem or an idea on
  [the issues](https://github.com/guim31/gladys-scanservjs/issues).
