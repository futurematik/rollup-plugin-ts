import * as ts from 'typescript';
import {
  createSnapshotService,
  SnapshotService,
  FileInfo,
} from './SnapshotService';

import Debug from 'debug';
import { resolveModule } from './resolver';
const debug = Debug('rpts:host');

export class LanguageServiceHost implements ts.LanguageServiceHost {
  private readonly snapshots: SnapshotService;

  constructor(
    private readonly config: ts.ParsedCommandLine,
    private readonly cwd = process.cwd(),
  ) {
    this.snapshots = createSnapshotService(config);
  }

  getCompilationSettings(): ts.CompilerOptions {
    debug(`getCompilationSettings`);
    return this.config.options;
  }

  getScriptFileNames(): string[] {
    debug(`getScriptFileNames`);
    return this.snapshots.getFileNames();
  }

  getScriptVersion(fileName: string): string {
    const version = this.snapshots.getFile(fileName).version;
    debug(`getScriptVersion ${fileName} = ${version}`);
    return version.toString();
  }

  getScriptSnapshot(fileName: string): ts.IScriptSnapshot | undefined {
    debug(`getScriptSnapshot ${fileName}`);
    return this.snapshots.getFile(fileName).snapshot;
  }

  getCurrentDirectory(): string {
    debug(`getCurrentDirectory`);
    return this.cwd;
  }

  getDefaultLibFileName(options: ts.CompilerOptions): string {
    debug(`getDefaultLibFileName`);
    return ts.getDefaultLibFilePath(options);
  }

  resolveModuleNames(
    moduleNames: string[],
    containingFile: string,
    reusedNames: string[] | undefined,
    redirectedReference: ts.ResolvedProjectReference | undefined,
    options: ts.CompilerOptions,
  ): (ts.ResolvedModule | undefined)[] {
    debug(`resolveModuleNames for ${containingFile}`, moduleNames);
    return moduleNames.map(x => resolveModule(x, containingFile, options));
  }

  resolveTypeReferenceDirectives(
    typeDirectiveNames: string[],
    containingFile: string,
    redirectedReference: ts.ResolvedProjectReference | undefined,
    options: ts.CompilerOptions,
  ): (ts.ResolvedTypeReferenceDirective | undefined)[] {
    debug(
      `resolveTypeReferenceDirectives for ${containingFile}`,
      typeDirectiveNames,
    );
    return typeDirectiveNames.map(x => {
      const result = ts.resolveTypeReferenceDirective(
        x,
        containingFile,
        options,
        ts.sys,
        redirectedReference,
      );
      return result.resolvedTypeReferenceDirective;
    });
  }

  setScriptSnapshot(fileName: string, src: string): FileInfo {
    debug(`setScriptSnapshot ${fileName}`);
    return this.snapshots.addFile(fileName, src);
  }
}
