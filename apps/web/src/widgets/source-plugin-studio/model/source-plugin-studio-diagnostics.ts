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
