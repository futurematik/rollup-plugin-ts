# rollup-plugin-ts

A better plugin to use Typescript with Rollup.

## Options

```typescript
interface RollupPluginTsOptions {
  cwd?: string;
  exclude?: FileFilter | null;
  include?: FileFilter | null;
  tsconfig?: {
    fileName?: string;
    defaults?: {};
    overrides?: {};
  };
}
```
