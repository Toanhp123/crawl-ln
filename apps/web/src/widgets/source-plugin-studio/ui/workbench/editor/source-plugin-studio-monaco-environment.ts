import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import TypeScriptWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import { configureSourcePluginStudioMonacoEnvironment } from '../../../model/configure-source-plugin-studio-monaco-environment';

configureSourcePluginStudioMonacoEnvironment(globalThis, {
  editor: () => new EditorWorker(),
  json: () => new JsonWorker(),
  typescript: () => new TypeScriptWorker()
});
