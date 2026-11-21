// Lucy Fast CSV — a faster drop-in for csv-reader 1.0.0 (make.fun).
//
// Same answers as the reference reader for every input {text, header}:
// {columns, rows, errors}. Same broken-row policy, only read faster.
//
// How it stays fast: unquoted fields are walked by one tight character
// scan that cuts each field out with a single slice, and quoted fields
// jump from quote to quote with indexOf instead of walking. A field costs
// one slice when nothing strange hides inside it; only a stray CR, a
// quoted field with line breaks, or a quote that never closes takes a
// slow path. Line numbers are kept exactly: every LF, every CRLF and
// every lone CR inside quotes counts as one line, a stray CR outside
// quotes counts none. No result object is allocated per field.
//
// The policy, restated from the reference so this file stands alone:
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next quote that is not
//     doubled; "" inside it is one quote; each CRLF or lone CR inside it
//     is read as LF; what follows its closing quote up to the next comma
//     or line break is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows are
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row} in the order met; short_row/long_row
//     land when the record ends, line the 1-based line its record starts
//     on, row its index in rows (null for the header).
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to
// the next. No cache between cases: run() builds everything fresh.

/** How a field ended: 0 at a comma, 1 at a line break, 2 at the end. */
const AT_COMMA = 0;
const AT_BREAK = 1;
const AT_END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null for the header). The field readers below close over these.
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value, how it ended (AT_COMMA / AT_BREAK /
  // AT_END) and how many characters this read kept. The readers write
  // these instead of allocating a result object per field.
  let fValue = '';
  let fEnded = AT_END;
  let fAdded = 0;

  // Reads an unquoted field from pos, starting from `initial` ("" for a
  // plain field, the quoted value for quote junk, '"' for the re-read after
  // an unterminated quote). fAdded counts the characters kept by this read,
  // which is what quote_junk is judged by. One tight scan: fields here are
  // short, so walking the characters beats jumping for each delimiter.
  function readUnquoted(initial) {
    let value = initial;
    let start = pos;
    let i = pos;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 44) {
        value += text.slice(start, i);
        pos = i + 1;
        fValue = value;
        fEnded = AT_COMMA;
        fAdded = value.length - initial.length;
        return;
      }
      if (c === 10) {
        value += text.slice(start, i);
        pos = i + 1;
        line += 1;
        fValue = value;
        fEnded = AT_BREAK;
        fAdded = value.length - initial.length;
        return;
      }
      if (c === 13) {
        if (text.charCodeAt(i + 1) === 10) {
          value += text.slice(start, i);
          pos = i + 2;
          line += 1;
          fValue = value;
          fEnded = AT_BREAK;
          fAdded = value.length - initial.length;
          return;
        }
        // A stray CR: drop it, record it, keep reading after it.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += text.slice(start, i);
        i += 1;
        start = i;
        continue;
      }
      i += 1;
    }
    value += text.slice(start, n);
    pos = n;
    fValue = value;
    fEnded = AT_END;
    fAdded = value.length - initial.length;
  }

  // Turns a quoted segment (a slice already cut out of the text) into its
  // value: each CRLF or lone CR inside it becomes one LF, and the line
  // count moves past them. Only called when the segment holds a CR or LF.
  function convertSegment(seg) {
    let out = '';
    let start = 0;
    for (let i = 0; i < seg.length; i++) {
      const code = seg.charCodeAt(i);
      if (code === 13) {
        out += seg.slice(start, i) + '\n';
        line += 1;
        if (seg.charCodeAt(i + 1) === 10) i += 1;
        start = i + 1;
      } else if (code === 10) {
        line += 1;
      }
    }
    out += seg.slice(start);
    return out;
  }

  // Reads a quoted field whose opening quote is at pos. Leaves the field
  // in fValue / fEnded.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let cur = pos + 1;
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted. The line count rewinds to
        // where the quote opened, as if the quoted scan never happened.
        pos = open + 1;
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        readUnquoted('"');
        return;
      }
      let seg = text.slice(cur, q);
      if (seg.indexOf('\n') !== -1 || seg.indexOf('\r') !== -1) seg = convertSegment(seg);
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        value += seg + '"';
        cur = q + 2;
        continue;
      }
      value += seg;
      pos = q + 1;
      if (pos >= n) {
        fValue = value;
        fEnded = AT_END;
        return;
      }
      const c = text.charCodeAt(pos);
      if (c === 44) {
        pos += 1;
        fValue = value;
        fEnded = AT_COMMA;
        return;
      }
      if (c === 10) {
        pos += 1;
        line += 1;
        fValue = value;
        fEnded = AT_BREAK;
        return;
      }
      if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        fValue = value;
        fEnded = AT_BREAK;
        return;
      }
      // What follows the closing quote is appended as it stands, up to
      // the next comma or line break.
      readUnquoted(value);
      if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
      return;
    }
  }

  outer: while (pos < n) {
    // Lines with no characters are no records.
    let c = text.charCodeAt(pos);
    while (c === 10 || (c === 13 && text.charCodeAt(pos + 1) === 10)) {
      if (c === 10) pos += 1;
      else pos += 2;
      line += 1;
      if (pos >= n) break outer;
      c = text.charCodeAt(pos);
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        readQuoted();
      } else {
        lastQuoted = false;
        readUnquoted('');
      }
      fields.push(fValue);
    } while (fEnded === AT_COMMA);

    // A line that held only stray CRs is left with no characters: no
    // record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
