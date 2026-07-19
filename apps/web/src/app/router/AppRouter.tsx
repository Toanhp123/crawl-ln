import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/layouts/AppShell';
import { ReaderShell } from '@/app/layouts/ReaderShell';
import { HomeRedirect } from './HomeRedirect';
import { routeLoaders } from './routePreload';

const LibraryPage = lazy(() => routeLoaders.library().then((m) => ({ default: m.LibraryPage })));
const NovelDetailRoute = lazy(() =>
  routeLoaders.novelDetail().then((m) => ({ default: m.NovelDetailRoute }))
);
const ChapterReaderPage = lazy(() =>
  routeLoaders.reader().then((m) => ({ default: m.ChapterReaderPage }))
);
const TaskDetailPage = lazy(() =>
  routeLoaders.taskDetail().then((m) => ({ default: m.TaskDetailPage }))
);
const ActivityPage = lazy(() => routeLoaders.activity().then((m) => ({ default: m.ActivityPage })));
const SourcesPage = lazy(() => routeLoaders.sources().then((m) => ({ default: m.SourcesPage })));
const SourceProfilePage = lazy(() =>
  routeLoaders.sourceProfile().then((m) => ({ default: m.SourceProfilePage }))
);
const SettingsPage = lazy(() => routeLoaders.settings().then((m) => ({ default: m.SettingsPage })));

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:novelId" element={<NovelDetailRoute />}>
          <Route element={<ReaderShell />}>
            <Route path="read/:chapterIndex" element={<ChapterReaderPage />} />
          </Route>
        </Route>
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/activity/:taskId" element={<TaskDetailPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/sources/new" element={<SourceProfilePage mode="create" />} />
        <Route path="/sources/:profileId" element={<SourceProfilePage mode="edit" />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/crawl" element={<Navigate to="/activity" replace />} />
        <Route path="/tasks" element={<Navigate to="/activity" replace />} />
        <Route path="/tasks/:taskId" element={<Navigate to="/activity" replace />} />
      </Route>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="*" element={<Navigate to="/library" replace />} />
    </Routes>
  );
}
