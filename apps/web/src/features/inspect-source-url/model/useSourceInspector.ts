import type { SourceReaderInspectOperation } from '@novel-tool/shared';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useSourceCredentialsQuery } from '@/entities/source-credential';
import { useSourceNetworkProfilesQuery } from '@/entities/source-network-profile';
import { runSourceInspection } from '../api/sourceReaderInspectionApi';
import {
  buildSourceInspectionCommand,
  canRunSourceInspection,
  createSourceInspectorForm,
  sourceInspectionNextCursor,
  type SourceInspectorFormState
} from './sourceInspector';

export function useSourceInspector() {
  const credentials = useSourceCredentialsQuery();
  const profiles = useSourceNetworkProfilesQuery();
  const [form, setForm] = useState(createSourceInspectorForm);
  const mutation = useMutation({ mutationFn: runSourceInspection });

  const update = <Key extends keyof SourceInspectorFormState>(
    key: Key,
    value: SourceInspectorFormState[Key]
  ) => setForm((current) => ({ ...current, [key]: value }));

  const selectOperation = (operation: SourceReaderInspectOperation) => {
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
