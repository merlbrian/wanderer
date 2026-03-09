defmodule WandererApp.Repo.Migrations.AddAgentMissions do
  @moduledoc """
  Creates the agent_missions_v1 table for the Agent Missions Route Planner feature.
  """

  use Ecto.Migration

  def up do
    create table(:agent_missions_v1, primary_key: false) do
      add :id, :uuid, null: false, default: fragment("gen_random_uuid()"), primary_key: true
      add :character_eve_id, :text, null: false
      add :map_id, :uuid, null: false
      add :solar_system_id, :bigint, null: false
      add :system_name, :text, null: false
      add :constellation, :text
      add :region, :text
      add :mission_name, :text, null: false
      add :mission_type, :text, null: false
      add :status, :text, null: false, default: "active"
      add :deleted, :boolean, null: false, default: false

      add :inserted_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :updated_at, :utc_datetime_usec,
        null: false,
        default: fragment("(now() AT TIME ZONE 'utc')")

      add :map_system_id,
          references(:map_system_v1,
            column: :id,
            name: "agent_missions_v1_map_system_id_fkey",
            type: :uuid,
            prefix: "public",
            on_delete: :nilify_all
          )
    end

    create unique_index(
             :agent_missions_v1,
             [:character_eve_id, :map_id, :solar_system_id, :mission_type],
             name: "agent_missions_v1_uniq_char_map_system_type_index"
           )

    create index(:agent_missions_v1, [:map_id],
             name: "agent_missions_v1_map_id_index"
           )

    create index(:agent_missions_v1, [:character_eve_id, :map_id],
             name: "agent_missions_v1_character_map_index"
           )
  end

  def down do
    drop_if_exists unique_index(
                     :agent_missions_v1,
                     [:character_eve_id, :map_id, :solar_system_id, :mission_type],
                     name: "agent_missions_v1_uniq_char_map_system_type_index"
                   )

    drop_if_exists index(:agent_missions_v1, [:map_id],
                     name: "agent_missions_v1_map_id_index"
                   )

    drop_if_exists index(:agent_missions_v1, [:character_eve_id, :map_id],
                     name: "agent_missions_v1_character_map_index"
                   )

    drop constraint(:agent_missions_v1, "agent_missions_v1_map_system_id_fkey")

    drop table(:agent_missions_v1)
  end
end
