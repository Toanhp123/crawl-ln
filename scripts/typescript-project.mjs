import { dirname } from 'node:path';
import ts from 'typescript';

function formatDiagnostics(diagnostics) {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => process.cwd(),
    getNewLine: () => '\n'
  });
}

function createProject(configPath, compilerOptions = {}) {
  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  if (configFile.error) throw new Error(formatDiagnostics([configFile.error]));

  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    dirname(configPath),
    compilerOptions,
    configPath
  );
  if (parsed.errors.length > 0) throw new Error(formatDiagnostics(parsed.errors));

  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences
  });
}

export function checkTypeScriptProject(configPath, compilerOptions = {}) {
  const diagnostics = ts.getPreEmitDiagnostics(
    createProject(configPath, { ...compilerOptions, noEmit: true })
  );
  if (diagnostics.length > 0) throw new Error(formatDiagnostics(diagnostics));
}

export function emitTypeScriptProject(configPath, compilerOptions = {}) {
  const program = createProject(configPath, { ...compilerOptions, noEmit: false });
  const emit = program.emit();
  const diagnostics = [...ts.getPreEmitDiagnostics(program), ...emit.diagnostics];
  if (diagnostics.length > 0 || emit.emitSkipped) {
    throw new Error(formatDiagnostics(diagnostics));
  }
}
