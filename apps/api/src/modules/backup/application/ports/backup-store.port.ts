export interface ReplacePromotionPaths {
  databasePath: string;
  newDatabasePath: string;
  rollbackDatabasePath: string;
}

export interface BackupStorePort {
  createDatabaseSnapshot(): Promise<Buffer>;
  replaceDatabase(content: Buffer): Promise<void>;
  saveSafetyBackup(content: Buffer, filename: string): Promise<string>;
  runMergeTransaction<T>(work: () => Promise<T>): Promise<T>;

  primaryDatabasePath(): string;
  prepareReplacement(input: {
    operationId: string;
    validatedDatabasePath: string;
  }): Promise<ReplacePromotionPaths>;
  closePrimaryDatabase(): void;
  openPrimaryDatabase(): void;
  validateDatabaseFile(path: string): void;
  fileExists(path: string): boolean;
  movePrimaryToRollback(paths: ReplacePromotionPaths): Promise<void>;
  promotePreparedDatabase(paths: ReplacePromotionPaths): Promise<void>;
  restoreRollbackDatabase(paths: ReplacePromotionPaths): Promise<void>;
  removeDatabaseFile(path: string): Promise<void>;
  cleanupReplacement(paths: ReplacePromotionPaths): Promise<void>;
}
