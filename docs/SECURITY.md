# Security

Novel Tool is safest when it is bound to the local machine. Treat source plugins, credentials, network profiles, and exported files as sensitive application data.

## Safe Defaults

- Keep `HOST=127.0.0.1` unless remote access is intentional.
- Keep `SOURCE_READER_TRUST_ROLE_HEADERS=false` unless a trusted authenticated gateway owns those headers.
- Set explicit `API_CORS_ORIGINS`; wildcard CORS is rejected.
- Use a random `SOURCE_READER_MASTER_KEY` for credentials, sessions, proxy secrets, and challenge state.
- Never commit `.env`, storage files, plugin archives, credentials, or logs.

## Remote Deployment

When binding to a non-loopback host, configure `API_REMOTE_TOKEN` with at least 32 random characters and send it only in an `Authorization` header. Put TLS and an authenticated reverse proxy in front of the service when it is reachable from an untrusted network. Restrict firewall rules to the intended clients.

## Plugin Integrity

Install only archives from a source you trust. The verifier checks safe paths, declared files, SHA-256 checksums, contract versions, and optional signatures. Review requested network, browser, authentication, cache, and asset permissions for the exact version. Approval is version-scoped; installing a newer version does not enable it automatically.

External plugins run in an isolated supervised process and receive only SDK-mediated operations. A malformed response, policy violation, contract mismatch, or package mutation may disable or quarantine the version. Do not attempt to bypass those safeguards.

## Secrets and Data

Credential and proxy values are write-only in the web console. Do not paste secrets into issue reports, URLs, screenshots, or chat. Back up the storage directory using an encrypted and access-controlled destination, and remove old exports when they are no longer needed.

## Reporting a Vulnerability

Do not publish an exploitable vulnerability in a public issue. Contact the maintainers privately with a concise description, affected version, reproduction steps, impact, and any safe mitigation. Allow time for a fix before public disclosure.
