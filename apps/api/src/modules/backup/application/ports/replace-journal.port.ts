export type ReplaceJournal = {
  version: 1;
  operationId: string;
  databasePath: string;
  newDatabasePath: string;
  rollbackDatabasePath: string;
  stage: 'prepared' | 'old-moved' | 'new-promoted' | 'reopened';
};

export interface ReplaceJournalPort {
  read(): Promise<ReplaceJournal | null>;
  write(journal: ReplaceJournal): Promise<void>;
  remove(): Promise<void>;
}
