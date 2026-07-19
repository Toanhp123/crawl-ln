import { Outlet } from 'react-router-dom';
import { NovelDetailPage } from './NovelDetailPage';

export function NovelDetailRoute() {
  return (
    <>
      <NovelDetailPage />
      <Outlet />
    </>
  );
}
