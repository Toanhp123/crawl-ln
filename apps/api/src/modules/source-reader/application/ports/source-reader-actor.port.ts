export type SourceReaderRole = 'reader' | 'source-manager' | 'source-admin' | 'system-admin';

export interface SourceReaderActor {
  id?: string;
  roles: SourceReaderRole[];
}
