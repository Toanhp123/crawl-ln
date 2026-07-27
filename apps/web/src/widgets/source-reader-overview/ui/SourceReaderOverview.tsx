import { ChevronRight, KeyRound, Network, Plus, ShieldQuestion } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSourceAuthChallenges } from '@/entities/source-auth-challenge';
import { useSourceCredentials } from '@/entities/source-credential';
import { useSourceNetworkProfiles } from '@/entities/source-network-profile';
import { SourcePluginRow, useSourcePlugins } from '@/entities/source-plugin';
import { SourcePluginEnableSwitch } from '@/features/manage-source-plugins';
import { useConnectionStatus } from '@/shared/realtime';
import { useI18n } from '@/shared/i18n';
import {
  Button,
  EmptyState,
  ErrorBanner,
  LoadingState,
  Panel,
  SearchInput,
  Section,
  StatCard
} from '@/shared/ui';

export function SourceReaderOverview() {
  const { t, number } = useI18n();
  const navigate = useNavigate();
  const connectionState = useConnectionStatus();
  const plugins = useSourcePlugins();
  const credentials = useSourceCredentials();
  const networks = useSourceNetworkProfiles();
  const challenges = useSourceAuthChallenges({ connectionState, pollingIntervalMs: 5_000 });
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return (plugins.data ?? []).filter(
      (plugin) =>
        !value ||
        [plugin.name, plugin.id, ...plugin.domains].some((candidate) =>
          candidate.toLowerCase().includes(value)
        )
    );
  }, [plugins.data, search]);

  return (
    <div className="space-y-5">
      <div className="grid gap-2 sm:grid-cols-3">
        <StatCard
          label={t('sources.credentials')}
          value={number(credentials.data?.length ?? 0)}
          icon={<KeyRound size={16} />}
        />
        <StatCard
          label={t('sources.networkProfiles')}
          value={number(networks.data?.length ?? 0)}
          icon={<Network size={16} />}
        />
        <StatCard
          label={t('sources.authChallenges')}
          value={number(challenges.data?.length ?? 0)}
          icon={<ShieldQuestion size={16} />}
        />
      </div>
      <Section title={t('sources.plugins.summary')}>
        <Panel tone="inset" className="flex items-center gap-2">
          <SearchInput
            className="min-w-0 flex-1"
            value={search}
            onChange={setSearch}
            placeholder={t('sources.plugins.search')}
          />
          <Button
            className="shrink-0"
            size="sm"
            leadingIcon={<Plus size={16} />}
            onClick={() => navigate('/sources/new')}
          >
            {t('sources.plugins.install')}
          </Button>
        </Panel>
        <ErrorBanner error={plugins.error} />
        {plugins.isLoading ? (
          <LoadingState />
        ) : !filtered.length ? (
          <EmptyState title={t('sources.emptyTitle')} description={t('sources.emptyDescription')} />
        ) : (
          <Panel padding="none" tone="default">
            {filtered.map((plugin) => (
              <SourcePluginRow
                key={plugin.id}
                plugin={plugin}
                trailing={
                  <div className="flex items-center gap-2">
                    <SourcePluginEnableSwitch plugin={plugin} compact />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/sources/${encodeURIComponent(plugin.id)}`)}
                    >
                      <ChevronRight
                        size={20}
                        className="shrink-0 text-muted transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </Button>
                  </div>
                }
              />
            ))}
          </Panel>
        )}
      </Section>
    </div>
  );
}
