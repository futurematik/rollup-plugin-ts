import * as ts from 'typescript';

interface FileInfo {
  snapshot: ts.IScriptSnapshot;
  version: number;
}

export class LanguageServiceHost implements ts.LanguageServiceHost {
  private readonly fileInfo: { [file: string]: FileInfo } = {};

  constructor(
    private readonly config: ts.ParsedCommandLine,
    private readonly cwd = process.cwd(),
  ) {}

  getCompilationSettings(): ts.CompilerOptions {
    return this.config.options;
  }

  getScriptFileNames(): string[] {
    return Object.keys(this.fileInfo);
  }

  getScriptVersion(fileName: string): string {
    const info = this.fileInfo[fileName];
    return ((info && info.version) || 0).toString();
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    if (!(fileName in this.fileInfo)) {
      const src = ts.sys.readFile(fileName);
      if (!src) {
        return;
      }
      this.fileInfo[fileName] = {
        snapshot: ts.ScriptSnapshot.fromString(src),
        version: 1,
      };
    }
    return this.fileInfo[fileName].snapshot;
  }

  getCurrentDirectory(): string {
    return this.cwd;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    return ts.getDefaultLibFilePath(options);
  }

  setScriptSnapshot(fileName: string, src: string): ts.IScriptSnapshot {
    const snapshot = ts.ScriptSnapshot.fromString(src);
    const current = this.fileInfo[fileName];

    this.fileInfo[fileName] = current
      ? { snapshot, version: current.version + 1 }
      : { snapshot, version: 1 };

    return snapshot;
  }
}
