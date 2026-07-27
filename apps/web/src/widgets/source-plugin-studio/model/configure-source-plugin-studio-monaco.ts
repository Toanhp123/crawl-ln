import type * as Monaco from 'monaco-editor';
import { SOURCE_PLUGIN_STUDIO_SDK_TYPES } from './source-plugin-studio-sdk-types';

let configured = false;

export function configureSourcePluginStudioMonaco(monaco: typeof Monaco) {
  if (configured) return;
  configured = true;

  const compilerOptions: Monaco.languages.typescript.CompilerOptions = {
    allowNonTsExtensions: true,
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true,
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    lib: ['es2022', 'dom'],
    esModuleInterop: true,
    resolveJsonModule: true,
    skipLibCheck: true
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false
  });
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(
    SOURCE_PLUGIN_STUDIO_SDK_TYPES,
    'file:///source-plugin-studio/types/source-plugin-sdk.d.ts'
  );
}
