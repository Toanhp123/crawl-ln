const MAX_SOURCE_PLUGIN_STUDIO_FILES = 50;
const PROTECTED_FILE = 'manifest.json';

function assertExistingFile(files: Record<string, string>, path: string) {
  if (!Object.hasOwn(files, path)) throw new Error(`File does not exist: ${path}`);
}

function assertMutableFile(path: string) {
  if (path === PROTECTED_FILE) throw new Error('manifest.json is protected.');
}

function assertCapacity(files: Record<string, string>) {
  if (Object.keys(files).length >= MAX_SOURCE_PLUGIN_STUDIO_FILES) {
    throw new Error(`Studio projects support at most ${MAX_SOURCE_PLUGIN_STUDIO_FILES} files.`);
  }
}

export function validateSourcePluginStudioFilePath(path: string) {
  const normalized = path.trim();
  if (!normalized) throw new Error('File path is required.');
  if (normalized.includes('\\')) throw new Error('File paths must use forward slashes.');
  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    throw new Error('File paths must be relative.');
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error('File path contains an invalid segment.');
  }
  if (!(normalized.startsWith('src/') || normalized.startsWith('tests/'))) {
    throw new Error('Files must be created under src/ or tests/.');
  }
  return normalized;
}

export function createSourcePluginStudioFile(files: Record<string, string>, path: string) {
  const validated = validateSourcePluginStudioFilePath(path);
  if (Object.hasOwn(files, validated)) throw new Error(`File already exists: ${validated}`);
  assertCapacity(files);
  return { ...files, [validated]: '' };
}

export function renameSourcePluginStudioFile(
  files: Record<string, string>,
  currentPath: string,
  nextPath: string
) {
  assertMutableFile(currentPath);
  assertExistingFile(files, currentPath);
  const validated = validateSourcePluginStudioFilePath(nextPath);
  if (validated === currentPath) return files;
  if (Object.hasOwn(files, validated)) throw new Error(`File already exists: ${validated}`);
  const next = { ...files, [validated]: files[currentPath] ?? '' };
  delete next[currentPath];
  return next;
}

function deriveCopyPath(files: Record<string, string>, path: string) {
  const slash = path.lastIndexOf('/');
  const directory = path.slice(0, slash + 1);
  const filename = path.slice(slash + 1);
  const dot = filename.lastIndexOf('.');
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const extension = dot > 0 ? filename.slice(dot) : '';
  for (let index = 1; index <= MAX_SOURCE_PLUGIN_STUDIO_FILES; index += 1) {
    const suffix = index === 1 ? '.copy' : `.copy-${index}`;
    const candidate = `${directory}${stem}${suffix}${extension}`;
    if (!Object.hasOwn(files, candidate)) return candidate;
  }
  throw new Error('Could not derive a unique copy path.');
}

export function duplicateSourcePluginStudioFile(files: Record<string, string>, path: string) {
  assertMutableFile(path);
  assertExistingFile(files, path);
  assertCapacity(files);
  const copyPath = deriveCopyPath(files, path);
  return { path: copyPath, files: { ...files, [copyPath]: files[path] ?? '' } };
}

export function deleteSourcePluginStudioFile(files: Record<string, string>, path: string) {
  assertMutableFile(path);
  assertExistingFile(files, path);
  const next = { ...files };
  delete next[path];
  return next;
}
