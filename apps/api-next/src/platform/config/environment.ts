import 'dotenv/config';
import { z } from 'zod';

const environmentSchema = z.object({
  NEXT_API_HOST: z.string().trim().min(1).default('127.0.0.1'),
  NEXT_API_PORT: z.coerce.number().int().min(1).max(65_535).default(3100)
});

export function createEnvironment(source: NodeJS.ProcessEnv = process.env) {
  const parsed = environmentSchema.parse(source);
  return {
    host: parsed.NEXT_API_HOST,
    port: parsed.NEXT_API_PORT
  };
}

export const environment = createEnvironment();
