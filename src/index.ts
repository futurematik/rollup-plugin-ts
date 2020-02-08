import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import _mkdirp from 'mkdirp';
import {
  Plugin,
  TransformResult,
  PluginContext,
  ResolveIdResult,
  SourceDescription,
} from 'rollup';
import normalizePath from 'normalize-path';
import * as ts from 'typescript';
import { LanguageServiceHost } from './LanguageServiceHost';
import { readTsConfig } from './readTsConfig';
import { loadTsLib } from './tslib';
import { EmitService, createEmitService } from './EmitService';

import { resolveModulePath } from './resolver';
import { createSnapshotService, SnapshotService } from './SnapshotService';

import Debug from 'debug';

const mkdirp = promisify(_mkdirp);
const writeFile = promisify(fs.writeFile);
const debug = Debug('rpts:main');
const traceInput = Debug('rpts-trace:input');
const traceOutput = Debug('rpts-trace:output');

const TSLIB = 'tslib';
const TSLIB_VIRTUAL = '\0tslib.js';

export type FileFilter = string | RegExp | (string | RegExp)[];

export interface RollupPluginTsOptions {
  cwd?: string;
  tsconfig?: {
    fileName?: string;
    defaults?: {};
    overrides?: {};
  };
}

export default function rollupPluginTs(
  pluginOptions: RollupPluginTsOptions = {},
): Plugin {
  const cwd = pluginOptions.cwd || process.cwd();

  let config: ts.ParsedCommandLine;
  let snapshotService: SnapshotService;
  let languageServiceHost: LanguageServiceHost;
  let languageService: ts.LanguageService;
  let emitService: EmitService;
  let tslibSource: string;

  const filter = (id: string): boolean => config.fileNames.includes(id);

  return {
    name: 'rollup-plugin-ts',

    async buildStart(this: PluginContext): Promise<void> {
      debug(`build start`);

      const cfg = readTsConfig(this, { cwd, ...pluginOptions.tsconfig });
      config = cfg.config;

      if (cfg.configPath) {
        this.addWatchFile(cfg.configPath);
      }

      snapshotService = createSnapshotService(config);
      languageServiceHost = new LanguageServiceHost(
        snapshotService,
        config,
        cwd,
      );
      languageService = ts.createLanguageService(
        languageServiceHost,
        ts.createDocumentRegistry(),
      );
      emitService = createEmitService(
        languageService,
        snapshotService,
        config.options,
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
      importee = normalizePath(importee);
      importer = importer && normalizePath(importer);
      debug(`resolveId '${importee}' (from '${importer}')`);

      if (importee === TSLIB) {
        return TSLIB_VIRTUAL;
      }

      if (!importer) {
        return;
      }

      // don't try resolve modules imported by files not processed by this plugin
      if (!snapshotService.hasFile(importer)) {
        debug(`skipping resolve`);
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
      id = normalizePath(id);
      debug(`transform ${id}`);

      if (!filter(id)) {
        debug(`skipping transform`);
        return;
      }

      const { watch, ...emit } = emitService.getEmit(this, id, code);

      for (const dep of watch) {
        this.addWatchFile(dep);
      }

      traceInput(code);
      traceOutput(emit.code);

      return emit;
    },

    async generateBundle(this: PluginContext): Promise<void> {
      debug(`generateBundle`);
      const extraFiles: [string, string][] = [];

      if (config.options.declaration) {
        debug(`including declarations`);
        extraFiles.push(...emitService.getAllDeclarations());

        if (config.options.declarationMap) {
          debug(`including declaration maps`);
          extraFiles.push(...emitService.getAllDeclarationMaps());
        }
      }

      for (const [outpath, output] of extraFiles) {
        debug(`write file '${outpath}'`);
        traceOutput(output);

        const outDir = path.dirname(outpath);
        await mkdirp(outDir);
        await writeFile(outpath, output);
      }
    },
  };
}
