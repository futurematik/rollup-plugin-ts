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

import Debug from 'debug';
import { resolveModulePath } from './resolver';
const debug = Debug('rpts:main');

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
  pluginOptions: RollupPluginTsOptions = {},
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
      debug(`build start`);

      const cfg = readTsConfig(this, { cwd, ...pluginOptions.tsconfig });
      config = cfg.config;

      languageServiceHost = new LanguageServiceHost(config, cwd);
      languageService = ts.createLanguageService(
        languageServiceHost,
        ts.createDocumentRegistry(),
      );

      tslibSource = loadTsLib();
    },

    async load(id: string): Promise<SourceDescription | string | null> {
      debug(`load ${id}`);

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
      debug(`resolveId '${importee}' (from '${importer}')`);

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

      const resolveResult = resolveModulePath(
        importee,
        importer,
        config.options,
      );

      if (resolveResult && !resolveResult.endsWith('.d.ts')) {
        return resolveResult;
      }
    },

    async transform(
      this: PluginContext,
      code: string,
      id: string,
    ): Promise<TransformResult> {
      debug(`transform ${id}`);

      if (!filter(id)) {
        return;
      }

      const fileInfo = languageServiceHost.setScriptSnapshot(id, code);

      const diagnostics = [
        ...languageService.getSyntacticDiagnostics(id),
        ...languageService.getSemanticDiagnostics(id),
      ];
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

      for (const dep of fileInfo.references) {
        this.addWatchFile(dep);
      }

      return {
        code: out,
        map,
      };
    },
  };
}
