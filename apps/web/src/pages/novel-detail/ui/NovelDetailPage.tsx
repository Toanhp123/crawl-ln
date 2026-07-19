import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Play,
  RefreshCw,
  Trash2,
  TriangleAlert,
  X
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ChapterList } from '@/entities/chapter/ui/ChapterList';
import { NovelCover } from '@/entities/novel/ui/NovelCover';
import { TaskProgress } from '@/entities/task/ui/TaskProgress';
import { AutoUpdatePanel } from '@/features/auto-update/ui/AutoUpdatePanel';
import { readLatestReadingPosition } from '@/features/read-chapter/model/readingPositionStorage';
import {
  listBookmarks,
  readChapterIds,
  removeBookmark,
  useReadingContinuityVersion
} from '@/features/read-chapter/model/readingContinuityStorage';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  Chip,
  ConfirmDialog,
  ErrorBanner,
  IconButton,
  IconTile,
  ListRow,
  LoadingState,
  Page,
  Panel,
  Progress,
  Section,
  StatCard,
  Text
} from '@/shared/ui';
import { useI18n } from '@/shared/i18n/I18nProvider';
import { useNovelDetailPage } from '../model/useNovelDetailPage';
import { NovelManagementSheet } from './NovelManagementSheet';

export function NovelDetailPage() {
  const { t, status, relativeTime } = useI18n();
  const params = useParams<{ novelId: string }>();
  const novelId = params.novelId ? decodeURIComponent(params.novelId) : '';
  const model = useNovelDetailPage(novelId);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const continuityVersion = useReadingContinuityVersion();

  if (!params.novelId) return <Navigate to="/library" replace />;

  const current = model.detail.data;
  void continuityVersion;
  const fetched = current?.chapters.filter((chapter) => chapter.status === 'fetched').length ?? 0;
  const failed = current?.chapters.filter((chapter) => chapter.status === 'failed').length ?? 0;
  const latestPosition = current ? readLatestReadingPosition(novelId) : null;
  const bookmarks = current ? listBookmarks(novelId) : [];
  const readChapterIdsValue = current ? readChapterIds(novelId) : new Set<string>();
  const chapterByIndex = new Map(
    current?.chapters.map((chapter) => [chapter.index, chapter]) ?? []
  );
  const readingPercent = Math.max(
    0,
    Math.min(100, Math.round((latestPosition?.scrollRatio ?? 0) * 100))
  );
  const novelTone =
    current?.novel.status === 'completed'
      ? ('success' as const)
      : current?.novel.status === 'failed'
        ? ('danger' as const)
        : current?.novel.status === 'crawling'
          ? ('warning' as const)
          : ('info' as const);

  return (
    <Page className="pt-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="w-fit" onClick={model.openLibrary}>
          <ArrowLeft size={20} />
          {t('reader.backLibrary')}
        </Button>
      </div>
      <ErrorBanner error={model.error} />
      {model.detail.isLoading ? (
        <LoadingState title={t('reader.opening')} description={t('reader.openingDescription')} />
      ) : !current ? (
        <Card>{t('reader.notFound')}</Card>
      ) : (
        <>
          <Card className="overflow-hidden bg-[var(--gradient-primary-detail)]">
            <CardHeader className="gap-4">
              <NovelCover title={current.novel.title} coverUrl={current.novel.coverUrl} size="lg" />
              <div className="min-w-0 flex-1 py-1">
                <Chip tone={novelTone}>{status(current.novel.status)}</Chip>
                <Text as="h1" variant="pageTitle" className="mt-2 break-words">
                  {current.novel.title}
                </Text>
                {current.novel.author ? (
                  <Text as="p" variant="supporting" tone="muted" className="mt-1">
                    {current.novel.author}
                  </Text>
                ) : null}
                <a
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 text-primary transition-colors duration-[var(--motion-fast)] hover:text-primary-hover"
                  href={current.novel.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Text as="span" variant="metadata" tone="muted" truncate>
                    {current.novel.sourceName || t('reader.source')}
                  </Text>
                  <ExternalLink size={20} className="h-4 w-4" />
                </a>
                <Text as="p" variant="caption" tone="muted" className="mt-2">
                  {t('common.updatedAgo', { value: relativeTime(current.novel.updatedAt) })}
                </Text>
              </div>
            </CardHeader>
            <CardContent>
              <TaskProgress chapters={current.chapters} task={model.task.data} />
              {latestPosition ? (
                <Panel tone="inset" padding="sm" className="mt-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <Text variant="label">{t('reader.readingProgress')}</Text>
                    <Text variant="caption" tone="muted">
                      {t('reader.progressPercent', { value: readingPercent })}
                    </Text>
                  </div>
                  <Progress value={readingPercent} />
                </Panel>
              ) : null}
            </CardContent>
            <CardFooter className="flex-nowrap gap-3">
              <Button
                className="min-w-0 flex-1"
                onClick={() =>
                  model.openChapter(
                    latestPosition?.chapterIndex ??
                      current.chapters.find((chapter) => chapter.status === 'fetched')?.index ??
                      0
                  )
                }
                disabled={!current.chapters.some((chapter) => chapter.status === 'fetched')}
              >
                <Play size={20} />
                <span className="truncate">
                  {latestPosition
                    ? `${t('library.continue')} · ${t('common.chapter')} ${latestPosition.chapterIndex}`
                    : t('reader.read')}
                </span>
              </Button>
              <NovelManagementSheet
                novelId={novelId}
                updateActionState={model.updateNovel.status}
                crawlActionState={model.crawl.status}
                taskActive={
                  model.task.data?.status === 'running' || model.task.data?.status === 'queued'
                }
                onUpdate={() => model.updateNovel.mutate(novelId)}
                onCrawl={() => model.crawl.mutate(novelId)}
                triggerClassName="w-auto shrink-0 whitespace-nowrap px-3"
              />
            </CardFooter>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="hidden sm:block">
              <StatCard
                label={t('reader.chapterCount')}
                value={current.chapters.length}
                icon={<BookOpen size={20} />}
              />
            </div>
            <StatCard
              label={t('reader.downloadedCount')}
              value={fetched}
              icon={<CheckCircle2 size={20} />}
            />
            <StatCard
              label={t('reader.failedCount')}
              value={failed}
              icon={<TriangleAlert size={20} />}
            />
            <div className="hidden sm:block">
              <StatCard
                label={t('reader.latestUpdate')}
                value={relativeTime(current.novel.updatedAt)}
                icon={<RefreshCw size={20} />}
              />
            </div>
          </div>

          {bookmarks.length ? (
            <Section title={t('reader.bookmarks')} description={t('reader.bookmarksDescription')}>
              <Card padding="none" elevation="flat" className="overflow-hidden">
                {bookmarks.slice(0, 8).map((bookmark) => {
                  const bookmarkChapter = chapterByIndex.get(bookmark.chapterIndex);
                  const paragraphNumber =
                    Number(bookmark.paragraphId.match(/(\d+)$/)?.[1] ?? 0) + 1;
                  return (
                    <ListRow
                      key={bookmark.id}
                      divided
                      insetFocus
                      leading={
                        <IconTile size="sm" shape="circle" tone="primary">
                          <Bookmark size={20} />
                        </IconTile>
                      }
                      title={
                        bookmarkChapter?.title || `${t('common.chapter')} ${bookmark.chapterIndex}`
                      }
                      description={t('reader.bookmarkLocation', {
                        chapter: bookmark.chapterIndex,
                        paragraph: paragraphNumber
                      })}
                      trailing={
                        <IconButton
                          variant="ghost"
                          aria-label={t('reader.removeBookmark')}
                          onClick={(event) => {
                            event.stopPropagation();
                            removeBookmark(bookmark.id);
                          }}
                        >
                          <X size={20} />
                        </IconButton>
                      }
                      onClick={() => model.openChapter(bookmark.chapterIndex)}
                    />
                  );
                })}
              </Card>
            </Section>
          ) : null}

          <AutoUpdatePanel
            novel={current.novel}
            diagnostics={model.autoUpdate.diagnostics.data ?? []}
            actionState={model.autoUpdate.policy.status}
            t={t}
            relativeTime={relativeTime}
            onChange={(enabled, intervalMinutes) =>
              model.autoUpdate.policy.mutate({ enabled, intervalMinutes })
            }
          />

          <Section title={t('reader.chapters')} description={t('reader.chaptersDescription')}>
            <ChapterList
              chapters={current.chapters}
              readChapterIds={readChapterIdsValue}
              onSelect={(chapter) => model.openChapter(chapter.index)}
            />
          </Section>

          <Section title={t('reader.dangerZone')} description={t('reader.dangerZoneDescription')}>
            <Panel tone="default" className="border-danger-state-border bg-danger-subtle">
              <div className="flex items-start gap-3">
                <IconTile size="md" shape="circle" tone="danger">
                  <Trash2 size={20} />
                </IconTile>
                <div className="min-w-0 flex-1">
                  <CardTitle>{t('reader.deleteLabel')}</CardTitle>
                  <Text variant="supporting" tone="muted" className="mt-1 block">
                    {t('reader.deleteDescription')}
                  </Text>
                </div>
              </div>
              <Button
                variant="danger"
                className="mt-4 w-full sm:w-auto"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 size={20} />
                {t('reader.deleteLabel')}
              </Button>
            </Panel>
          </Section>
        </>
      )}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        danger
        actionState={model.removeNovel.status}
        title={t('reader.deleteTitle')}
        description={t('reader.deleteDescription')}
        confirmText={t('reader.deleteConfirm')}
        onConfirm={() => model.removeNovel.mutate(novelId)}
      />
    </Page>
  );
}
