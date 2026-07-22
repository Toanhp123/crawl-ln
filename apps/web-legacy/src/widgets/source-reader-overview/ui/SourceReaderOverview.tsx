import { KeyRound, Network, Plus, ShieldQuestion } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SourcePluginRow, useSourcePluginsQuery } from '@/entities/source-plugin';
import { useSourceCredentialsQuery } from '@/entities/source-credential';
import { useSourceNetworkProfilesQuery } from '@/entities/source-network-profile';
import { useSourceAuthChallengesQuery } from '@/entities/source-auth-challenge';
import { SourcePluginEnableSwitch } from '@/features/manage-source-plugins';
import { useI18n } from '@/shared/i18n/I18nProvider';
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
  const plugins = useSourcePluginsQuery();
  const credentials = useSourceCredentialsQuery();
  const networks = useSourceNetworkProfilesQuery();
  const challenges = useSourceAuthChallengesQuery(true);
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
      <Section
        title={t('sources.plugins.summary')}
        action={
          <Button
            size="sm"
            leadingIcon={<Plus size={16} />}
            onClick={() => navigate('/sources/new')}
          >
            {t('sources.plugins.install')}
          </Button>
        }
      >
        <Panel tone="inset">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t('sources.plugins.search')}
          />
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
                    <div className="w-14">
                      <SourcePluginEnableSwitch plugin={plugin} compact />
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => navigate(`/sources/${encodeURIComponent(plugin.id)}`)}
                    >
                      {t('common.details')}
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
