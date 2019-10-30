import path from 'path';
import { PluginContext } from 'rollup';
import * as ts from 'typescript';

export function logDiagnostics(
  ctx: PluginContext,
  diagnostics: ts.Diagnostic[],
): void {
  const err = diagnostics.reduce(
    (a, d) => a || logDiagnostic(ctx, d, true),
    false,
  );
  if (err) {
    ctx.error({ message: 'stopping due to errors', stack: '', frame: '' });
  }
}

export function logDiagnostic(
  ctx: PluginContext,
  d: ts.Diagnostic,
  noError = false,
): boolean {
  const flatMessage = ts.flattenDiagnosticMessageText(d.messageText, '\n');
  const message = `TS${d.code} - ${flatMessage}`;
  const output = { message, ...getLocation(d) };

  if (noError) {
    ctx.warn(output);
  } else {
    switch (d.category) {
      case ts.DiagnosticCategory.Error:
        ctx.error(output);
        break;

      default:
        ctx.warn(output);
        break;
    }
  }

  return d.category === ts.DiagnosticCategory.Error;
}

export interface ErrorLocationInfo {
  frame?: string;
  loc?: {
    column: number;
    file: string;
    line: number;
  };
  stack?: string;
}

export function getLocation(d: ts.Diagnostic): ErrorLocationInfo {
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
    .concat(`${path.resolve(d.file.fileName)}:${line}:${column + 1}`)
    .join('\n');

  return {
    frame,
    loc: { line, file: d.file.fileName, column },
    stack: ``,
  };
}

function spaces(i: number): string {
  return ' '.repeat(i);
}

function tabsToSpaces(str: string): string {
  return str.replace(/^\t+/, match => '  '.repeat(match.length));
}
