import path from 'path';
import {
  Plugin,
  TransformResult,
  PluginContext,
  ResolveIdResult,
  SourceDescription,
} from 'rollup';
import { createFilter } from 'rollup-pluginutils';
import * as ts from 'typescript';
import { LanguageServiceHost } from './LanguageServiceHost';
import { readTsConfig } from './readTsConfig';
import { logDiagnostics } from './logDiagnostic';
import { loadTsLib } from './tslib';

const TSLIB = 'tslib';
const TSLIB_VIRTUAL = '\0tslib.js';

export type FileFilter = string | RegExp | (string | RegExp)[];

export interface RollupPluginTsOptions {
  cwd?: string;
  exclude?: FileFilter | null;
  include?: FileFilter | null;
  tsconfig?: {
    fileName?: string;
    defaults?: {};
    overrides?: {};
  };
}

export default function rollupPluginTs(
  pluginOptions: RollupPluginTsOptions,
): Plugin {
  const filter = createFilter(pluginOptions.include, pluginOptions.exclude);
  const cwd = pluginOptions.cwd || process.cwd();

  let config: ts.ParsedCommandLine;
  let languageServiceHost: LanguageServiceHost;
  let languageService: ts.LanguageService;
  let tslibSource: string;

  return {
    name: 'rollup-plugin-ts',

    async buildStart(this: PluginContext): Promise<void> {
      const cfg = readTsConfig(this, { cwd, ...pluginOptions.tsconfig });
      config = cfg.config;

      languageServiceHost = new LanguageServiceHost(config);
      languageService = ts.createLanguageService(
        languageServiceHost,
        ts.createDocumentRegistry(),
      );

      tslibSource = loadTsLib();
    },

    async load(id: string): Promise<SourceDescription | string | null> {
      if (id === TSLIB_VIRTUAL) {
        return tslibSource;
      }
      return null;
    },

    async resolveId(
      this: PluginContext,
      importee: string,
      importer: string | undefined,
    ): Promise<ResolveIdResult> {
      if (importee === TSLIB) {
        return TSLIB_VIRTUAL;
      }

      if (!importer) {
        return;
      }

      // don't try resolve modules imported by files not processed by this plugin
      if (!languageServiceHost.getScriptVersion(importer)) {
        return;
      }

      const resolveResult = lookupModule(importee, importer, config.options);

      if (resolveResult && !resolveResult.endsWith('.d.ts')) {
        return resolveResult;
      }
    },

    async transform(
      this: PluginContext,
      code: string,
      id: string,
    ): Promise<TransformResult> {
      if (!filter(id)) {
        return;
      }

      languageServiceHost.setScriptSnapshot(id, code);

      const preproc = ts.preProcessFile(code, true, true);
      const diagnostics = languageService.getSyntacticDiagnostics(id);
      logDiagnostics(this, diagnostics);

      const emit = languageService.getEmitOutput(id);

      if (emit.emitSkipped) {
        throw new Error(`emit failed for file ${id}`);
      }

      let map: string | undefined;
      let out: string | undefined;

      for (const file of emit.outputFiles) {
        if (file.name.endsWith('.d.ts')) {
          this.emitFile({
            fileName: path.basename(file.name),
            type: 'asset',
            source: file.text,
          });
        } else if (file.name.endsWith('.d.ts.map')) {
          this.emitFile({
            fileName: path.basename(file.name),
            type: 'asset',
            source: file.text,
          });
        } else if (file.name.endsWith('.map')) {
          if (map) {
            throw new Error(`emit has more than one map file`);
          }
          map = file.text;
        } else {
          if (out) {
            throw new Error(`emit has more than one output file`);
          }
          out = file.text;
        }
      }

      if (!out || !map) {
        throw new Error(`no source emitted`);
      }

      for (const dep of getDependencies(preproc, id, config.options)) {
        this.addWatchFile(dep);
      }

      return {
        code: out,
        map,
      };
    },
  };
}

function getDependencies(
  info: ts.PreProcessedFileInfo,
  filePath: string,
  options: ts.CompilerOptions,
): string[] {
  return info.importedFiles
    .concat(info.referencedFiles)
    .map(x => lookupModule(x.fileName, filePath, options))
    .filter(Boolean) as string[];
}

function lookupModule(
  moduleName: string,
  file: string,
  options: ts.CompilerOptions,
): string | undefined {
  const result = ts.nodeModuleNameResolver(moduleName, file, options, ts.sys);
  return result.resolvedModule && result.resolvedModule.resolvedFileName;
}
