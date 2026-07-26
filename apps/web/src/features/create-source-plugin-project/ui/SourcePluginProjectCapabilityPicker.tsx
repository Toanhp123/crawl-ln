import type { SourcePluginStudioCapability } from '../../../entities/source-plugin-project';
import { useI18n } from '../../../shared/i18n';
import { FilterChip } from '../../../shared/ui';

const capabilities: SourcePluginStudioCapability[] = [
  'identify',
  'metadata',
  'chapter-list',
  'chapter-content'
];

export function SourcePluginProjectCapabilityPicker({
  value,
  onChange,
  disabled = false
}: {
  value: SourcePluginStudioCapability[];
  onChange: (value: SourcePluginStudioCapability[]) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap gap-2">
      {capabilities.map((capability) => {
        const selected = value.includes(capability);
        return (
          <FilterChip
            key={capability}
            selected={selected}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() =>
              onChange(
                selected ? value.filter((item) => item !== capability) : [...value, capability]
              )
            }
          >
            {t(`createSourcePluginProject.capability.${capability}`)}
          </FilterChip>
        );
      })}
    </div>
  );
}
