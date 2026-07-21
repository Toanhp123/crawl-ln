export interface BackupMaintenancePort {
  runExclusive<T>(work: () => Promise<T>): Promise<T>;
}
