import ts from 'typescript';

import Debug from 'debug';
const debug = Debug('rpts:snapshot');

export interface FileInfo {
  //dependencies: Dependencies;
  snapshot: ts.IScriptSnapshot;
  version: number;
}

export interface SnapshotService {
  addFile(file: string, contents?: string): FileInfo;
  getFile(file: string): FileInfo;
  getFileNames(): string[];
}

export function createSnapshotService(
  config: ts.ParsedCommandLine,
): SnapshotService {
  const files: { [key: string]: FileInfo | undefined } = {};

  const automaticTypes = ts
    .getAutomaticTypeDirectiveNames(config.options, ts.sys)
    .reduce(
      (a, x) => {
        const resolved = ts.resolveTypeReferenceDirective(
          x,
          undefined,
          config.options,
          ts.sys,
        );
        if (
          resolved.resolvedTypeReferenceDirective &&
          resolved.resolvedTypeReferenceDirective.resolvedFileName
        ) {
          debug(
            `auto type directive`,
            resolved.resolvedTypeReferenceDirective.resolvedFileName,
          );
          return a.concat(
            resolved.resolvedTypeReferenceDirective.resolvedFileName,
          );
        }
        return a;
      },
      [] as string[],
    );

  for (const t of automaticTypes) {
    addFile(t);
  }
  for (const f of config.fileNames) {
    addFile(f);
  }

  /**
   * Create a new info structure.
   */
  function makeInfo(
    file: string,
    contents: string | undefined,
    current: FileInfo | undefined,
  ): FileInfo {
    let newContents = true;

    if (typeof contents === 'undefined') {
      newContents = false;
      contents = ts.sys.readFile(file, 'utf8');
      if (!contents) {
        throw new Error(`can't read file ${file}`);
      }
    }

    let snapshot: ts.IScriptSnapshot;

    if (newContents || !current) {
      snapshot = ts.ScriptSnapshot.fromString(contents);
    } else {
      return current;
    }

    if (current) {
      const change = snapshot.getChangeRange(current.snapshot);
      debug(`change`, change);

      if (!change) {
        snapshot.dispose && snapshot.dispose();
        return current;
      }
    }
    return {
      // dependencies: getDependencies(
      //   ts.preProcessFile(contents, true, true),
      //   file,
      //   config.options,
      // ),
      snapshot,
      version: current ? current.version + 1 : 1,
    };
  }

  /**
   * Add a file to the snapshot service.
   */
  function addFile(file: string, contents?: string): FileInfo {
    debug(`addFile ${file}`);

    const current = files[file];
    const added = makeInfo(file, contents, current);
    files[file] = added;

    if (added !== current) {
      if (current) {
        current.snapshot.dispose && current.snapshot.dispose();
      }
    }

    return added;
  }

  /**
   * Get info about a file.
   */
  function getFile(file: string): FileInfo {
    return files[file] || addFile(file);
  }

  /**
   * Get a list of all file names.
   */
  function getFileNames(): string[] {
    return Object.keys(files);
  }

  return {
    addFile,
    getFile,
    getFileNames,
  };
}
