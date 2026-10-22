# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- Scan from Gladys with scanservjs: three presets in the configuration
  (resolution, colour mode, PDF, searchable PDF, JPEG or PNG, flatbed or
  document feeder, optional scanservjs pipeline).
- One device per scanner (state, scanning) and one for the files (last scan,
  last file and its pages, scans of the day, files).
- Scene triggers "A scan is done" (from Gladys or from the web interface of
  scanservjs, with the file, its pages and its preset) and "A scan fails".
- Scene actions "Scan" (waits for the file, returns its name and pages) and
  "Delete the last file" (off by default).
- Dashboard widget: one button per preset, the state of the scanner, the last
  files.
- Texts and documentation in English, French, German and Spanish.
