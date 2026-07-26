interface SourcePluginStudioMonacoEnvironment {
  getWorker?: (workerId: string, label: string) => Worker;
}

interface SourcePluginStudioMonacoTarget {
  MonacoEnvironment?: SourcePluginStudioMonacoEnvironment;
}

interface SourcePluginStudioMonacoWorkerFactories {
  editor: () => Worker;
  json: () => Worker;
  typescript: () => Worker;
}

export function configureSourcePluginStudioMonacoEnvironment(
  target: object,
  factories: SourcePluginStudioMonacoWorkerFactories
) {
  const monacoTarget = target as SourcePluginStudioMonacoTarget;
  monacoTarget.MonacoEnvironment = {
    ...monacoTarget.MonacoEnvironment,
    getWorker(_workerId, label) {
      if (label === 'json') return factories.json();
      if (label === 'typescript' || label === 'javascript') return factories.typescript();
      return factories.editor();
    }
  };
}
