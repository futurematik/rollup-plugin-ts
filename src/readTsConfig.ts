import path from 'path';
import ts from 'typescript';
import merge from 'lodash.merge';
import { PluginContext } from 'rollup';
import { logDiagnostic, logDiagnostics } from './logDiagnostic';

export interface TsConfigOptions {
  cwd?: string;
  fileName?: string;
  defaults?: {};
  overrides?: {};
}

export interface TsConfigResult {
  config: ts.ParsedCommandLine;
  configPath?: string;
}

export function readTsConfig(
  ctx: PluginContext,
  options: TsConfigOptions = {},
): TsConfigResult {
  const {
    cwd = process.cwd(),
    defaults = {},
    fileName,
    overrides = {},
  } = options;

  const filePath = ts.findConfigFile(cwd, ts.sys.fileExists, fileName);

  if (fileName && !filePath) {
    // name was explicitly provided so fail
    throw new Error(`failed to open tsconfig: ${fileName}`);
  }

  let loadedConfig = defaults;
  let baseDir = cwd;

  if (filePath) {
    baseDir = path.dirname(filePath);

    const configText = ts.sys.readFile(filePath);
    if (!configText) {
      throw new Error(`failed to read tsconfig: ${filePath}`);
    }

    const configJsonResult = ts.parseConfigFileTextToJson(filePath, configText);
    if (configJsonResult.error) {
      logDiagnostic(ctx, configJsonResult.error);
    }

    loadedConfig = mergeConfig(loadedConfig, configJsonResult.config);
  }

  loadedConfig = mergeConfig(loadedConfig, overrides);
  const parsedConfig = ts.parseJsonConfigFileContent(
    loadedConfig,
    ts.sys,
    baseDir,
    undefined,
    filePath,
  );

  if (parsedConfig.errors && parsedConfig.errors.length) {
    logDiagnostics(ctx, parsedConfig.errors);
  }

  return {
    config: parsedConfig,
    configPath: filePath,
  };
}

function mergeConfig(...config: {}[]): {} {
  return merge({}, ...config);
}
