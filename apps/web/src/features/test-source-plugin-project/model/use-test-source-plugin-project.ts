import { useMutation } from '@tanstack/react-query';
import { testSourcePluginProject } from '../api/test-source-plugin-project';

export function useTestSourcePluginProject() {
  return useMutation({ mutationFn: testSourcePluginProject });
}
