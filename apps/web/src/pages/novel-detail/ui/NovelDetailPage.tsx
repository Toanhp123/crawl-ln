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
import { ChapterList } from '@/entities/chapter';
import { NovelCover } from '@/entities/novel';
import { TaskProgress } from '@/entities/task';
import {
  listBookmarks,
  readChapterIds,
  readLatestReadingPosition,
  removeBookmark,
  useReadingContinuityVersion
} from '@/features/read-chapter';
import { useI18n } from '@/shared/i18n';
import { useScrollRestoration } from '@/shared/lib';
import {
  Button,
  Card,
  CardContent,
  CardFooter,
  CardHeader,
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
import { useNovelDetailPage } from '../model/use-novel-detail-page';
import { NovelManagementSheet } from './NovelManagementSheet';

export function NovelDetailPage() {
  const { t, status, relativeTime, errorMessage } = useI18n();
  const params = useParams<{ novelId: string }>();
  const novelId = params.novelId ? decodeURIComponent(params.novelId) : '';
  useScrollRestoration(`novel-detail:${novelId}`);
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
  const readIds = current ? readChapterIds(novelId) : new Set<string>();
  const chapterByIndex = new Map(
    current?.chapters.map((chapter) => [chapter.index, chapter]) ?? []
  );
  const readingPercent = Math.max(
    0,
    Math.min(
      100,
      Math.round((latestPosition?.bookProgress ?? latestPosition?.scrollRatio ?? 0) * 100)
    )
  );
  const taskActive = ['queued', 'running', 'pausing', 'resuming'].includes(
    model.task.data?.status ?? ''
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
    <Page className="max-w-5xl pt-2">
      <Button variant="ghost" size="sm" className="w-fit" onClick={model.openLibrary}>
        <ArrowLeft size={20} />
        {t('reader.backLibrary')}
      </Button>
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
                  className="mt-2 inline-flex max-w-full items-center gap-1.5 text-primary"
                  href={current.novel.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Text as="span" variant="metadata" tone="muted" truncate>
                    {current.novel.sourceName || t('reader.source')}
                  </Text>
                  <ExternalLink size={16} />
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
                  {latestPosition ? t('library.continue') : t('reader.startReading')}
                </span>
              </Button>
              <NovelManagementSheet
                novel={current.novel}
                updateActionState={model.refreshMutation.status}
                crawlActionState={model.importMutation.status}
                taskActive={taskActive}
                onUpdate={() => model.refreshMutation.mutate(novelId)}
                onCrawl={() => model.importMutation.mutate(novelId)}
                triggerClassName="w-auto shrink-0 whitespace-nowrap px-3"
              />
            </CardFooter>
          </Card>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatCard
              label={t('reader.chapterCount')}
              value={current.chapters.length}
              icon={<BookOpen size={20} />}
            />
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
            <StatCard
              label={t('reader.latestUpdate')}
              value={relativeTime(current.novel.updatedAt)}
              icon={<RefreshCw size={20} />}
            />
          </div>

          {bookmarks.length ? (
            <Section title={t('reader.bookmarks')} description={t('reader.bookmarksDescription')}>
              <Card padding="none" elevation="flat" className="overflow-hidden">
                {bookmarks.slice(0, 8).map((bookmark) => {
                  const chapter = chapterByIndex.get(bookmark.chapterIndex);
                  const paragraph = Number(bookmark.paragraphId.match(/(\d+)$/)?.[1] ?? 0) + 1;
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
                      title={chapter?.title || `${t('common.chapter')} ${bookmark.chapterIndex}`}
                      description={t('reader.bookmarkLocation', {
                        chapter: bookmark.chapterIndex,
                        paragraph
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

          <Section title={t('reader.chapters')} description={t('reader.chaptersDescription')}>
            <ChapterList
              chapters={current.chapters}
              readChapterIds={readIds}
              currentIndex={latestPosition?.chapterIndex}
              onSelect={(chapter) => {
                if (chapter.status === 'fetched') model.openChapter(chapter.index);
              }}
            />
            {failed > 0 ? (
              <Panel
                tone="inset"
                padding="sm"
                className="mt-3 border border-danger-state-border bg-danger-subtle"
              >
                <Text variant="caption" tone="danger">
                  {current.chapters
                    .filter((chapter) => chapter.status === 'failed')
                    .slice(0, 3)
                    .map((chapter) => errorMessage(chapter.errorMessage, 'common.requestFailed'))
                    .join(' · ')}
                </Text>
              </Panel>
            ) : null}
          </Section>

          <Section title={t('reader.dangerZone')} description={t('reader.dangerZoneDescription')}>
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 size={18} />
              {t('reader.deleteLabel')}
            </Button>
          </Section>
          <ConfirmDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            title={t('reader.deleteTitle')}
            description={t('reader.deleteDescription')}
            confirmText={t('reader.deleteConfirm')}
            danger
            actionState={model.removeMutation.status}
            onConfirm={() => model.removeMutation.mutate(novelId)}
          />
        </>
      )}
    </Page>
  );
}
