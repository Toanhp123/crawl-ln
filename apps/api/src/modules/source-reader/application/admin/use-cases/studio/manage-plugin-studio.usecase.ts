import type { SourceReaderActor } from '../../../ports/source-reader-actor.port.js';
import type {
  CreatePluginStudioProjectInput,
  PluginStudioService,
  UpdatePluginStudioProjectInput
} from '../../services/plugin-studio.service.js';
import type { SourceReaderAuthorizationPolicy } from '../../policies/source-reader-authorization.policy.js';

type StudioOperations = Pick<
  PluginStudioService,
  'create' | 'list' | 'get' | 'update' | 'remove' | 'build' | 'test' | 'install' | 'export'
>;

function requireAdmin(policy: SourceReaderAuthorizationPolicy, actor: SourceReaderActor): void {
  policy.requireRole(actor, 'source-admin');
}

export class CreatePluginStudioProjectUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, 'create'>
  ) {}

  execute(input: { actor: SourceReaderActor } & CreatePluginStudioProjectInput) {
    requireAdmin(this.authorization, input.actor);
    const { actor: _actor, ...project } = input;
    return this.studio.create(project);
  }
}

export class ListPluginStudioProjectsUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, 'list'>
  ) {}

  execute(input: { actor: SourceReaderActor }) {
    requireAdmin(this.authorization, input.actor);
    return this.studio.list();
  }
}

export class GetPluginStudioProjectUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, 'get'>
  ) {}

  execute(input: { actor: SourceReaderActor; projectId: string }) {
    requireAdmin(this.authorization, input.actor);
    return this.studio.get(input.projectId);
  }
}

export class UpdatePluginStudioProjectUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, 'update'>
  ) {}

  execute(input: { actor: SourceReaderActor; projectId: string } & UpdatePluginStudioProjectInput) {
    requireAdmin(this.authorization, input.actor);
    const { actor: _actor, projectId, ...patch } = input;
    return this.studio.update(projectId, patch);
  }
}

export class RemovePluginStudioProjectUseCase {
  constructor(
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, 'remove'>
  ) {}

  execute(input: { actor: SourceReaderActor; projectId: string }) {
    requireAdmin(this.authorization, input.actor);
    return this.studio.remove(input.projectId);
  }
}

abstract class PluginStudioProjectActionUseCase<
  Action extends 'build' | 'test' | 'install' | 'export'
> {
  constructor(
    private readonly action: Action,
    private readonly authorization: SourceReaderAuthorizationPolicy,
    private readonly studio: Pick<StudioOperations, Action>
  ) {}

  execute(input: {
    actor: SourceReaderActor;
    projectId: string;
  }): ReturnType<PluginStudioService[Action]> {
    requireAdmin(this.authorization, input.actor);
    return (
      this.studio[this.action] as (projectId: string) => ReturnType<PluginStudioService[Action]>
    )(input.projectId);
  }
}

export class BuildPluginStudioProjectUseCase extends PluginStudioProjectActionUseCase<'build'> {
  constructor(
    authorization: SourceReaderAuthorizationPolicy,
    studio: Pick<StudioOperations, 'build'>
  ) {
    super('build', authorization, studio);
  }
}

export class TestPluginStudioProjectUseCase extends PluginStudioProjectActionUseCase<'test'> {
  constructor(
    authorization: SourceReaderAuthorizationPolicy,
    studio: Pick<StudioOperations, 'test'>
  ) {
    super('test', authorization, studio);
  }
}

export class InstallPluginStudioProjectUseCase extends PluginStudioProjectActionUseCase<'install'> {
  constructor(
    authorization: SourceReaderAuthorizationPolicy,
    studio: Pick<StudioOperations, 'install'>
  ) {
    super('install', authorization, studio);
  }
}

export class ExportPluginStudioProjectUseCase extends PluginStudioProjectActionUseCase<'export'> {
  constructor(
    authorization: SourceReaderAuthorizationPolicy,
    studio: Pick<StudioOperations, 'export'>
  ) {
    super('export', authorization, studio);
  }
}
