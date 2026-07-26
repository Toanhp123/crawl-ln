import { useSourcePluginPermissions } from '../../../entities/source-plugin';
import { getPublicErrorDescription } from '../../../shared/api';
import { useI18n } from '../../../shared/i18n';
import { Button, EmptyState, ErrorBanner, ListRow, LoadingState, Panel } from '../../../shared/ui';
import { useReviewSourcePermissions } from '../model/use-review-source-permissions';

export function ReviewSourcePermissions({
  pluginId,
  version
}: {
  pluginId: string;
  version: string;
}) {
  const { t } = useI18n();
  const query = useSourcePluginPermissions(pluginId);
  const action = useReviewSourcePermissions(pluginId, version);
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorBanner error={getPublicErrorDescription(query.error)} />;
  return (
    <Panel tone="default" className="space-y-3">
      {query.data?.length ? (
        query.data.map((permission, index) => (
          <ListRow
            key={`${permission.permission ?? permission.scope ?? 'permission'}-${index}`}
            title={permission.permission ?? permission.scope ?? `Permission ${index + 1}`}
            description={permission.scope ?? permission.status ?? ''}
          />
        ))
      ) : (
        <EmptyState title={t('reviewSourcePermissions.empty')} />
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          actionState={action.variables === true ? action.status : 'idle'}
          onClick={() => action.mutate(true)}
        >
          {t('reviewSourcePermissions.approve')}
        </Button>
        <Button
          variant="danger"
          actionState={action.variables === false ? action.status : 'idle'}
          onClick={() => action.mutate(false)}
        >
          {t('reviewSourcePermissions.deny')}
        </Button>
      </div>
    </Panel>
  );
}
