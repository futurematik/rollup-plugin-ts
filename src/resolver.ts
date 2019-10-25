import ts from 'typescript';

import Debug from 'debug';
const debug = Debug('rpts:resolver');

export function getDependencies(
  info: ts.PreProcessedFileInfo,
  filePath: string,
  options: ts.CompilerOptions,
  tsOnly = false,
): string[] {
  debug(`getDependencies`, info);
  return info.importedFiles
    .concat(info.referencedFiles)
    .map(x => resolveModulePath(x.fileName, filePath, options))
    .filter(x => x && (!tsOnly || x.endsWith('.ts'))) as string[];
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
