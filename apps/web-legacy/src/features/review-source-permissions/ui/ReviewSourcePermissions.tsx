import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  approveSourcePluginPermissions,
  denySourcePluginPermissions,
  useSourcePluginPermissionsQuery
} from '@/entities/source-plugin';
import { queryKeys } from '@/shared/api/queryKeys';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { Button, EmptyState, ErrorBanner, ListRow, LoadingState, Panel, toast } from '@/shared/ui';
export function ReviewSourcePermissions({
  pluginId,
  version
}: {
  pluginId: string;
  version?: string;
}) {
  const { t, errorMessage } = useI18n();
  const client = useQueryClient();
  const query = useSourcePluginPermissionsQuery(pluginId);
  const action = useMutation({
    mutationFn: ({ approved }: { approved: boolean }) => {
      if (!version) throw new Error(t('sources.plugins.activeVersionRequired'));
      return approved
        ? approveSourcePluginPermissions(pluginId, version)
        : denySourcePluginPermissions(pluginId, version);
    },
    onSuccess: (_d, { approved }) => {
      toast({
        kind: 'success',
        title: t(
          approved ? 'sources.plugins.permissionApproved' : 'sources.plugins.permissionDenied'
        )
      });
      void client.invalidateQueries({
        queryKey: queryKeys.sourceReader.pluginPermissions(pluginId)
      });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugin(pluginId) });
      void client.invalidateQueries({ queryKey: queryKeys.sourceReader.plugins() });
    },
    onError: (error) =>
      toast({ kind: 'error', title: t('sources.updateFailed'), description: errorMessage(error) })
  });
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  return (
    <Panel tone="default" className="space-y-3">
      {query.data?.length ? (
        query.data.map((permission, index) => (
          <ListRow
            key={`${permission.permission ?? 'permission'}-${index}`}
            title={permission.permission ?? permission.scope ?? `Permission ${index + 1}`}
            description={permission.scope ?? permission.status ?? ''}
          />
        ))
      ) : (
        <EmptyState title={t('sources.plugins.noPermissions')} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          actionState={action.variables?.approved ? action.status : 'idle'}
          disabled={!version}
          onClick={() => action.mutate({ approved: true })}
        >
          {t('sources.plugins.approve')}
        </Button>
        <Button
          variant="danger"
          actionState={action.variables?.approved === false ? action.status : 'idle'}
          disabled={!version}
          onClick={() => action.mutate({ approved: false })}
        >
          {t('sources.plugins.deny')}
        </Button>
      </div>
    </Panel>
  );
}
