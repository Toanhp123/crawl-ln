import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useSourcePluginPermissions,
  type SourcePluginUsageConflict
} from '../../../entities/source-plugin';
import { useI18n } from '../../../shared/i18n';
import {
  Button,
  EmptyState,
  ErrorBanner,
  ListRow,
  LoadingState,
  Modal,
  Panel
} from '../../../shared/ui';
import { formatSourcePluginPermissionScope } from '../model/format-source-plugin-permission-scope';
import { useReviewSourcePermissions } from '../model/use-review-source-permissions';

export function ReviewSourcePermissions({
  pluginId,
  version
}: {
  pluginId: string;
  version: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [usageConflict, setUsageConflict] = useState<SourcePluginUsageConflict | null>(null);
  const query = useSourcePluginPermissions(pluginId);
  const action = useReviewSourcePermissions(pluginId, version, setUsageConflict);
  if (query.isLoading) return <LoadingState />;
  if (query.error) return <ErrorBanner error={query.error} />;
  return (
    <>
      <Panel tone="default" className="space-y-3">
        {query.data?.length ? (
          query.data.map((permission, index) => {
            const scope = formatSourcePluginPermissionScope(permission.scope);
            return (
              <ListRow
                key={`${permission.pluginVersion ?? version}-${permission.permission ?? index}`}
                title={(permission.permission ?? scope) || `Permission ${index + 1}`}
                description={scope || permission.status || ''}
              />
            );
          })
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
      <Modal
        open={Boolean(usageConflict)}
        onOpenChange={(open) => {
          if (!open) setUsageConflict(null);
        }}
        title={t('reviewSourcePermissions.denyUsageConflictTitle')}
        description={
          usageConflict
            ? t('reviewSourcePermissions.denyUsageConflict', {
                count: usageConflict.blockingJobCount
              })
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setUsageConflict(null)}>
              {t('common.close')}
            </Button>
            <Button
              onClick={() => {
                setUsageConflict(null);
                navigate('/activity');
              }}
            >
              {t('reviewSourcePermissions.goToTasks')}
            </Button>
          </div>
        }
      />
    </>
  );
}
