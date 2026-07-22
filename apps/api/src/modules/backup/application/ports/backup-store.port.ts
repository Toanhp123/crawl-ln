export interface BackupStorePort {
  createDatabaseSnapshot(): Promise<Buffer>;
  replaceDatabase(content: Buffer): Promise<void>;
  saveSafetyBackup(content: Buffer, filename: string): Promise<string>;
}
