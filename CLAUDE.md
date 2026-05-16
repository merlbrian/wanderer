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

## Deployment (Homelab K3s via ArgoCD)

The homelab runs two environments on a single K3s cluster (`workload-01`, control plane at 192.168.2.11):

| Environment | Namespace | URL | Branch | Image tag pattern |
|-------------|-----------|-----|--------|-------------------|
| Production | `wanderer-prd` | http://wanderer.merl.lab | `main` | `main-<sha>` |
| Dev | `wanderer-dev` | http://wanderer-dev.merl.lab | `develop` | `develop-<sha>` |

**How it works:**
- ArgoCD watches `https://github.com/merlbrian/prd-infra.git` (`helm/wanderer/` path) for Helm config changes.
- ArgoCD Image Updater is supposed to poll `ghcr.io/merlbrian/wanderer` and write the latest matching tag back to prd-infra. As of 2026-05-16, Image Updater v1.2.0 has moved to a CRD-based model and is **not processing the annotation-based config** on the Application resources — so image tags are not being auto-updated. Both environments may be stuck on rolling tags (`develop`, `latest`) until this is fixed in prd-infra.
- Helm values live in `prd-infra/helm/wanderer/`: `values.yaml` (base), `values-dev.yaml` (dev overrides), `values-prd.yaml` (prod overrides).
- K8s secrets (`wanderer-secrets`) are created by `ansible/playbooks/wanderer-secrets.yml` in prd-infra. Dev and prod use **separate EVE SSO applications** (different client IDs/secrets) because each needs a unique callback URL.

**Known behavioral differences between dev and prod:**
- As of 2026-05-16, pasting a mission in dev shows it as already-skipped — this is a suspected bug in the `develop` branch, not a config difference.
- `WANDERER_INVITES` must be `false` (or absent) for the EVE SSO login button to appear on the welcome page. When `true`, the app hides the button and requires a valid invite token in the URL (`/welcome?invite=<token>`).

**Checking deployment status:**
```bash
# ArgoCD UI
open http://argocd.merl.lab

# Pod status
ssh ubuntu@192.168.2.11 "sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -n wanderer-dev"
ssh ubuntu@192.168.2.11 "sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get pods -n wanderer-prd"

# Logs
ssh ubuntu@192.168.2.11 "sudo KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl logs -n wanderer-dev deploy/wanderer-dev --tail=50"
```

## Testing Notes

Tests use `Ecto.Adapters.SQL.Sandbox` for DB isolation and `Mox` for mocks (call `set_mox_private()` in async tests). Mock implementations live in `test/support/`. CI runs 4 parallel partitions (`--partitions 4`); use `MIX_TEST_PARTITION` locally to reproduce.
