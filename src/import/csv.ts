export type ParsedTable = {
  headers: string[];
  rows: Record<string, string>[];
};

function detectDelimiter(line: string): string {
  const tabCount = (line.match(/\t/g) || []).length;
  const commaCount = (line.match(/,/g) || []).length;
  const semicolonCount = (line.match(/;/g) || []).length;
  if (tabCount > commaCount && tabCount > semicolonCount) return "\t";
  return semicolonCount > commaCount ? ";" : ",";
}

function parseLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];
    if (char === "\"" && quoted && next === "\"") {
      current += "\"";
      index += 1;
    } else if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

export function parseDelimited(text: string): ParsedTable {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = parseLine(line, delimiter);
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = cells[index] || "";
      return record;
    }, {});
  });

  return { headers, rows };
}
