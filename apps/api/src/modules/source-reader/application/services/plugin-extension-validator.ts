import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Ajv, type AnySchema, type ErrorObject } from 'ajv';
import { SourceReaderError } from '../../domain/errors/source-reader.error.js';
import type {
  SourceReaderWarning,
  VersionedExtensionValue
} from '../../public/source-reader.models.js';

export interface ActivatedExtensionContract {
  namespace: string;
  version: string;
  required: boolean;
  validate(
    value: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; issues: Array<{ path: string; message: string }> };
}

export interface ValidatedPluginResult<T> {
  data: T;
  extensions?: Record<string, VersionedExtensionValue>;
  warnings: SourceReaderWarning[];
}

function safeIssues(errors: ErrorObject[] | null | undefined) {
  return (errors ?? []).map((error) => ({
    path: error.instancePath || '/',
    message: error.message ?? 'Invalid extension value'
  }));
}

export function createActivatedExtensionContract(input: {
  namespace: string;
  version: string;
  required: boolean;
  schema: AnySchema;
}): ActivatedExtensionContract {
  const ajv = new Ajv({ strict: true, allErrors: true, loadSchema: undefined });
  const validate = ajv.compile(input.schema);
  return {
    namespace: input.namespace,
    version: input.version,
    required: input.required,
    validate(value) {
      if (validate(value)) return { success: true, data: value };
      return { success: false, issues: safeIssues(validate.errors) };
    }
  };
}

export async function loadActivatedExtensionContracts(
  packageRoot: string,
  contracts: Record<string, { version: number; schema: string; required: boolean }>
): Promise<Record<string, ActivatedExtensionContract>> {
  const activated: Record<string, ActivatedExtensionContract> = {};
  for (const [namespace, contract] of Object.entries(contracts).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const schema = JSON.parse(
      await readFile(join(packageRoot, contract.schema), 'utf8')
    ) as AnySchema;
    activated[namespace] = createActivatedExtensionContract({
      namespace,
      version: String(contract.version),
      required: contract.required,
      schema
    });
  }
  return activated;
}

function invalidExtension(
  namespace: string,
  issues: Array<{ path: string; message: string }>
): never {
  throw new SourceReaderError(
    'PLUGIN_RESULT_INVALID',
    'Plugin returned an invalid extension result',
    {
      retryable: false,
      fallbackAllowed: true,
      details: { namespace, issues }
    }
  );
}

export function validatePluginExtensions<T>(
  data: T,
  values: Record<string, VersionedExtensionValue> | undefined,
  contracts: Record<string, ActivatedExtensionContract>
): ValidatedPluginResult<T> {
  const extensions: Record<string, VersionedExtensionValue> = {};
  const warnings: SourceReaderWarning[] = [];
  const supplied = values ?? {};

  for (const namespace of Object.keys(supplied)) {
    if (!contracts[namespace]) {
      invalidExtension(namespace, [
        { path: '/', message: 'Extension namespace was not activated' }
      ]);
    }
  }

  for (const [namespace, contract] of Object.entries(contracts).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const value = supplied[namespace];
    if (!value) {
      if (contract.required) {
        invalidExtension(namespace, [{ path: '/', message: 'Required extension is missing' }]);
      }
      continue;
    }
    const versionMatches = String(value.version) === contract.version;
    const result = versionMatches
      ? contract.validate(value.data)
      : {
          success: false as const,
          issues: [{ path: '/version', message: `Expected extension version ${contract.version}` }]
        };
    if (!result.success) {
      if (contract.required) invalidExtension(namespace, result.issues);
      warnings.push({
        code: 'PLUGIN_EXTENSION_OMITTED',
        message: `Optional extension ${namespace}@${contract.version} was omitted`
      });
      continue;
    }
    extensions[namespace] = { version: value.version, data: result.data };
  }

  return {
    data,
    ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
    warnings
  };
}

export function activatedExtensionVersions(
  contracts: Record<string, ActivatedExtensionContract> | undefined
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(contracts ?? {})
      .map(([namespace, contract]) => [namespace, contract.version] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}
