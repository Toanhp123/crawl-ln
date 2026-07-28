interface TrustedPluginRegistration {
  enabled: boolean;
  plugin: {
    manifest: {
      permissions: {
        network: {
          hosts: readonly string[];
        };
      };
    };
  };
}

export function activePluginTrustedHosts(
  registrations: ReadonlyMap<string, TrustedPluginRegistration>
): string[] {
  const hosts = new Set<string>();
  for (const registration of registrations.values()) {
    if (!registration.enabled) continue;
    for (const host of registration.plugin.manifest.permissions.network.hosts) {
      if (host.trim()) hosts.add(host);
    }
  }
  return [...hosts];
}
