# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Wanderer is an EVE Online wormhole mapper — a real-time collaborative tool for tracking systems, connections, and fleets. It's a Phoenix/LiveView backend with a React frontend embedded via LiveView JS hooks.

## Commands

```bash
# Dev server (sources .env automatically)
make server          # or: source .env && MIX_ENV=dev iex -S mix phx.server

# Dependencies
make install         # mix deps.get + yarn
make yarn            # JS deps only

# Database
make migrate         # mix ash.migrate
mix ecto.reset       # drop, recreate, migrate, seed

# Tests
mix test                                        # full suite
mix test test/unit/wanderer_app/agent_missions/ # specific directory
mix test test/path/to/file_test.exs:42          # specific line
make test-parallel                              # 4-partition parallel run

# Code generation (Ash migrations)
mix ash.codegen <migration_name>   # generate migration from resource changes
mix ash.migrate                    # run pending migrations

# Format
make format          # mix format

# Assets
make deploy          # production build (Vite + Phoenix digest)
```

**Note:** The global CLAUDE.md mentions `docker compose exec backend pytest` — ignore that for this project. Tests run natively with `mix test`. PostgreSQL runs as a local WSL service (`sudo service postgresql start`).

## Architecture

### Backend

**Ash ORM** is the primary data layer. All database models are Ash Resources in `lib/wanderer_app/api/`. Schemas are defined in resources, migrations are generated via `mix ash.codegen`, and run via `mix ash.migrate` (not `mix ecto.migrate`).

**Domain:** `WandererApp.Api` contains ~31 resources. Key ones: `Map`, `MapSystem`, `MapConnection`, `MapSystemSignature`, `Character`, `User`, `AccessList`, `AgentMission`.

**Operations modules** in `lib/wanderer_app/map/operations/` hold business logic that orchestrates Ash resource calls — don't put business logic directly in resources or event handlers.

**Map GenServer** (`lib/wanderer_app/map/server/`) maintains in-memory map state. Each map runs as a supervised process.

**ESI** (`lib/wanderer_app/esi/`) is the EVE Swagger Interface HTTP client. Uses Finch with multiple named pools to avoid exhaustion during bulk character data pulls (`WANDERER_FINCH_ESI_CHARACTER_POOL_SIZE` default 200).

### Web / LiveView

`lib/wanderer_app_web/live/map/` is the main LiveView page. UI events from the React frontend arrive as LiveView events and are dispatched by `map_event_handler.ex` to feature-specific event handler modules (e.g. `map_missions_event_handler.ex`, `map_fleet_event_handler.ex`).

**Event handler pattern:**
- Each feature gets its own `*_event_handler.ex` in `lib/wanderer_app_web/live/map/event_handlers/`
- Implements `handle_ui_event/3` clauses (from browser → server) and `handle_server_event/2` (PubSub → browser)
- Falls through to `MapCoreEventHandler` as the catch-all

### Frontend

React lives in `assets/js/hooks/Mapper/`. It communicates with LiveView via Phoenix JS hooks — outbound calls use `OutCommand` enum values (defined in `assets/js/hooks/Mapper/types/mapHandlers.ts`), inbound events are pushed via `MapEventHandler.push_map_event/3` on the server.

**Adding a new UI action end-to-end:**
1. Add value to `OutCommand` enum in `mapHandlers.ts`
2. Add `handle_ui_event` clause in the relevant `*_event_handler.ex`
3. Add operation function in `lib/wanderer_app/map/operations/`
4. If new data shape needed, add/modify Ash resource action

### Real-time

`WandererApp.PubSub` (Phoenix PubSub, PG2 adapter) broadcasts map state changes. The LiveView subscribes and pushes updates to the React frontend as JSON via `push_map_event`.

### Configuration

Runtime config from environment variables lives in `config/runtime.exs`. Copy `.env.example` → `.env` for local dev. Key vars: `WEB_APP_URL`, `EVE_CLIENT_ID`, `EVE_CLIENT_SECRET`, `DATABASE_URL`.

Feature flags (kills service, webhooks, map subscriptions, public API) are all toggled via env vars — see `config/runtime.exs` for the full list.

### Caching

Two layers:
- **Cachex** — process-level caches for characters, system lookups, ship types
- **Nebulex** — application-level cache (12hr GC, 1M entries, 2GB limit)

`WandererApp.CachedInfo` is the primary interface for EVE static data lookups (system IDs by name, etc.).

## Testing

Tests use **ExUnit** with `Mox` for mocking. Async tests are the default.

- `test/support/data_case.ex` — sets up DB sandbox; use for any test touching the database
- `test/support/factory.ex` — test data builders
- `test/support/mocks.ex` — mock module definitions
- Integration tests are tagged `@tag :integration` and excluded by default

Coverage thresholds are defined in `config/quality_gates.exs`.
