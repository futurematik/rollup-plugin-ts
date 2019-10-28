import ts from 'typescript';
import { PluginContext } from 'rollup';
import { SnapshotService } from './SnapshotService';
import { logDiagnostics } from './logDiagnostic';
import { Dependencies, getDependencies } from './resolver';

import Debug from 'debug';
const debug = Debug('rpts:emit');

export interface EmitOutput {
  code: string;
  map?: string;
  watch: string[];
}

export interface EmitService {
  getEmit(ctx: PluginContext, source: string, code: string): EmitOutput;
  getAllDeclarations(): [string, string][];
  getAllDeclarationMaps(): [string, string][];
}

interface FileMap {
  [filePath: string]: string;
}

interface EmitCacheItem {
  dependencies: Dependencies;
  outputs: FileMap;
  version: number;
}

export function createEmitService(
  languageService: ts.LanguageService,
  snapshots: SnapshotService,
  options: ts.CompilerOptions,
): EmitService {
  const cache: { [key: string]: EmitCacheItem } = {};

  /**
   * Get the output files for the given source.
   */
  function compile(ctx: PluginContext, source: string): FileMap {
    debug(`compile ${source}`);

    logDiagnostics(ctx, [
      ...languageService.getSyntacticDiagnostics(source),
      ...languageService.getSemanticDiagnostics(source),
    ]);

    const emit = languageService.getEmitOutput(source);

    if (emit.emitSkipped) {
      throw new Error(`emit failed for file ${source}`);
    }

    return emit.outputFiles.reduce((a, x) => ({ ...a, [x.name]: x.text }), {});
  }

  /**
   * Get an item from the cache.
   */
  function getCache(
    ctx: PluginContext,
    source: string,
    code?: string,
  ): EmitCacheItem {
    debug(`getCache ${source}`);
    let current = cache[source];
    const info = snapshots.addFile(source, code);

    if (!current || current.version < info.version) {
      cache[source] = current = {
        dependencies: getDependencies(
          ts.preProcessFile(
            code || info.snapshot.getText(0, info.snapshot.getLength()),
            true,
            true,
          ),
          source,
          options,
        ),
        outputs: compile(ctx, source),
        version: info.version,
      };

      for (const dep of current.dependencies.local) {
        // make sure the local deps are in the cache
        getCache(ctx, dep);
      }
    }

    return current;
  }

  function getEmit(
    ctx: PluginContext,
    source: string,
    code: string,
  ): EmitOutput {
    debug(`getEmit ${source}`);
    const cache = getCache(ctx, source, code);
    const outputs = Object.entries(cache.outputs);

    const [, mainOutput] = outputs.find(([k]) => k.endsWith('.js')) || [];
    const [, mapOutput] = outputs.find(([k]) => k.endsWith('.js.map')) || [];

    if (!mainOutput) {
      throw new Error(`${source}: no output emitted`);
    }

    return {
      code: mainOutput,
      map: mapOutput,
      watch: cache.dependencies.local
        .concat(cache.dependencies.externalTs)
        .concat(cache.dependencies.externalOther),
    };
  }

  function getAllDeclarations(): [string, string][] {
    debug(`getAllDeclarations`);

    return Object.values(cache).reduce(
      (a, x) => [
        ...a,
        ...Object.entries(x.outputs).filter(([k]) => k.endsWith('.d.ts')),
      ],
      [] as [string, string][],
    );
  }

  function getAllDeclarationMaps(): [string, string][] {
    debug(`getAllDeclarationMaps`);

    return Object.values(cache).reduce(
      (a, x) => [
        ...a,
        ...Object.entries(x.outputs).filter(([k]) => k.endsWith('.d.ts.map')),
      ],
      [] as [string, string][],
    );
  }

  return {
    getEmit,
    getAllDeclarations,
    getAllDeclarationMaps,
  };
}
