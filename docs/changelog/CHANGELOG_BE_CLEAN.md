# BE Clean Pass Changelog

- Split novel query/command use cases.
- Added task application use cases.
- Removed repository dependency from task and novel controllers.
- Added queue port and made crawl use case depend on the port.
- Added clock/id/transaction ports.
- Added system adapters for clock and id generation.
- Updated composition root wiring.
- Added architecture rules and review docs.
