import ts from 'typescript';

import Debug from 'debug';
const debug = Debug('rpts:resolver');

export interface Dependencies {
  local: string[];
  externalTs: string[];
  externalOther: string[];
}

export function getAllDependencies(
  info: ts.PreProcessedFileInfo,
  filePath: string,
  options: ts.CompilerOptions,
): string[] {
  const deps = getDependencies(info, filePath, options);
  return deps.local.concat(deps.externalTs).concat(deps.externalOther);
}

export function getDependencies(
  info: ts.PreProcessedFileInfo,
  filePath: string,
  options: ts.CompilerOptions,
): Dependencies {
  debug(`getDependencies`, info);

  const deps = info.importedFiles.concat(info.referencedFiles);

  const ret: Dependencies = { local: [], externalTs: [], externalOther: [] };

  for (const dep of deps) {
    const resolved = resolveModule(dep.fileName, filePath, options);
    if (!resolved) {
      continue;
    }
    if (resolved.isExternalLibraryImport) {
      if (resolved.resolvedFileName.endsWith('.ts')) {
        ret.externalTs.push(resolved.resolvedFileName);
      } else {
        ret.externalOther.push(resolved.resolvedFileName);
      }
    } else {
      ret.local.push(resolved.resolvedFileName);
    }
  }

  return ret;
}

export function resolveModulePath(
  moduleName: string,
  file: string,
  options: ts.CompilerOptions,
): string | undefined {
  const result = resolveModule(moduleName, file, options);
  return result && result.resolvedFileName;
}

export function resolveModule(
  moduleName: string,
  file: string,
  options: ts.CompilerOptions,
): ts.ResolvedModule | undefined {
  const result = ts.nodeModuleNameResolver(moduleName, file, options, ts.sys);
  debug(
    `ref ${file} -> ${moduleName}:`,
    result.resolvedModule && result.resolvedModule.resolvedFileName,
  );
  return result.resolvedModule;
}
