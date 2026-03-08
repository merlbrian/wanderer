# Agent Missions Route Planner

Wanderer now includes an **Agent Missions Route Planner** feature, designed to help players manage and navigate EVE Online Agent Missions efficiently. This feature allows you to paste mission bookmarks from the game, plot optimized routes across your Wanderer maps, and track mission progress—all integrated seamlessly with your existing map workflows.

## Key Features

- **Bookmark Parsing and Import**: Copy Agent Mission bookmarks directly from EVE Online (e.g., from the People & Places window) and paste them into Wanderer. The system parses the tab-separated bookmark text to extract mission details. Bookmarks come in pairs: "Encounter" entries for mission sites (where you perform the mission) and "Agent Home Base" entries for turn-in stations. Since bookmarks don't include creator information, imports are done one character at a time—select a logged-in character first, then paste their bookmarks.
  
- **Mission Widget**: Similar to the Signatures widget, a dedicated Missions widget displays missions relevant to your current system. It shows mission names, types (Encounter or Agent Home Base), statuses (active/completed), associated systems, and turn-in locations. Filter by character, mission status, or type to focus on what's relevant.

- **Route Planning**: Once missions are imported, use Wanderer's existing routing engine to plot efficient paths between mission systems. Routes can prioritize Encounters (mission sites) first, then navigate to Agent Home Bases for turn-ins. Incorporate your custom hubs, avoidances (e.g., wormholes, Pochven), and preferences (e.g., shortest path, avoid mass-critical systems). Routes are visualized on the map and can be shared with your logged-in characters.

- **Progress Tracking**: Manually mark missions as complete in Wanderer as you finish them in-game. Completed missions are archived but remain visible for reference. This helps track multi-part mission chains and prevents revisiting completed objectives.

- **Character-Specific Management**: Missions are tied to specific characters (based on who pasted the bookmarks). You can view missions across all your characters or filter by active ones. Sharing allows routes to be accessible to other characters on the same map.

- **Integration with Maps**: Missions appear as waypoints on your Wanderer maps, with visual indicators (e.g., mission icons on systems). Routes can be saved as user routes for quick reuse, and the feature respects map permissions and hubs limits.

## How It Works

1. **Select a Character**: In the Missions widget, choose a logged-in character from your account.
2. **Paste Bookmarks**: Copy mission bookmarks from EVE (in tab-separated format, e.g., "Agent Home Base - K3JR-J\tStation\t3\tK3JR-J\t48R-PS\tVenal\t2025.12.27 17:09\t-") and paste into the widget's input field. Each mission typically has two bookmarks:
   - **Encounter (e.g., "Encounter (Deadspace) - H-PA29")**: Indicates the mission site (coordinate in space) where you need to go to complete the mission objective.
   - **Agent Home Base (e.g., "Agent Home Base - K3JR-J")**: Indicates the station where you turn in the mission.
3. **Parse and Save**: Wanderer parses the text, extracts system names (e.g., K3JR-J), constellation, region, and mission type. It associates each pair with the selected character and current map, storing them in the database.
4. **Plan Routes**: Select missions to include in a route. Wanderer calculates paths to Encounters first (for mission completion), then to Agent Home Bases (for turn-ins), using its routing algorithms and your settings.
5. **Track and Complete**: As you progress in-game, mark missions complete in the widget. Routes update dynamically to reflect remaining objectives.

This feature enhances Wanderer's utility for mission runners, providing a lightweight alternative to external tools while staying true to Wanderer's focus on simplicity and integration.

## Future Enhancements

- Automatic mission detection via ESI (if CCP adds API support).
- Bulk import from multiple characters.
- Integration with in-game notifications for mission updates.

## LLM Technical Overview (For AI-Assisted Development)

**Feature Name**: Agent Missions Route Planner  
**Domain**: WandererApp.Api (Ash-based)  
**Frontend**: React/TypeScript widget in map UI  
**Database**: New table `agent_missions` (similar to `map_system_signatures_v1`)  
**Key Parallels**: Mirrors MapSystemSignature resource; extends Map.Routes for mission waypoints.  

**Core Components**:
- **API Resource**: `WandererApp.Api.AgentMission` (Ash.Resource) with fields: id, character_eve_id, map_id, mission_name, system_id, location_name, mission_type (:encounter|:home_base), status (:active|:completed), created_at, updated_at. Actions: create (via paste), update (mark complete), read (by character/map), destroy.
- **Parsing Service**: `WandererApp.AgentMissions.Parser` (Elixir module) to handle tab-separated bookmark text (e.g., "Agent Home Base - K3JR-J\tStation\t3\tK3JR-J\t48R-PS\tVenal\t2025.12.27 17:09\t-"). Regex patterns: ~r/^Agent Home Base - (.+)$/ for home bases, ~r/^Encounter .+ - (.+)$/ for encounters. Extract system_id via CachedInfo lookup on system name (e.g., "K3JR-J"). Group by timestamp or sequence to pair encounters with home bases.
- **Widget**: `Signatures`-like component in `assets/js/hooks/Mapper/components/map/components/Missions/` with paste input (multi-line textarea), list view (grouped by mission pairs), filters (by status/character/type), and route integration buttons.
- **Routing Integration**: Extend `Map.Routes.find/5` to accept mission waypoints as hubs; prioritize encounter systems first, then home bases. Use `MapUserSettingsRepo` for character-specific routes.
- **Event Handling**: New `MapMissionsEventHandler` in `lib/wanderer_app_web/live/map/event_handlers/` for UI events like "paste_missions", "mark_complete", "get_mission_routes".
- **Permissions**: Respect map ACLs; missions visible only to map members with read access.
- **Testing**: Unit tests for parser (handle tab-separated format, invalid lines); integration tests for widget CRUD and route calculation.

**Implementation Steps** (High-Level)**:
1. Add Ash resource and migration for `agent_missions` table.
2. Implement parser module with bookmark text processing and pairing logic.
3. Create API endpoints via AshJsonApi.
4. Build frontend widget with paste handler and list rendering.
5. Integrate with routes widget for pathfinding (encounters first, then home bases).
6. Add event handlers for real-time updates.
7. Update map UI to include Missions widget toggle.

**Dependencies**: Reuses existing CachedInfo for system lookups, Map.Routes for pathfinding, and character auth via Ash. No new external libs needed.  
**Edge Cases**: Handle unpaired bookmarks (e.g., missing encounter/home base); validate system names against EVE data; deduplicate based on system/timestamp; clean up completed missions after X days.  
**Validation**: Ensure system IDs exist in EVE data; bookmarks parsed server-side for security; reject malformed tab-separated input.  

This structure aligns with Wanderer's modular Ash/Phoenix/React architecture, ensuring minimal disruption.