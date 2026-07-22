import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useSourceCredentials } from '../../../entities/source-credential';
import { useSourceNetworkProfiles } from '../../../entities/source-network-profile';
import { runSourceInspection } from '../api/source-reader-inspection';
import {
  buildSourceInspectionCommand,
  canRunSourceInspection,
  createSourceInspectorForm,
  sourceInspectionNextCursor,
  type SourceInspectorFormState
} from './source-inspector';
export function useSourceInspector() {
  const credentials = useSourceCredentials();
  const profiles = useSourceNetworkProfiles();
  const [form, setForm] = useState(createSourceInspectorForm);
  const mutation = useMutation({ mutationFn: runSourceInspection });
  const update = <Key extends keyof SourceInspectorFormState>(
    key: Key,
    value: SourceInspectorFormState[Key]
  ) => setForm((current) => ({ ...current, [key]: value }));
  const selectOperation = (operation: SourceInspectorFormState['operation']) => {
    update('operation', operation);
    mutation.reset();
  };
  const run = (nextCursor?: string) =>
    mutation.mutate(buildSourceInspectionCommand(form, nextCursor));
  return {
    form,
    update,
    selectOperation,
    credentials,
    profiles,
    mutation,
    run,
    canRun: canRunSourceInspection(form),
    nextCursor: sourceInspectionNextCursor(mutation.data)
  };
}
export type SourceInspectorController = ReturnType<typeof useSourceInspector>;
