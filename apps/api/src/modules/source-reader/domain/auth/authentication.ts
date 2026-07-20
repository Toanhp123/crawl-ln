export type AuthenticationStrategy =
  'cookie-import' | 'bearer-token' | 'basic-auth' | 'form-login' | 'custom';

export interface AuthCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  secure?: boolean;
  httpOnly?: boolean;
}

export interface AuthSessionMaterial {
  kind: 'cookies' | 'headers' | 'combined';
  cookies?: AuthCookie[];
  headers?: Record<string, string>;
  expiresAt?: string;
  networkBinding: 'none' | 'preferred' | 'required';
}

export interface AuthChallenge {
  id: string;
  type: 'otp' | 'captcha' | 'approval' | 'browser-interaction';
  expiresAt: string;
  userInstructions?: string;
  opaqueState?: Record<string, unknown>;
}

export type AuthExecutionResult =
  | { status: 'authenticated'; session: AuthSessionMaterial }
  | { status: 'challenge-required'; challenge: AuthChallenge };
