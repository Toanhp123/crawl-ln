import {
  useSourcePluginDiagnostics,
  useSourcePluginHealth,
  useSourcePlugins
} from '@/entities/source-plugin';
import {
  ActivateLatestSourcePluginButton,
  RemoveSourcePluginButton,
  SourcePluginEnableSwitch
} from '@/features/manage-source-plugins';
import { ReviewSourcePermissions } from '@/features/review-source-permissions';
import { TestSourcePluginButton } from '@/features/test-source-plugin';
import { useI18n } from '@/shared/i18n';
import { Badge, EmptyState, ErrorBanner, LoadingState, Panel, Section, Text } from '@/shared/ui';

export function SourcePluginDetails({ pluginId }: { pluginId: string }) {
  const { status, t } = useI18n();
  const plugins = useSourcePlugins();
  const plugin = plugins.data?.find((item) => item.id === pluginId);
  const diagnostics = useSourcePluginDiagnostics(pluginId);
  const health = useSourcePluginHealth(pluginId);

  if (plugins.isLoading) return <LoadingState />;
  if (plugins.error) return <ErrorBanner error={plugins.error} />;
  if (!plugin) return <EmptyState title={t('sources.profile.notFound')} />;

  return (
    <div className="space-y-5">
      <Panel tone="default" padding="lg" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Text as="h2" variant="headline">
              {plugin.name}
            </Text>
            <Text as="p" variant="supporting" tone="muted">
              {plugin.domains.join(', ') || plugin.id}
            </Text>
          </div>
          <Badge
            tone={
              plugin.status === 'active'
                ? 'success'
                : plugin.status === 'failed' || plugin.status === 'quarantined'
                  ? 'danger'
                  : 'warning'
            }
          >
            {status(plugin.status)}
          </Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Panel tone="inset">
            <Text as="p" variant="label">
              {t('sources.plugins.latestVersion')}
            </Text>
            <Text as="p" variant="supporting">
              {plugin.latestVersion}
            </Text>
          </Panel>
          {plugin.activeVersion && plugin.activeVersion !== plugin.latestVersion ? (
            <Panel tone="inset">
              <Text as="p" variant="label">
                {t('sources.plugins.runningVersion')}
              </Text>
              <Text as="p" variant="supporting">
                {plugin.activeVersion}
              </Text>
            </Panel>
          ) : null}
          <Panel tone="inset">
            <Text as="p" variant="label">
              {t('sources.trust')}
            </Text>
            <Text as="p" variant="supporting">
              {status(plugin.trustLevel)}
            </Text>
          </Panel>
        </div>
        <SourcePluginEnableSwitch plugin={plugin} />
        <div className="flex flex-wrap gap-2">
          <ActivateLatestSourcePluginButton plugin={plugin} />
          <TestSourcePluginButton pluginId={plugin.id} disabled={!plugin.enabled} />
          <RemoveSourcePluginButton pluginId={plugin.id} />
        </div>
      </Panel>
      <Section title={t('sources.plugins.diagnostics')}>
        {diagnostics.isLoading ? (
          <LoadingState />
        ) : diagnostics.error ? (
          <ErrorBanner error={diagnostics.error} />
        ) : (
          <Panel tone="default" className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Panel tone="inset">
                <Text as="p" variant="label">
                  {t('sources.plugins.runtime')}
                </Text>
                <Text as="p" variant="supporting">
                  {diagnostics.data?.runtimeVersion ?? '—'} · RPC{' '}
                  {diagnostics.data?.sandboxProtocolVersion ?? '—'}
                </Text>
              </Panel>
              <Panel tone="inset">
                <Text as="p" variant="label">
                  {t('sources.health')}
                </Text>
                <Text as="p" variant="supporting">
                  {status(
                    diagnostics.data?.lastHealth?.status ?? plugin.health?.status ?? 'unknown'
                  )}
                </Text>
              </Panel>
            </div>
            {diagnostics.data?.compatibilityIssues.length ? (
              diagnostics.data.compatibilityIssues.map((issue) => (
                <Panel key={`${issue.code}-${issue.path}`} tone="inset">
                  <div className="flex items-center gap-2">
                    <Badge tone={issue.severity === 'fatal' ? 'danger' : 'warning'}>
                      {issue.code}
                    </Badge>
                    <Text variant="caption" tone="muted">
                      {issue.path}
                    </Text>
                  </div>
                  <Text as="p" variant="supporting" className="mt-2">
                    {issue.message}
                  </Text>
                </Panel>
              ))
            ) : (
              <EmptyState title={t('sources.plugins.noDiagnostics')} />
            )}
          </Panel>
        )}
      </Section>
      <Section title={t('sources.health')}>
        {health.isLoading ? (
          <LoadingState />
        ) : health.error ? (
          <ErrorBanner error={health.error} />
        ) : (
          <Panel tone="inset">
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap type-metadata">
              {JSON.stringify(health.data, null, 2)}
            </pre>
          </Panel>
        )}
      </Section>
      <Section
        title={t('sources.permissions')}
        description={t('sources.plugins.permissionsDescription')}
      >
        <ReviewSourcePermissions pluginId={plugin.id} version={plugin.latestVersion} />
      </Section>
    </div>
  );
}
