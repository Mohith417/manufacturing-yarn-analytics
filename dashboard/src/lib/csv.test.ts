import { describe, expect, it } from "vitest";
import {
  latestPerMachine,
  parseCsv,
  toCsv,
  validateTable,
  type ParsedReading,
} from "./csv";

const HEADER =
  "machine_id,machine_age_years,operating_hours,temperature_c,vibration_mm_s,days_since_maintenance,past_maintenance_events";

function row(id: string, vibration = "3.5") {
  return `${id},10,12,72,${vibration},30,2`;
}

describe("parseCsv", () => {
  it("handles a BOM, CRLF and a quoted comma", () => {
    const table = parseCsv(`\uFEFFmachine_id,note\r\nM001,"a,b"\r\nM002,plain\r\n`);
    expect(table.error).toBeNull();
    expect(table.header).toEqual(["machine_id", "note"]);
    expect(table.records.map((record) => record.cells)).toEqual([
      ["M001", "a,b"],
      ["M002", "plain"],
    ]);
  });

  it("handles escaped quotes and newlines inside a quoted cell", () => {
    const table = parseCsv('machine_id,note\nM001,"say ""hi""\nthen go"\n');
    expect(table.records[0].cells[1]).toBe('say "hi"\nthen go');
  });

  it("reports an unclosed quote instead of guessing", () => {
    const table = parseCsv('machine_id,note\nM001,"open\n');
    expect(table.error).toMatch(/never closed/i);
  });

  it("treats an empty file as an error", () => {
    expect(parseCsv("   ").error).toMatch(/empty/i);
  });
});

describe("validateTable", () => {
  it("names every missing required column", () => {
    const table = parseCsv("machine_id,temperature_c\nM001,72\n");
    const report = validateTable(table);
    expect(report.missingColumns).toContain("vibration_mm_s");
    expect(report.fatal).toMatch(/missing required column/i);
    expect(report.rowsValid).toBe(0);
  });

  it("skips an empty cell and says which column", () => {
    const table = parseCsv(`${HEADER}\n${row("M001")}\nM002,10,12,,3.5,30,2\n`);
    const report = validateTable(table);
    expect(report.rowsRead).toBe(2);
    expect(report.rowsValid).toBe(1);
    expect(report.skipped[0].line).toBe(3);
    expect(report.skipped[0].reason).toBe("temperature_c is empty");
  });

  it("skips text in a number column and quotes the value", () => {
    const table = parseCsv(`${HEADER}\n${row("M001", "fast")}\n`);
    const report = validateTable(table);
    expect(report.rowsValid).toBe(0);
    expect(report.skipped[0].reason).toContain('vibration_mm_s is not a number ("fast")');
  });

  it("ignores unknown columns but reports them", () => {
    const table = parseCsv(`${HEADER},operator\n${row("M001")},ana\n`);
    const report = validateTable(table);
    expect(report.unknownColumns).toEqual(["operator"]);
    expect(report.rowsValid).toBe(1);
  });

  it("keeps every valid row in file order", () => {
    const table = parseCsv(`${HEADER}\n${row("M003")}\n${row("M001")}\n`);
    expect(validateTable(table).readings.map((reading) => reading.machineId)).toEqual([
      "M003",
      "M001",
    ]);
  });
});

describe("latestPerMachine", () => {
  const reading = (id: string, timestamp: string | null, line: number): ParsedReading => ({
    line,
    machineId: id,
    timestamp,
    features: {
      machine_age_years: 10,
      operating_hours: 12,
      temperature_c: 72,
      vibration_mm_s: 3.5,
      days_since_maintenance: 30,
      past_maintenance_events: 2,
    },
  });

  it("picks the newest timestamp per machine", () => {
    const rows = [
      reading("M001", "2024-12-01T06:00:00Z", 2),
      reading("M001", "2024-12-01T09:00:00Z", 3),
      reading("M002", "2024-12-01T07:00:00Z", 4),
    ];
    const latest = latestPerMachine(rows);
    expect(latest).toHaveLength(2);
    expect(latest[0].line).toBe(3);
  });

  it("without timestamps, the last row in the file wins", () => {
    const rows = [reading("M001", null, 2), reading("M001", null, 7)];
    expect(latestPerMachine(rows)[0].line).toBe(7);
  });
});

describe("toCsv", () => {
  it("quotes only the cells that need it", () => {
    const text = toCsv(["a", "b"], [["plain", "has,comma"], ['say "hi"', 1]]);
    expect(text).toBe('a,b\r\nplain,"has,comma"\r\n"say ""hi""",1');
  });
});
