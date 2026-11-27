/**
 * A small, strict CSV reader for the upload page.
 *
 * The dashboard has no CSV dependency, so this handles the parts that matter
 * for real exports: quoted fields, commas and newlines inside quotes, escaped
 * quotes (""), CRLF line endings and a UTF-8 BOM. It never evaluates anything:
 * every cell stays a string and is validated afterwards.
 */

export interface CsvRecord {
  /** 1-based line number in the file, for the skip report. */
  line: number;
  cells: string[];
}

export interface CsvTable {
  header: string[];
  records: CsvRecord[];
  /** A problem that makes the whole file unusable (e.g. an unclosed quote). */
  error: string | null;
}

function splitRecords(text: string): { rows: { line: number; cells: string[] }[]; error: string | null } {
  const rows: { line: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  let index = 0;

  const pushField = () => {
    cells.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    // A trailing newline produces one empty cell: that is a blank line, not a row.
    if (!(cells.length === 1 && cells[0].trim() === "")) {
      rows.push({ line: rowLine, cells });
    }
    cells = [];
    rowLine = line;
  };

  while (index < text.length) {
    const character = text[index];

    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
        index += 1;
        continue;
      }
      if (character === "\n") {
        line += 1;
      }
      field += character;
      index += 1;
      continue;
    }

    if (character === '"' && field === "") {
      quoted = true;
      index += 1;
      continue;
    }
    if (character === ",") {
      pushField();
      index += 1;
      continue;
    }
    if (character === "\r") {
      index += 1;
      if (text[index] === "\n") {
        index += 1;
      }
      line += 1;
      pushRow();
      rowLine = line;
      continue;
    }
    if (character === "\n") {
      line += 1;
      index += 1;
      pushRow();
      rowLine = line;
      continue;
    }
    field += character;
    index += 1;
  }

  if (quoted) {
    return { rows: [], error: "A quoted value is never closed. Check the file for a missing quote." };
  }
  if (field !== "" || cells.length > 0) {
    pushRow();
  }
  return { rows, error: null };
}

export function parseCsv(input: string): CsvTable {
  // Excel on Windows writes a BOM; it would otherwise become part of the first
  // column name and every required-column check would fail.
  const text = input.replace(/^\uFEFF/, "");
  if (text.trim() === "") {
    return { header: [], records: [], error: "The file is empty." };
  }

  const { rows, error } = splitRecords(text);
  if (error) {
    return { header: [], records: [], error };
  }
  if (rows.length === 0) {
    return { header: [], records: [], error: "The file has no rows." };
  }

  const header = rows[0].cells.map((cell, column) => {
    const name = cell.trim();
    // Tolerate positional duplicates ("temperature_c, temperature_c") by
    // numbering the second one instead of silently overwriting it.
    return name === "" ? `column_${column + 1}` : name;
  });
  const seen = new Map<string, number>();
  const unique = header.map((name) => {
    const count = (seen.get(name) ?? 0) + 1;
    seen.set(name, count);
    return count === 1 ? name : `${name}_${count}`;
  });

  return {
    header: unique,
    records: rows.slice(1).map((row) => ({ line: row.line, cells: row.cells })),
    error: null,
  };
}

export const REQUIRED_COLUMNS = [
  "machine_id",
  "machine_age_years",
  "operating_hours",
  "temperature_c",
  "vibration_mm_s",
  "days_since_maintenance",
  "past_maintenance_events",
] as const;

export const OPTIONAL_COLUMNS = ["timestamp"] as const;

export const NUMERIC_COLUMNS = [
  "machine_age_years",
  "operating_hours",
  "temperature_c",
  "vibration_mm_s",
  "days_since_maintenance",
  "past_maintenance_events",
] as const;

/** Broad physical bounds. They exist to catch text in a number column, not to
 * second-guess a plant's own operating range. */
const RANGES: Record<(typeof NUMERIC_COLUMNS)[number], [number, number]> = {
  machine_age_years: [0, 120],
  operating_hours: [0, 100000],
  temperature_c: [-60, 300],
  vibration_mm_s: [0, 500],
  days_since_maintenance: [0, 20000],
  past_maintenance_events: [0, 10000],
};

export interface ParsedReading {
  line: number;
  machineId: string;
  timestamp: string | null;
  features: Record<string, number>;
}

export interface Skip {
  line: number;
  reason: string;
}

export interface ValidationReport {
  header: string[];
  missingColumns: string[];
  unknownColumns: string[];
  rowsRead: number;
  rowsValid: number;
  skipped: Skip[];
  readings: ParsedReading[];
  fatal: string | null;
}

function parseTimestamp(raw: string): string | null {
  const value = raw.trim();
  if (value === "") {
    return null;
  }
  const normalised = value.includes("T") ? value : value.replace(" ", "T");
  const parsed = new Date(`${normalised}Z`.replace(/Z{2}$/, "Z"));
  if (Number.isNaN(parsed.getTime())) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? null : fallback.toISOString();
  }
  return parsed.toISOString();
}

/**
 * Turn a parsed table into scored-able readings, collecting every reason a row
 * was left out. Nothing is silently dropped.
 */
export function validateTable(table: CsvTable): ValidationReport {
  const header = table.header;
  const missingColumns = REQUIRED_COLUMNS.filter((name) => !header.includes(name));
  const known = new Set<string>([...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const unknownColumns = header.filter((name) => !known.has(name) && !/^column_\d+$/.test(name));
  const report: ValidationReport = {
    header,
    missingColumns,
    unknownColumns,
    rowsRead: table.records.length,
    rowsValid: 0,
    skipped: [],
    readings: [],
    fatal: table.error,
  };

  if (table.error) {
    return report;
  }
  if (missingColumns.length > 0) {
    report.fatal = `The file is missing ${missingColumns.length === 1 ? "a required column" : "required columns"}: ${missingColumns.join(", ")}.`;
    return report;
  }

  const position = (name: string) => header.indexOf(name);
  const timestampAt = position("timestamp");

  for (const record of table.records) {
    const cell = (name: string) => (record.cells[position(name)] ?? "").trim();
    const machineId = cell("machine_id");
    if (machineId === "") {
      report.skipped.push({ line: record.line, reason: "machine_id is empty" });
      continue;
    }

    const features: Record<string, number> = {};
    let reason: string | null = null;

    for (const name of NUMERIC_COLUMNS) {
      const raw = cell(name);
      if (raw === "") {
        reason = `${name} is empty`;
        break;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        reason = `${name} is not a number ("${raw}")`;
        break;
      }
      const [low, high] = RANGES[name];
      if (value < low || value > high) {
        reason = `${name} is outside ${low} to ${high} (${raw})`;
        break;
      }
      features[name] = value;
    }

    if (reason) {
      report.skipped.push({ line: record.line, reason });
      continue;
    }

    let timestamp: string | null = null;
    if (timestampAt >= 0) {
      const raw = (record.cells[timestampAt] ?? "").trim();
      if (raw !== "") {
        timestamp = parseTimestamp(raw);
        if (timestamp === null) {
          report.skipped.push({
            line: record.line,
            reason: `timestamp is not a date ("${raw}")`,
          });
          continue;
        }
      }
    }

    report.readings.push({ line: record.line, machineId, timestamp, features });
  }

  report.rowsValid = report.readings.length;
  return report;
}

/**
 * Several rows for one machine are normal in a sensor export. The page shows
 * the latest row per machine by default: the row with the newest timestamp, or
 * the last row in the file when the file carries no timestamps.
 */
export function latestPerMachine(readings: ParsedReading[]): ParsedReading[] {
  const chosen = new Map<string, ParsedReading>();
  const order: string[] = [];
  for (const reading of readings) {
    const current = chosen.get(reading.machineId);
    if (!current) {
      chosen.set(reading.machineId, reading);
      order.push(reading.machineId);
      continue;
    }
    if (reading.timestamp && current.timestamp) {
      if (reading.timestamp > current.timestamp) {
        chosen.set(reading.machineId, reading);
      }
    } else {
      // No timestamps: file order wins, so the last row for a machine is "now".
      chosen.set(reading.machineId, reading);
    }
  }
  return order.map((id) => chosen.get(id) as ParsedReading);
}

/** Quote a cell only when it needs it, so the download opens cleanly in Excel. */
export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const escape = (value: string | number) => {
    const text = String(value);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.map(escape).join(","), ...rows.map((row) => row.map(escape).join(","))].join(
    "\r\n",
  );
}
