export interface NovelDeletionPort {
  delete(id: string): Promise<void>;
}
