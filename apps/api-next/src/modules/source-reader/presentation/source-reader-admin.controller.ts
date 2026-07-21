import type { Response } from 'express';
import { accepted, noContent, ok } from '../../../platform/http/api-response.js';
import { requireSourceReaderActor } from '../application/admin/require-source-reader-actor.js';
import { requireSourcePluginPackage } from '../application/admin/require-source-plugin-package.js';
import { parseBody } from './source-reader.schemas.js';
import type { SourceReaderManagementApi } from '../public/source-reader.api.js';
import {
  authChallengeResponseSchema,
  credentialLoginSchema,
  credentialRequestSchema,
  credentialSecretSchema,
  networkProfileCreateSchema,
  networkProfileUpdateSchema,
  pluginVersionSchema
} from './source-reader.schemas.js';
import type { SourceReaderRequest } from './source-reader.middleware.js';

function requireActor(request: SourceReaderRequest) {
  return requireSourceReaderActor(request.sourceReaderActor);
}

export class SourceReaderAdminController {
  constructor(private readonly management: SourceReaderManagementApi) {}

  listPlugins = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.list.execute({
        actor: requireSourceReaderActor(req.sourceReaderActor)
      })
    );

  installPlugin = async (req: SourceReaderRequest, res: Response) => {
    const pluginPackage = requireSourcePluginPackage(req.file);
    return accepted(
      res,
      await this.management.plugins.install.execute({
        actor: requireActor(req),
        ...pluginPackage
      })
    );
  };

  enablePlugin = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.enable.execute({
        actor: requireActor(req),
        pluginId: req.params.pluginId,
        version: parseBody(req, pluginVersionSchema).version
      })
    );

  disablePlugin = async (req: SourceReaderRequest, res: Response) => {
    await this.management.plugins.disable.execute({
      actor: requireActor(req),
      pluginId: req.params.pluginId
    });
    return noContent(res);
  };

  removePlugin = async (req: SourceReaderRequest, res: Response) => {
    await this.management.plugins.remove.execute({
      actor: requireActor(req),
      pluginId: req.params.pluginId
    });
    return noContent(res);
  };

  testPlugin = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.test.execute({
        actor: requireActor(req),
        pluginId: req.params.pluginId
      })
    );

  pluginHealth = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.health.execute({
        actor: requireActor(req),
        pluginId: req.params.pluginId
      })
    );

  pluginDiagnostics = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.diagnostics.execute({
        actor: requireActor(req),
        pluginId: req.params.pluginId
      })
    );

  listPermissions = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.plugins.listPermissions.execute({
        actor: requireActor(req),
        pluginId: req.params.pluginId
      })
    );

  approvePermissions = async (req: SourceReaderRequest, res: Response) => {
    await this.management.plugins.approvePermissions.execute({
      actor: requireActor(req),
      pluginId: req.params.pluginId,
      version: parseBody(req, pluginVersionSchema).version
    });
    return noContent(res);
  };

  denyPermissions = async (req: SourceReaderRequest, res: Response) => {
    await this.management.plugins.denyPermissions.execute({
      actor: requireActor(req),
      pluginId: req.params.pluginId,
      version: parseBody(req, pluginVersionSchema).version
    });
    return noContent(res);
  };

  listCredentials = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.credentials.list.execute({ actor: requireActor(req) }));

  createCredential = async (req: SourceReaderRequest, res: Response) =>
    accepted(
      res,
      await this.management.credentials.create.execute({
        actor: requireActor(req),
        ...parseBody(req, credentialRequestSchema)
      })
    );

  updateCredential = async (req: SourceReaderRequest, res: Response) => {
    await this.management.credentials.updateSecret.execute({
      actor: requireActor(req),
      credentialId: req.params.id,
      secret: parseBody(req, credentialSecretSchema).secret
    });
    return noContent(res);
  };

  deleteCredential = async (req: SourceReaderRequest, res: Response) => {
    await this.management.credentials.remove.execute({
      actor: requireActor(req),
      credentialId: req.params.id
    });
    return noContent(res);
  };

  loginCredential = async (req: SourceReaderRequest, res: Response) =>
    accepted(
      res,
      await this.management.credentials.login.execute({
        actor: requireActor(req),
        credentialId: req.params.id,
        ...parseBody(req, credentialLoginSchema)
      })
    );

  logoutCredential = async (req: SourceReaderRequest, res: Response) => {
    await this.management.credentials.logout.execute({
      actor: requireActor(req),
      credentialId: req.params.id
    });
    return noContent(res);
  };

  testCredential = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.credentials.test.execute({
        actor: requireActor(req),
        credentialId: req.params.id,
        ...parseBody(req, credentialLoginSchema)
      })
    );

  listNetworkProfiles = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.networkProfiles.list.execute({ actor: requireActor(req) }));

  createNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    accepted(
      res,
      await this.management.networkProfiles.create.execute({
        actor: requireActor(req),
        ...parseBody(req, networkProfileCreateSchema)
      })
    );

  updateNetworkProfile = async (req: SourceReaderRequest, res: Response) => {
    await this.management.networkProfiles.update.execute({
      actor: requireActor(req),
      profileId: req.params.id,
      patch: parseBody(req, networkProfileUpdateSchema)
    });
    return noContent(res);
  };

  deleteNetworkProfile = async (req: SourceReaderRequest, res: Response) => {
    await this.management.networkProfiles.remove.execute({
      actor: requireActor(req),
      profileId: req.params.id
    });
    return noContent(res);
  };

  testNetworkProfile = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.networkProfiles.test.execute({
        actor: requireActor(req),
        profileId: req.params.id
      })
    );

  listChallenges = async (req: SourceReaderRequest, res: Response) =>
    ok(res, await this.management.challenges.list.execute({ actor: requireActor(req) }));

  getChallenge = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.challenges.get.execute({
        actor: requireActor(req),
        challengeId: req.params.id
      })
    );

  respondChallenge = async (req: SourceReaderRequest, res: Response) =>
    ok(
      res,
      await this.management.challenges.respond.execute({
        actor: requireActor(req),
        challengeId: req.params.id,
        response: parseBody(req, authChallengeResponseSchema).response
      })
    );

  cancelChallenge = async (req: SourceReaderRequest, res: Response) => {
    await this.management.challenges.cancel.execute({
      actor: requireActor(req),
      challengeId: req.params.id
    });
    return noContent(res);
  };
}
