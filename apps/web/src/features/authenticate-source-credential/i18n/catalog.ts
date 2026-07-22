import type { Catalog } from '../../../shared/i18n';
export const authenticateSourceCredentialCatalogs = {
  en: {
    'authenticateSourceCredential.login': 'Log in',
    'authenticateSourceCredential.logout': 'Log out',
    'authenticateSourceCredential.test': 'Test',
    'authenticateSourceCredential.loginDone': 'Authentication started',
    'authenticateSourceCredential.logoutDone': 'Logged out',
    'authenticateSourceCredential.testDone': 'Credential test completed',
    'authenticateSourceCredential.failed': 'Credential authentication failed'
  },
  vi: {
    'authenticateSourceCredential.login': 'Đăng nhập',
    'authenticateSourceCredential.logout': 'Đăng xuất',
    'authenticateSourceCredential.test': 'Kiểm tra',
    'authenticateSourceCredential.loginDone': 'Đã bắt đầu xác thực',
    'authenticateSourceCredential.logoutDone': 'Đã đăng xuất',
    'authenticateSourceCredential.testDone': 'Đã kiểm tra thông tin đăng nhập',
    'authenticateSourceCredential.failed': 'Xác thực thất bại'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
