import { Download } from 'lucide-react';
import { useI18n } from '../../../shared/i18n';
import { Button, type ButtonProps } from '../../../shared/ui';
import { useCrawlNovel } from '../model/use-crawl-novel';

export function CrawlNovelButton({
  novelId,
  children,
  ...props
}: ButtonProps & { novelId: string }) {
  const mutation = useCrawlNovel();
  const { t } = useI18n();
  return (
    <Button
      {...props}
      actionState={mutation.status}
      leadingIcon={props.leadingIcon ?? <Download size={17} />}
      onClick={(event) => {
        props.onClick?.(event);
        if (!event.defaultPrevented) mutation.mutate(novelId);
      }}
    >
      {children ?? t('crawlNovel.action')}
    </Button>
  );
}
