import type { Catalog } from '../../../shared/i18n';

export const sourceNetworkProfileCatalogs = {
  en: {
    'sources.common.system': 'System',
    'sources.common.user': 'User',
    'common.status.degraded': 'Degraded',
    'common.status.direct': 'Direct',
    'common.status.healthy': 'Healthy',
    'common.status.http-proxy': 'HTTP proxy',
    'common.status.https-proxy': 'HTTPS proxy',
    'common.status.offline': 'Offline',
    'common.status.socks-proxy': 'SOCKS proxy',
    'common.status.vpn-gateway': 'Legacy VPN gateway'
  },
  vi: {
    'sources.common.system': 'Hệ thống',
    'sources.common.user': 'Người dùng',
    'common.status.degraded': 'Suy giảm',
    'common.status.direct': 'Trực tiếp',
    'common.status.healthy': 'Tốt',
    'common.status.http-proxy': 'Proxy HTTP',
    'common.status.https-proxy': 'Proxy HTTPS',
    'common.status.offline': 'Ngoại tuyến',
    'common.status.socks-proxy': 'Proxy SOCKS',
    'common.status.vpn-gateway': 'Cổng VPN cũ'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
