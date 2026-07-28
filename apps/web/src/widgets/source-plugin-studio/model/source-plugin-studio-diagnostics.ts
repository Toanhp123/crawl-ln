export type SourcePluginStudioDiagnosticSeverity = 'error' | 'warning';

export interface SourcePluginStudioDiagnostic {
  path: string;
  severity: SourcePluginStudioDiagnosticSeverity;
  message: string;
  line: number;
  column: number;
}

export interface SourcePluginStudioDiagnosticSummary {
  errors: number;
  warnings: number;
  total: number;
}

export type SourcePluginStudioDiagnosticsByPath = Record<
  string,
  SourcePluginStudioDiagnosticSummary
>;

export function summarizeSourcePluginStudioDiagnostics(
  diagnostics: SourcePluginStudioDiagnostic[]
): SourcePluginStudioDiagnosticSummary {
  let errors = 0;
  let warnings = 0;
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') errors += 1;
    else warnings += 1;
  }
  return { errors, warnings, total: diagnostics.length };
}

export function summarizeSourcePluginStudioDiagnosticsByPath(
  diagnostics: SourcePluginStudioDiagnostic[]
): SourcePluginStudioDiagnosticsByPath {
  const grouped: SourcePluginStudioDiagnosticsByPath = {};
  for (const diagnostic of diagnostics) {
    const current = grouped[diagnostic.path] ?? { errors: 0, warnings: 0, total: 0 };
    if (diagnostic.severity === 'error') current.errors += 1;
    else current.warnings += 1;
    current.total += 1;
    grouped[diagnostic.path] = current;
  }
  return grouped;
}
