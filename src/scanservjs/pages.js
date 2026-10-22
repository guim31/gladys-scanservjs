// -----------------------------------------------------------------------------
// The number of pages of a file made by scanservjs, read while it streams (a
// 50-page PDF is never held in memory, the sandbox has 256 MB):
//
//   - PDF: the page objects ("/Type /Page", not "/Pages"); the largest
//     "/Count" of the page tree when the objects are compressed. The PDFs of
//     scanservjs (ImageMagick, Tesseract) have plain objects: checked on the
//     files of a real scanservjs 3.3.0 (1 and 10 pages);
//   - ZIP: what scanservjs makes of several JPEG, PNG or TIFF pages, one entry
//     per page, read from the end of central directory record;
//   - JPEG, PNG, TIFF, text: one file per page, so 1 (not downloaded).
// 0 when the count cannot be read.
// -----------------------------------------------------------------------------

const PAGE = /\/Type\s*\/Page(?![A-Za-z])/g;
const COUNT = /\/Count\s+(\d{1,6})(?!\d)/g;
// Longer than any match above, so a match cut between two chunks is whole in
// the tail kept from the first.
const OVERLAP = 64;

/** Counts the pages of a PDF fed in chunks. */
export class PdfPageCounter {
  constructor() {
    this.tail = '';
    // Matches of the tail ending at or before this index were counted.
    this.counted = 0;
    this.pages = 0;
    this.count = 0;
  }

  /**
   * Counts the matches of `text` ending after `this.counted`; before the end
   * of the file, only those ending before its last character, so that the
   * lookahead reads a real character ("/Page" then "s" in the next chunk).
   */
  scan(text, last) {
    const counts = (match) => {
      const end = match.index + match[0].length;
      return end > this.counted && (last || end < text.length);
    };
    for (const match of text.matchAll(PAGE)) {
      if (counts(match)) {
        this.pages += 1;
      }
    }
    for (const match of text.matchAll(COUNT)) {
      if (counts(match)) {
        this.count = Math.max(this.count, Number(match[1]));
      }
    }
  }

  /** @param {Buffer} chunk */
  push(chunk) {
    // latin1: one character per byte, any byte sequence decodes.
    const text = this.tail + chunk.toString('latin1');
    this.scan(text, false);
    this.tail = text.slice(-OVERLAP);
    // Everything ending before the last character of `text` is counted.
    this.counted = this.tail.length - 1;
  }

  finish() {
    this.scan(this.tail, true);
    return this.pages > 0 ? this.pages : this.count;
  }
}

const EOCD = 0x06054b50;
const EOCD_SIZE = 22;
// The record and its comment (65535 bytes at most).
const ZIP_TAIL = EOCD_SIZE + 65_535;

/** Counts the entries of a ZIP fed in chunks (keeps only its end). */
export class ZipEntryCounter {
  constructor() {
    this.tail = Buffer.alloc(0);
  }

  push(chunk) {
    const joined = Buffer.concat([this.tail, chunk]);
    this.tail = joined.length > ZIP_TAIL ? joined.subarray(joined.length - ZIP_TAIL) : joined;
  }

  finish() {
    for (let at = this.tail.length - EOCD_SIZE; at >= 0; at -= 1) {
      if (this.tail.readUInt32LE(at) === EOCD) {
        return this.tail.readUInt16LE(at + 10);
      }
    }
    return 0;
  }
}

/**
 * The counter for a file, by its extension; null when the file is one page and
 * needs no download.
 */
export function pageCounterFor(extension) {
  const ext = String(extension).toLowerCase().replace(/^\./, '');
  if (ext === 'pdf') {
    return new PdfPageCounter();
  }
  if (ext === 'zip') {
    return new ZipEntryCounter();
  }
  return null;
}
