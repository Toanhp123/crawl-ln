export interface SchedulerTaskQueryPort {
  hasActiveForNovel(novelId: string): Promise<boolean>;
}
