defmodule WandererApp.Api.AgentMissionRoute do
  @moduledoc false

  use Ash.Resource,
    domain: WandererApp.Api,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshJsonApi.Resource]

  postgres do
    repo(WandererApp.Repo)
    table("agent_mission_routes_v1")
  end

  json_api do
    type "agent_mission_routes"

    routes do
      # Exposed via map event handler, not directly via JSON API routes
    end
  end

  code_interface do
    define(:save_route, action: :create)
    define(:get_by_map_id, action: :by_map_id, args: [:map_id])
  end

  actions do
    default_accept [:map_id, :solar_system_names, :solar_system_ids]

    read :read do
      primary?(true)
    end

    create :create do
      primary? true
      upsert? true
      upsert_identity :uniq_map_id

      upsert_fields [
        :solar_system_names,
        :solar_system_ids,
        :updated_at
      ]

      accept [:map_id, :solar_system_names, :solar_system_ids]
    end

    read :by_map_id do
      argument :map_id, :uuid, allow_nil?: false
      get? true
      filter expr(map_id == ^arg(:map_id))
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :map_id, :uuid do
      allow_nil? false
    end

    attribute :solar_system_names, {:array, :string} do
      allow_nil? false
      default []
    end

    attribute :solar_system_ids, {:array, :integer} do
      allow_nil? false
      default []
    end

    create_timestamp :inserted_at
    update_timestamp :updated_at
  end

  identities do
    identity :uniq_map_id, [:map_id]
  end
end
