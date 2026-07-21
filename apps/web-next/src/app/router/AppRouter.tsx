import { Route, Routes } from 'react-router-dom';
import { FoundationPage } from '@/pages/foundation';

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<FoundationPage />} />
      <Route path="/library" element={<FoundationPage />} />
    </Routes>
  );
}
