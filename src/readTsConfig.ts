import path from 'path';
import ts from 'typescript';
import merge from 'lodash.merge';
import { PluginContext } from 'rollup';
import { logDiagnostic, logDiagnostics } from './logDiagnostic';

import Debug from 'debug';
const debug = Debug('rpts:config');

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

  loadedConfig = mergeConfig(loadedConfig, overrides, {
    compilerOptions: {
      //importHelpers: true,
      moduleResolution: 'node',
    },
  });

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

  applyOverrides(parsedConfig);
  checkConfig(ctx, filePath, parsedConfig);
  debug(`tsconfig`, parsedConfig);

  return {
    config: parsedConfig,
    configPath: filePath,
  };
}

function mergeConfig(...config: {}[]): {} {
  return merge({}, ...config);
}

function applyOverrides(config: ts.ParsedCommandLine): void {
  config.options.noEmit = false;
}

const esmModuleKinds = [ts.ModuleKind.ES2015, ts.ModuleKind.ESNext];

function checkConfig(
  ctx: PluginContext,
  filePath: string | undefined,
  config: ts.ParsedCommandLine,
): void {
  let errors = false;

  if (
    !config.options.module ||
    esmModuleKinds.indexOf(config.options.module) < 0
  ) {
    errors = true;

    ctx.warn({
      message: `compilerOptions.module MUST be set to an ESM-compatible value`,
      loc: { file: filePath, column: 0, line: 0 },
    });
  }
  if (!config.options.importHelpers) {
    ctx.warn({
      message: `you should set compilerOptions.importHelpers to true`,
      loc: { file: filePath, column: 0, line: 0 },
    });
  }

  if (errors) {
    ctx.error({ message: 'stopping due to errors', stack: '', frame: '' });
  }
}
