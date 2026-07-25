import { createReadStream } from 'node:fs';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  stat as fileStat,
  truncate
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BackupFileStore } from '../../application/ports/backup-file-store.port.js';

const namespaceNames = ['uploads', 'inspections', 'operations', 'artifacts'] as const;

export class NodeBackupFileStore implements BackupFileStore {
  readonly root: string;
  private readonly uploadsRoot: string;
  private readonly inspectionsRoot: string;
  private readonly operationsRoot: string;
  private readonly artifactsRoot: string;

  constructor(storageDirectory: string) {
    this.root = resolve(storageDirectory, 'backup-temp');
    this.uploadsRoot = join(this.root, 'uploads');
    this.inspectionsRoot = join(this.root, 'inspections');
    this.operationsRoot = join(this.root, 'operations');
    this.artifactsRoot = join(this.root, 'artifacts');
  }

  async initialize(): Promise<void> {
    await Promise.all(
      [
        this.root,
        this.uploadsRoot,
        this.inspectionsRoot,
        this.operationsRoot,
        this.artifactsRoot
      ].map((path) => mkdir(path, { recursive: true }))
    );
  }

  operationRoot(operationId: string): string {
    return this.resolveWithin(this.operationsRoot, operationId);
  }

  uploadRoot(sessionId: string): string {
    return this.resolveWithin(this.uploadsRoot, sessionId);
  }

  inspectionRoot(sessionId: string): string {
    return this.resolveWithin(this.inspectionsRoot, sessionId);
  }

  uploadArchivePath(sessionId: string): string {
    return this.resolveWithin(this.uploadRoot(sessionId), 'archive.part');
  }

  validatedRoot(sessionId: string): string {
    return this.resolveWithin(this.inspectionRoot(sessionId), 'validated');
  }

  validatedPath(sessionId: string, name: string): string {
    return this.resolveWithin(this.validatedRoot(sessionId), name);
  }

  async initializeSession(sessionId: string): Promise<void> {
    await this.initialize();
    await Promise.all([
      mkdir(this.uploadRoot(sessionId), { recursive: true }),
      mkdir(this.inspectionRoot(sessionId), { recursive: true })
    ]);
  }

  async appendUploadChunk(sessionId: string, offset: number, content: Buffer): Promise<number> {
    await this.initializeSession(sessionId);
    const path = this.uploadArchivePath(sessionId);
    let handle;
    try {
      handle = await open(path, 'r+');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
      handle = await open(path, 'w+');
    }
    try {
      const result = await handle.write(content, 0, content.length, offset);
      if (result.bytesWritten !== content.length) {
        throw new Error('Restore upload chunk was not written completely');
      }
      await handle.sync();
      return offset + result.bytesWritten;
    } finally {
      await handle.close();
    }
  }

  async truncateUpload(sessionId: string, size: number): Promise<void> {
    const path = this.uploadArchivePath(sessionId);
    await truncate(path, size);
    const handle = await open(path, 'r+');
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async writeInspectionFile(sessionId: string, name: string, content: Buffer): Promise<string> {
    await this.initializeSession(sessionId);
    const path = this.validatedPath(sessionId, name);
    const temporary = `${path}.tmp-${randomUUID()}`;
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(temporary, 'w+');
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, path);
    return path;
  }

  async readBuffer(path: string): Promise<Buffer> {
    this.assertManagedPath(path, false);
    return readFile(path);
  }

  async exists(path: string): Promise<boolean> {
    this.assertManagedPath(path, false);
    try {
      await fileStat(path);
      return true;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
      throw error;
    }
  }

  async writeOperationFile(operationId: string, name: string, content: Buffer): Promise<string> {
    await this.initialize();
    const path = this.resolveWithin(this.operationRoot(operationId), name);
    await mkdir(dirname(path), { recursive: true });
    const handle = await open(path, 'w');
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return path;
  }

  async promoteArtifact(input: {
    sourcePath: string;
    artifactId: string;
    filename: string;
  }): Promise<string> {
    await this.initialize();
    this.assertManagedPath(input.sourcePath, false);
    const artifactRoot = this.resolveWithin(this.artifactsRoot, input.artifactId);
    const destination = this.resolveWithin(artifactRoot, 'archive.nvt');
    const temporary = this.resolveWithin(artifactRoot, `archive.nvt.tmp-${randomUUID()}`);
    await mkdir(artifactRoot, { recursive: true });

    try {
      await copyFile(input.sourcePath, temporary);
      const handle = await open(temporary, 'r+');
      try {
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(temporary, destination);
      await rm(input.sourcePath, { force: true });
      return destination;
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  openReadStream(path: string): NodeJS.ReadableStream {
    this.assertManagedPath(path, false);
    return createReadStream(path);
  }

  async stat(path: string): Promise<{ size: number }> {
    this.assertManagedPath(path, false);
    const value = await fileStat(path);
    return { size: value.size };
  }

  async removePath(path: string): Promise<void> {
    this.assertManagedPath(path, false);
    await rm(path, { recursive: true, force: true });
  }

  async removeOperationRoot(operationId: string): Promise<void> {
    await rm(this.operationRoot(operationId), { recursive: true, force: true });
  }

  async removeSessionRoot(sessionId: string): Promise<void> {
    await Promise.all([
      rm(this.uploadRoot(sessionId), { recursive: true, force: true }),
      rm(this.inspectionRoot(sessionId), { recursive: true, force: true })
    ]);
  }

  async listManagedPaths(): Promise<string[]> {
    await this.initialize();
    const roots = namespaceNames.map((name) => this.resolveWithin(this.root, name));
    const paths: string[] = [];
    for (const root of roots) {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries) paths.push(this.resolveWithin(root, entry.name));
    }
    return paths.sort((left, right) => left.localeCompare(right));
  }

  private resolveWithin(root: string, ...segments: string[]): string {
    const path = resolve(root, ...segments);
    if (path !== root && !path.startsWith(`${root}${sep}`)) {
      throw new Error('Path escapes managed backup storage');
    }
    return path;
  }

  private assertManagedPath(path: string, allowRoot: boolean): void {
    const resolved = resolve(path);
    if (
      (!allowRoot && resolved === this.root) ||
      (resolved !== this.root && !resolved.startsWith(`${this.root}${sep}`))
    ) {
      throw new Error('Path escapes managed backup storage');
    }
  }
}
