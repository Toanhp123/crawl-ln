import type { SourceReaderResult } from '@novel-tool/shared';
import { Badge, Panel, Text } from '@/shared/ui';
import { sourceReaderResultJson } from '../model/sourceReaderResult';
export function SourceReaderResultView({
  result,
  rawLabel = 'Raw JSON'
}: {
  result: SourceReaderResult<unknown>;
  rawLabel?: string;
}) {
  return (
    <div className="space-y-3">
      <Panel tone="inset" className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">{result.source.capability}</Badge>
          <Badge>
            {result.source.pluginId}@{result.source.pluginVersion}
          </Badge>
        </div>
        <Text as="p" variant="supporting" tone="muted">
          {result.source.domain}
        </Text>
      </Panel>
      {result.warnings?.map((warning) => (
        <Panel key={`${warning.code}-${warning.message}`} tone="subtle">
          <Text as="p" variant="label" tone="danger">
            {warning.code}
          </Text>
          <Text as="p" variant="supporting">
            {warning.message}
          </Text>
        </Panel>
      ))}
      <Panel tone="default">
        <pre
          className="max-h-[32rem] overflow-auto whitespace-pre-wrap type-metadata text-text"
          aria-label={rawLabel}
        >
          {sourceReaderResultJson(result)}
        </pre>
      </Panel>
    </div>
  );
}
