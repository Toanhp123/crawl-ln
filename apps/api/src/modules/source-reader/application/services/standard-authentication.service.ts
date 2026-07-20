import type {
  AuthCookie,
  AuthExecutionResult,
  AuthenticationStrategy
} from '../../domain/auth/authentication.js';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';

export interface AuthenticationHttpClient {
  get(
    url: string,
    options?: { headers?: Record<string, string> }
  ): Promise<{ url: string; status: number; headers: Record<string, string>; data: string }>;
  post(
    url: string,
    options?: { headers?: Record<string, string>; body?: unknown }
  ): Promise<{ url: string; status: number; headers: Record<string, string>; data: string }>;
}

function stringHeader(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? headers[key] : undefined;
}

function splitSetCookie(value: string): string[] {
  return value.split(/,(?=\s*[^;,=\s]+=[^;]+)/).map((item) => item.trim());
}

function parseSetCookie(value: string): AuthCookie[] {
  return splitSetCookie(value).map((header) => {
    const [pair, ...attributes] = header.split(';').map((part) => part.trim());
    const separator = pair.indexOf('=');
    if (separator <= 0) {
      throw new SourceReaderError('AUTHENTICATION_FAILED', 'Login returned an invalid cookie', {
        retryable: false,
        fallbackAllowed: false
      });
    }
    const cookie: AuthCookie = {
      name: pair.slice(0, separator),
      value: pair.slice(separator + 1)
    };
    for (const attribute of attributes) {
      const [rawName, ...rawValue] = attribute.split('=');
      const name = rawName.toLowerCase();
      const attributeValue = rawValue.join('=');
      if (name === 'domain' && attributeValue) cookie.domain = attributeValue;
      else if (name === 'path' && attributeValue) cookie.path = attributeValue;
      else if (name === 'expires' && attributeValue) {
        const expires = Date.parse(attributeValue);
        if (Number.isFinite(expires)) cookie.expires = Math.floor(expires / 1000);
      } else if (name === 'secure') cookie.secure = true;
      else if (name === 'httponly') cookie.httpOnly = true;
    }
    return cookie;
  });
}

function importedCookies(value: unknown): AuthCookie[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cookies: AuthCookie[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
    const candidate = item as Partial<AuthCookie>;
    if (typeof candidate.name !== 'string' || typeof candidate.value !== 'string') {
      return undefined;
    }
    cookies.push({
      name: candidate.name,
      value: candidate.value,
      ...(typeof candidate.domain === 'string' ? { domain: candidate.domain } : {}),
      ...(typeof candidate.path === 'string' ? { path: candidate.path } : {}),
      ...(typeof candidate.expires === 'number' ? { expires: candidate.expires } : {}),
      ...(typeof candidate.secure === 'boolean' ? { secure: candidate.secure } : {}),
      ...(typeof candidate.httpOnly === 'boolean' ? { httpOnly: candidate.httpOnly } : {})
    });
  }
  return cookies;
}

export class StandardAuthenticationService {
  async authenticate(input: {
    strategy: Exclude<AuthenticationStrategy, 'custom'>;
    secret: Record<string, unknown>;
    configuration: Record<string, unknown>;
    http: AuthenticationHttpClient;
  }): Promise<AuthExecutionResult> {
    if (input.strategy === 'cookie-import') {
      const cookies = importedCookies(input.secret.cookies);
      if (!cookies) return this.failed('Cookie payload is invalid');
      return {
        status: 'authenticated',
        session: { kind: 'cookies', cookies, networkBinding: 'preferred' }
      };
    }

    if (input.strategy === 'bearer-token') {
      const token = typeof input.secret.token === 'string' ? input.secret.token : '';
      if (!token) return this.failed('Bearer token is missing');
      return {
        status: 'authenticated',
        session: {
          kind: 'headers',
          headers: { Authorization: `Bearer ${token}` },
          networkBinding: 'none'
        }
      };
    }

    if (input.strategy === 'basic-auth') {
      const username = typeof input.secret.username === 'string' ? input.secret.username : '';
      const password = typeof input.secret.password === 'string' ? input.secret.password : '';
      if (!username || !password) return this.failed('Basic credentials are incomplete');
      return {
        status: 'authenticated',
        session: {
          kind: 'headers',
          headers: {
            Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
          },
          networkBinding: 'none'
        }
      };
    }

    const loginUrl =
      typeof input.configuration.loginUrl === 'string' ? input.configuration.loginUrl : '';
    const fields = input.configuration.fields as
      { username?: unknown; password?: unknown } | undefined;
    const username = typeof input.secret.username === 'string' ? input.secret.username : '';
    const password = typeof input.secret.password === 'string' ? input.secret.password : '';
    if (
      !loginUrl ||
      typeof fields?.username !== 'string' ||
      typeof fields.password !== 'string' ||
      !username ||
      !password
    ) {
      return this.failed('Form login configuration or credentials are incomplete');
    }

    const staticFields =
      input.configuration.staticFields &&
      typeof input.configuration.staticFields === 'object' &&
      !Array.isArray(input.configuration.staticFields)
        ? (input.configuration.staticFields as Record<string, string>)
        : {};
    const body = new URLSearchParams({
      ...staticFields,
      [fields.username]: username,
      [fields.password]: password
    });
    const response = await input.http.post(loginUrl, {
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body
    });
    const success = input.configuration.success as
      { urlIncludes?: unknown; status?: unknown; selector?: unknown } | undefined;
    const failure = input.configuration.failure as
      { status?: unknown; selector?: unknown } | undefined;
    if (Array.isArray(failure?.status) && failure.status.includes(response.status)) {
      return this.failed('Form login failure status matched');
    }
    if (typeof failure?.selector === 'string' && response.data.includes(failure.selector)) {
      return this.failed('Form login failure selector matched');
    }
    if (Array.isArray(success?.status) && !success.status.includes(response.status)) {
      return this.failed('Form login success status did not match');
    }
    if (typeof success?.selector === 'string' && !response.data.includes(success.selector)) {
      return this.failed('Form login success selector did not match');
    }
    if (typeof success?.urlIncludes === 'string' && !response.url.includes(success.urlIncludes)) {
      return this.failed('Form login success condition failed');
    }
    const sessionConfiguration = input.configuration.session as
      { cookies?: unknown; headers?: unknown } | undefined;
    const setCookie = stringHeader(response.headers, 'set-cookie');
    const selectedHeaders = Object.fromEntries(
      (Array.isArray(sessionConfiguration?.headers) ? sessionConfiguration.headers : []).flatMap(
        (name) => {
          if (typeof name !== 'string') return [];
          const value = stringHeader(response.headers, name.toLowerCase());
          return value ? [[name, value]] : [];
        }
      )
    );
    const cookies =
      sessionConfiguration?.cookies === false ? [] : setCookie ? parseSetCookie(setCookie) : [];
    return {
      status: 'authenticated',
      session: {
        kind:
          cookies.length > 0 && Object.keys(selectedHeaders).length > 0
            ? 'combined'
            : Object.keys(selectedHeaders).length > 0
              ? 'headers'
              : 'cookies',
        ...(cookies.length > 0 ? { cookies } : {}),
        ...(Object.keys(selectedHeaders).length > 0 ? { headers: selectedHeaders } : {}),
        networkBinding: 'preferred'
      }
    };
  }

  private failed(message: string): never {
    throw new SourceReaderError('AUTHENTICATION_FAILED', message, {
      retryable: false,
      fallbackAllowed: false
    });
  }
}
