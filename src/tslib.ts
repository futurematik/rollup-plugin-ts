import fs from 'fs';
import path from 'path';

export function loadTsLib(): string {
  const pkg = JSON.parse(fs.readFileSync(findPackageJson('tslib'), 'utf8'));

  if (!pkg.module) {
    throw new Error(`can't find ESM source for tslib`);
  }
  const modulePath = require.resolve('tslib/' + pkg.module);
  return fs.readFileSync(modulePath, 'utf8');
}

function findPackageJson(name: string): string {
  const start = path.dirname(require.resolve(name));

  for (
    let dir = start;
    path.basename(dir) !== 'node_modules' && dir !== path.dirname(dir);
    dir = path.dirname(dir)
  ) {
    const pkgPath = path.join(dir, 'package.json');

    if (fs.existsSync(pkgPath)) {
      return pkgPath;
    }
  }

  throw new Error(`can't find package.json for package '${name}'`);
}
