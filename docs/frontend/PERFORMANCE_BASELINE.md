# Performance Baseline

Phase 4 keeps route/API behavior unchanged, lazy-loads no routes until bundle measurement justifies it, uses lazy/fixed-size Library visuals, throttles reading-position writes, avoids chapter polling while reading, and removes duplicate Shared builds from workspace dev scripts. Production bundle output is recorded during `npm run build`.
