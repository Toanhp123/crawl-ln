import { httpVoid } from '../../../shared/api';
export function reviewSourcePermissions(
  pluginId: string,
  version: string,
  approved: boolean
): Promise<void> {
  const decision = approved ? 'approve' : 'deny';
  return httpVoid(
    `/api/source-reader/plugins/${encodeURIComponent(pluginId)}/permissions/${decision}`,
    { method: 'POST', body: JSON.stringify({ version }) }
  );
}
