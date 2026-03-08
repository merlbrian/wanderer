defmodule WandererApp.Repo.Migrations.AddAgentMissionRoutes do
  @moduledoc """
  Creates the agent_mission_routes_v1 table for the Saved Route feature.
  One row per map, upserted on save.
  """

  use Ecto.Migration

  def up do
    create table(:agent_mission_routes_v1, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :map_id, :uuid, null: false
      add :solar_system_names, {:array, :text}, null: false, default: []
      add :solar_system_ids, {:array, :bigint}, null: false, default: []

      add :inserted_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :updated_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")
    end

    create unique_index(:agent_mission_routes_v1, [:map_id],
             name: "agent_mission_routes_v1_uniq_map_id_index"
           )
  end

  def down do
    drop_if_exists unique_index(
                     :agent_mission_routes_v1,
                     [:map_id],
                     name: "agent_mission_routes_v1_uniq_map_id_index"
                   )

    drop_if_exists table(:agent_mission_routes_v1)
  end
end
