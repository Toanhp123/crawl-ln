export interface BackupFileStore {
  initialize(): Promise<void>;
  operationRoot(operationId: string): string;
  uploadRoot(sessionId: string): string;
  inspectionRoot(sessionId: string): string;
  uploadArchivePath(sessionId: string): string;
  validatedRoot(sessionId: string): string;
  validatedPath(sessionId: string, name: string): string;
  initializeSession(sessionId: string): Promise<void>;
  appendUploadChunk(sessionId: string, offset: number, content: Buffer): Promise<number>;
  truncateUpload(sessionId: string, size: number): Promise<void>;
  writeInspectionFile(sessionId: string, name: string, content: Buffer): Promise<string>;
  readBuffer(path: string): Promise<Buffer>;
  exists(path: string): Promise<boolean>;
  writeOperationFile(operationId: string, name: string, content: Buffer): Promise<string>;
  promoteArtifact(input: {
    sourcePath: string;
    artifactId: string;
    filename: string;
  }): Promise<string>;
  openReadStream(path: string): NodeJS.ReadableStream;
  stat(path: string): Promise<{ size: number }>;
  removePath(path: string): Promise<void>;
  removeOperationRoot(operationId: string): Promise<void>;
  removeSessionRoot(sessionId: string): Promise<void>;
  listManagedPaths(): Promise<string[]>;
}
