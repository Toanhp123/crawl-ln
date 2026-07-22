import type { SourceReaderResult } from '@novel-tool/shared';
import { Badge, Panel, ScrollViewport, Text } from '../../../shared/ui';
import { sourceReaderResultJson } from '../model/source-inspector';
export function SourceReaderResultView({
  result,
  rawLabel = 'Raw redacted response'
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
        <ScrollViewport
          as="div"
          id="source-reader-inspector-result"
          className="max-h-[var(--bottom-sheet-height)]"
        >
          <pre className="whitespace-pre-wrap p-4 type-metadata text-text" aria-label={rawLabel}>
            {sourceReaderResultJson(result)}
          </pre>
        </ScrollViewport>
      </Panel>
    </div>
  );
}
