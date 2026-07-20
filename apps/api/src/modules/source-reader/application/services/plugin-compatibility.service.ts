import { Ajv, type AnySchema } from 'ajv';
import { satisfies, validRange } from 'semver';
import type { SourcePluginManifest } from '../../domain/plugin/source-plugin.js';
import type {
  CompatibilityIssue,
  CompatibilityReport,
  SourceReaderHostCompatibility
} from '../../domain/plugin/source-reader-host-compatibility.js';

function issue(
  code: CompatibilityIssue['code'],
  path: string,
  severity: CompatibilityIssue['severity'],
  message: string
): CompatibilityIssue {
  return { code, path, severity, message };
}

function parseSchema(bytes: Uint8Array): unknown {
  return JSON.parse(Buffer.from(bytes).toString('utf8')) as unknown;
}

function hostAllowed(host: string, patterns: string[]): boolean {
  const normalizedHost = host.toLowerCase().replace(/^www\./, '');
  return patterns.some((pattern) => {
    const normalized = pattern.toLowerCase().replace(/^www\./, '');
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(2);
      return normalizedHost === suffix || normalizedHost.endsWith(`.${suffix}`);
    }
    return normalizedHost === normalized || normalizedHost.endsWith(`.${normalized}`);
  });
}

export class PluginCompatibilityService {
  constructor(private readonly host: SourceReaderHostCompatibility) {}

  evaluate(
    manifest: SourcePluginManifest,
    files: ReadonlyMap<string, Uint8Array>
  ): CompatibilityReport {
    const issues: CompatibilityIssue[] = [];
    const activatedExtensions: CompatibilityReport['activatedExtensions'] = {};
    const range = validRange(manifest.engines.sourceReader);
    if (!range || !satisfies(this.host.runtimeVersion, range)) {
      issues.push(
        issue(
          'PLUGIN_RUNTIME_INCOMPATIBLE',
          'engines.sourceReader',
          'fatal',
          `Runtime ${this.host.runtimeVersion} does not satisfy ${manifest.engines.sourceReader}`
        )
      );
    }

    for (const capability of manifest.capabilities) {
      const version = manifest.contracts[capability];
      const supported = this.host.capabilityContracts[capability] ?? [];
      if (typeof version !== 'number' || !supported.includes(version)) {
        issues.push(
          issue(
            'PLUGIN_CAPABILITY_CONTRACT_UNSUPPORTED',
            `contracts.${capability}`,
            'fatal',
            `Capability ${capability} contract ${String(version)} is unsupported`
          )
        );
      }
    }

    const formLogin = manifest.authentication?.formLogin;
    if (formLogin) {
      const loginHost = new URL(formLogin.loginUrlTemplate).hostname;
      const allowedHosts = manifest.matchers.flatMap((matcher) => matcher.hosts);
      if (!hostAllowed(loginHost, allowedHosts)) {
        issues.push(
          issue(
            'PLUGIN_PERMISSION_DENIED',
            'authentication.formLogin.loginUrlTemplate',
            'fatal',
            `Form login host ${loginHost} is outside plugin matcher allowlist`
          )
        );
      }
    }

    const ajv = new Ajv({ strict: true, allErrors: true, loadSchema: undefined });
    for (const [namespace, contract] of Object.entries(manifest.extensionContracts ?? {})) {
      const supported = this.host.extensionContracts[namespace] ?? [];
      if (!supported.includes(contract.version)) {
        issues.push(
          issue(
            'PLUGIN_EXTENSION_CONTRACT_UNSUPPORTED',
            `extensionContracts.${namespace}.version`,
            'fatal',
            `Extension ${namespace} version ${contract.version} is unsupported`
          )
        );
        continue;
      }
      try {
        const bytes = files.get(contract.schema);
        if (!bytes) throw new Error(`Missing extension schema ${contract.schema}`);
        ajv.compile(parseSchema(bytes) as AnySchema);
        activatedExtensions[namespace] = {
          version: contract.version,
          schema: contract.schema,
          required: contract.required === true
        };
      } catch (error) {
        issues.push(
          issue(
            'PLUGIN_EXTENSION_SCHEMA_INVALID',
            `extensionContracts.${namespace}.schema`,
            contract.required === true ? 'fatal' : 'warning',
            error instanceof Error ? error.message : String(error)
          )
        );
      }
    }

    issues.sort(
      (left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code)
    );
    return {
      compatible: !issues.some((item) => item.severity === 'fatal'),
      issues,
      activatedExtensions
    };
  }
}
