# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This App Is

Wanderer is a self-hostable EVE Online wormhole mapper built with Elixir/Phoenix + React. It provides real-time solar system mapping, character tracking via EVE ESI, kill feed integration, and external event delivery (SSE/webhooks).

## Commands

```bash
# Setup
make install          # Install Elixir + JS deps (mix deps.get + yarn)
mix setup             # One-time: deps, create DB, migrate, build assets

# Development
make server           # Start IEx + Phoenix dev server (sources .env, port 8000)
make migrate          # Run DB migrations (MIX_ENV=dev mix ash.migrate)

# Testing
make test             # Run full test suite (creates/migrates DB automatically)
make unit-tests       # Run unit tests only (test/unit/)
mix test test/path/to/specific_test.exs          # Single test file
mix test test/path/to/specific_test.exs:42       # Single test line

# Code quality
mix format            # Format Elixir code
mix ex_check          # Run all checks: Credo, Dialyzer, Sobelow, mix_audit

# Assets
make deploy           # Build + deploy frontend assets
```

## Architecture

### Data Layer — Ash Framework

All persistence goes through `WandererApp.Api` (an `Ash.Domain`). Resources live in `lib/wanderer_app/api/` — one file per entity (Map, Character, MapSystem, MapConnection, etc.). Each resource defines its own actions, validations, policies, and code interface. There is no separate repository layer; call resource actions directly (e.g., `WandererApp.Api.get_map(id)`). Migrations are generated with `mix ash.codegen <name>`.

Sensitive fields are encrypted via `AshCloak` (`WandererApp.Vault`). JSON:API is exposed under `/api/v1` via `ash_json_api`.

### Real-Time Layer — Supervisor Trees

Two parallel supervisor trees handle live state:

- **Map supervision** (`lib/wanderer_app/map/`): `MapPoolSupervisor` → `Map.Manager` per map. The manager coordinates system/connection state, character presence, and the ZKB kill feed fetcher.
- **Character tracking** (`lib/wanderer_app/character/`): `TrackerManager` → one tracker process per character per map, polling ESI for location/ship/online status.

Both use `DynamicSupervisor` + `Registry` for named process lookup.

### External Events

Internal state changes broadcast via Phoenix PubSub (`:wanderer_app`). A separate `ExternalEvents` subsystem (`lib/wanderer_app/external_events/`) consumes those events and fans out to:
- SSE streams (`SseStreamManager`) — long-poll HTTP clients
- Webhooks (`WebhookDispatcher`) — outbound HTTP POST
- `MapEventRelay` routes events to the correct destination

This pipeline is additive — it does not modify existing PubSub flows.

### Web Layer

`lib/wanderer_app_web/` follows standard Phoenix structure:
- `router.ex` — defines pipelines (`:browser`, `:api`, `:api_map`, `:api_sse`, `:api_v1`, etc.) and routes
- `controllers/` — REST API controllers (map, system, signature, character, kills, audit, etc.)
- `live/` — Phoenix LiveView pages; `map_live.ex` is the main interactive map (mounts a React app via a LiveView hook)
- `live/map/event_handlers/` — LiveView event handler modules per domain area
- `plugs/` — auth, API key validation, feature-flag gates, rate limiting, CSP

### Frontend

React 18 + TypeScript + Vite in `assets/`. ReactFlow handles the interactive map canvas. LiveView communicates with the React app via Phoenix JS hooks. Build: `yarn build`; dev watch: `yarn watch`.

### Caching

Multiple Cachex instances (`character_cache`, `map_cache`, `acl_cache`, etc.) plus Nebulex for a shared L2 cache (1M entries, 2 GB max). HTTP client pools via Finch — separate pools for ESI tracking (400 connections), ESI general, webhooks, and defaults.

## Key Configuration

Feature flags are set via environment variables at runtime (`config/runtime.exs`):
- `WANDERER_KILLS_SERVICE_ENABLED` — WandererKills WebSocket integration
- `WANDERER_SSE_ENABLED` / `WANDERER_WEBHOOKS_ENABLED` — external event delivery
- `WANDERER_PUBLIC_API_DISABLED` — API killswitch
- `WANDERER_INVITES` — user invitation gate

EVE SSO credentials (`EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `EVE_CALLBACK_URL`) and `SECRET_KEY_BASE` are required for auth. See `setup-local.md` for full local setup including required EVE developer app registration.

Prometheus metrics are exposed on port 4021 at `/metrics`.

## Testing Notes

Tests use `Ecto.Adapters.SQL.Sandbox` for DB isolation and `Mox` for mocks (call `set_mox_private()` in async tests). Mock implementations live in `test/support/`. CI runs 4 parallel partitions (`--partitions 4`); use `MIX_TEST_PARTITION` locally to reproduce.
