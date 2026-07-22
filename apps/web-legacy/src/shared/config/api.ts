const runtimeEnv = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;

export const API_BASE_URL = runtimeEnv?.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000';
