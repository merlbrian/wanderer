defmodule WandererApp.Repo.Migrations.AddMissionDatetimeAndCount do
  @moduledoc """
  Adds mission_datetime and mission_count to agent_missions_v1.

  - mission_datetime: the EVE bookmark timestamp (e.g. "2026.03.08 18:07"), used as part of
    the upsert identity so that new missions (new timestamp) create fresh rows while
    re-importing old bookmarks (same timestamp) leaves existing status untouched.

  - mission_count: number of identical missions in one paste (same system + type + datetime).
    Two P-FSQE encounter bookmarks at 18:07 → one row with mission_count=2.

  Old unique index (char, map, system, type) is replaced with
  (char, map, system, type, mission_datetime).

  Table is truncated first since all existing rows are dev test data.
  """
  use Ecto.Migration

  def up do
    execute("TRUNCATE agent_missions_v1")

    alter table(:agent_missions_v1) do
      add :mission_datetime, :text, null: false, default: ""
      add :mission_count, :integer, null: false, default: 1
    end

    drop_if_exists(
      unique_index(
        :agent_missions_v1,
        [:character_eve_id, :map_id, :solar_system_id, :mission_type],
        name: "agent_missions_v1_uniq_char_map_system_type_index"
      )
    )

    create(
      unique_index(
        :agent_missions_v1,
        [:character_eve_id, :map_id, :solar_system_id, :mission_type, :mission_datetime],
        name: "agent_missions_v1_uniq_char_map_system_type_datetime_index"
      )
    )
  end

  def down do
    execute("TRUNCATE agent_missions_v1")

    drop_if_exists(
      unique_index(
        :agent_missions_v1,
        [:character_eve_id, :map_id, :solar_system_id, :mission_type, :mission_datetime],
        name: "agent_missions_v1_uniq_char_map_system_type_datetime_index"
      )
    )

    alter table(:agent_missions_v1) do
      remove :mission_datetime
      remove :mission_count
    end

    create(
      unique_index(
        :agent_missions_v1,
        [:character_eve_id, :map_id, :solar_system_id, :mission_type],
        name: "agent_missions_v1_uniq_char_map_system_type_index"
      )
    )
  end
end
