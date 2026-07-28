import type { Catalog } from '../../../shared/i18n';

export const installSourcePluginCatalogs = {
  en: {
    'installSourcePlugin.description': 'Install a Source Reader plugin package.',
    'installSourcePlugin.file': 'Plugin package',
    'installSourcePlugin.install': 'Install plugin',
    'installSourcePlugin.confirm': 'Confirm installation',
    'installSourcePlugin.installed': 'Plugin installed',
    'installSourcePlugin.failed': 'Plugin installation failed',
    'installSourcePlugin.tooLarge': 'The package exceeds 20 MiB.',
    'installSourcePlugin.choose': 'Choose archive',
    'installSourcePlugin.drop': 'or drop it here',
    'installSourcePlugin.empty': 'No file selected',
    'installSourcePlugin.remove': 'Remove selected archive',
    'installSourcePlugin.inspecting': 'Inspecting archive',
    'installSourcePlugin.inspectingDescription':
      'Checking safety and plugin layout before installation.',
    'installSourcePlugin.preview': 'Plugin archive preview',
    'installSourcePlugin.kind': 'Archive kind',
    'installSourcePlugin.kind.built-package': 'Built package',
    'installSourcePlugin.kind.studio-source': 'Plugin Studio source',
    'installSourcePlugin.kind.npm-workspace': 'npm workspace source',
    'installSourcePlugin.name': 'Plugin',
    'installSourcePlugin.version': 'Version',
    'installSourcePlugin.hosts': 'Network hosts',
    'installSourcePlugin.capabilities': 'Capabilities',
    'installSourcePlugin.ignoredFiles': '{count} archive files will not be imported.',
    'installSourcePlugin.builtAction':
      'This built package will be installed directly and remain pending approval.',
    'installSourcePlugin.sourceAction':
      'This source archive will be built temporarily for installation. No Studio project will be created.'
  },
  vi: {
    'installSourcePlugin.description': 'Cài đặt gói plugin Source Reader.',
    'installSourcePlugin.file': 'Gói plugin',
    'installSourcePlugin.install': 'Cài plugin',
    'installSourcePlugin.confirm': 'Xác nhận cài đặt',
    'installSourcePlugin.installed': 'Đã cài plugin',
    'installSourcePlugin.failed': 'Cài plugin thất bại',
    'installSourcePlugin.tooLarge': 'Gói vượt quá 20 MiB.',
    'installSourcePlugin.choose': 'Chọn tệp nén',
    'installSourcePlugin.drop': 'hoặc thả tệp vào đây',
    'installSourcePlugin.empty': 'Chưa chọn tệp',
    'installSourcePlugin.remove': 'Xóa tệp nén đã chọn',
    'installSourcePlugin.inspecting': 'Đang kiểm tra tệp nén',
    'installSourcePlugin.inspectingDescription':
      'Kiểm tra an toàn và cấu trúc plugin trước khi cài đặt.',
    'installSourcePlugin.preview': 'Xem trước gói plugin',
    'installSourcePlugin.kind': 'Loại tệp nén',
    'installSourcePlugin.kind.built-package': 'Gói đã build',
    'installSourcePlugin.kind.studio-source': 'Mã nguồn Plugin Studio',
    'installSourcePlugin.kind.npm-workspace': 'Mã nguồn npm workspace',
    'installSourcePlugin.name': 'Plugin',
    'installSourcePlugin.version': 'Phiên bản',
    'installSourcePlugin.hosts': 'Domain mạng',
    'installSourcePlugin.capabilities': 'Khả năng',
    'installSourcePlugin.ignoredFiles': '{count} tệp sẽ không được import.',
    'installSourcePlugin.builtAction':
      'Gói đã build sẽ được cài trực tiếp và vẫn ở trạng thái chờ phê duyệt.',
    'installSourcePlugin.sourceAction':
      'Mã nguồn sẽ được build tạm thời để cài đặt. Không tạo project Studio.'
  }
} as const satisfies Record<'en' | 'vi', Catalog>;
