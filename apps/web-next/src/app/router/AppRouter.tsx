import { lazy } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppShell } from '../layouts/AppShell';
import { ReaderShell } from '../layouts/ReaderShell';
import { HomeRedirect } from './HomeRedirect';
import { routeLoaders } from './route-preload';

const LibraryPage = lazy(() =>
  routeLoaders.library().then((module) => ({ default: module.LibraryPage }))
);
const NovelDetailPage = lazy(() =>
  routeLoaders.novelDetail().then((module) => ({ default: module.NovelDetailPage }))
);
const ChapterReaderPage = lazy(() =>
  routeLoaders.reader().then((module) => ({ default: module.ChapterReaderPage }))
);
const TaskDetailPage = lazy(() =>
  routeLoaders.taskDetail().then((module) => ({ default: module.TaskDetailPage }))
);
const ActivityPage = lazy(() =>
  routeLoaders.activity().then((module) => ({ default: module.ActivityPage }))
);
const SourcesPage = lazy(() =>
  routeLoaders.sources().then((module) => ({ default: module.FoundationPage }))
);
const SourcePluginPage = lazy(() =>
  routeLoaders.sourcePlugin().then((module) => ({ default: module.FoundationPage }))
);
const SettingsPage = lazy(() =>
  routeLoaders.settings().then((module) => ({ default: module.FoundationPage }))
);

function NovelDetailRouteFrame() {
  return (
    <>
      <NovelDetailPage />
      <Outlet />
    </>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/library/:novelId" element={<NovelDetailRouteFrame />}>
          <Route element={<ReaderShell />}>
            <Route path="read/:chapterIndex" element={<ChapterReaderPage />} />
          </Route>
        </Route>
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/activity/:taskId" element={<TaskDetailPage />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/sources/new" element={<SourcePluginPage />} />
        <Route path="/sources/:pluginId" element={<SourcePluginPage />} />
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
