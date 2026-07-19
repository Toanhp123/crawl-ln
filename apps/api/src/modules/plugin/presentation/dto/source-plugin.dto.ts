import { z } from 'zod';
export const sourcePluginParamsDto = z.object({ id: z.string().min(1) });
export const sourcePluginEnabledDto = z.object({ enabled: z.boolean() });
