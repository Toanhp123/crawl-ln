export interface ApplicationEvent {
  readonly name: string;
}

export type ApplicationEventHandler<TEvent extends ApplicationEvent = ApplicationEvent> = (
  event: TEvent
) => void | Promise<void>;
