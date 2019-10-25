import { PluginContext } from 'rollup';
import { Diagnostic, DiagnosticCategory } from 'typescript';

export function logDiagnostics(
  ctx: PluginContext,
  diagnostics: Diagnostic[],
): void {
  for (const d of diagnostics) {
    logDiagnostic(ctx, d);
  }
}

export function logDiagnostic(ctx: PluginContext, d: Diagnostic): void {
  const message = `TS${d.code} - ${d.messageText}`;
  const output = { message, ...getLocation(d) };

  switch (d.category) {
    case DiagnosticCategory.Error:
      ctx.error(output);
      break;

    default:
      ctx.warn(output);
      break;
  }
}

export interface ErrorLocationInfo {
  frame?: string;
  loc?: {
    column: number;
    line: number;
  };
  stack?: string;
}

export function getLocation(d: Diagnostic): ErrorLocationInfo {
  // lift from rollup code
  if (!d.start || !d.file) {
    return {};
  }

  let lines = d.file.text.split('\n');

  const pos = d.file.getLineAndCharacterOfPosition(d.start);
  const line = pos.line + 1;
  const column = pos.character;

  const frameStart = Math.max(0, line - 3);
  let frameEnd = Math.min(line + 2, lines.length);

  lines = lines.slice(frameStart, frameEnd);

  while (!/\S/.test(lines[lines.length - 1])) {
    lines.pop();
    frameEnd -= 1;
  }

  const digits = String(frameEnd).length;

  const frame = lines
    .map((str, i) => {
      const isErrorLine = frameStart + i + 1 === line;

      let lineNum = String(i + frameStart + 1);
      while (lineNum.length < digits) lineNum = ` ${lineNum}`;

      if (isErrorLine) {
        const indicator =
          spaces(digits + 2 + tabsToSpaces(str.slice(0, column)).length) + '^';
        return `${lineNum}: ${tabsToSpaces(str)}\n${indicator}`;
      }

      return `${lineNum}: ${tabsToSpaces(str)}`;
    })
    .join('\n');

  return {
    frame,
    loc: { line, column },
    stack: `at ${d.file.fileName}:${line}:${column + 1}`,
  };
}

function spaces(i: number): string {
  return ' '.repeat(i);
}

function tabsToSpaces(str: string): string {
  return str.replace(/^\t+/, match => '  '.repeat(match.length));
}
