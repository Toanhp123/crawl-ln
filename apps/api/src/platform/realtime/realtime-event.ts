export type RealtimeResource = 'novels' | 'tasks' | 'scheduler' | 'plugins' | 'search' | 'all';

export interface RealtimeEvent {
  id: string;
  type: 'data.changed';
  resources: RealtimeResource[];
  reason: string;
  occurredAt: string;
  taskId?: string;
  novelId?: string;
  chapterIndex?: number;
}

export type RealtimeEventInput = Omit<RealtimeEvent, 'id' | 'occurredAt'>;

export interface RealtimeEventPublisher {
  publish(input: RealtimeEventInput): RealtimeEvent;
}
