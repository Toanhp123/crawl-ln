export interface ApplicationEvent<TPayload = unknown> {
  id: string;
  type: string;
  occurredAt: string;
  payload: TPayload;
}
