defmodule WandererApp.Map.Operations.AgentMissions do
  @moduledoc """
  CRUD and bookmark import for Agent Missions.
  """

  require Logger

  alias WandererApp.Api.AgentMission
  alias WandererApp.AgentMissions.Parser
  alias WandererApp.CachedInfo

  @doc """
  Returns all active missions for a map, sorted by insertion order.
  """
  @spec list_missions(String.t()) :: [map()]
  def list_missions(map_id) do
    case AgentMission.by_map_id(map_id) do
      {:ok, missions} ->
        Enum.map(missions, &mission_to_map/1)

      {:error, reason} ->
        Logger.error("[AgentMissions.list_missions] error: #{inspect(reason)}")
        []
    end
  end

  @doc """
  Returns all active missions for a specific character on a map.
  """
  @spec list_missions_for_character(String.t(), String.t()) :: [map()]
  def list_missions_for_character(character_eve_id, map_id) do
    case AgentMission.by_character_and_map(character_eve_id, map_id) do
      {:ok, missions} ->
        Enum.map(missions, &mission_to_map/1)

      {:error, reason} ->
        Logger.error("[AgentMissions.list_missions_for_character] error: #{inspect(reason)}")
        []
    end
  end

  @doc """
  Parses pasted EVE bookmark text and creates missions for the given character + map.

  Returns `{:ok, %{created: [mission], skipped: [raw]}}` where `skipped` contains
  lines that could not be resolved to a known EVE system.
  """
  @spec create_missions_from_text(String.t(), String.t(), String.t()) ::
          {:ok, %{created: [map()], skipped: [map()]}} | {:error, atom()}
  def create_missions_from_text(map_id, character_eve_id, bookmark_text) do
    with {:ok, parsed} <- Parser.parse(bookmark_text) do
      {created, skipped} =
        parsed
        |> Enum.reject(fn m -> m.mission_type == :home_base end)
        |> Enum.group_by(fn m -> {m.system_name, m.mission_type, m.datetime_str} end)
        |> Enum.reduce({[], []}, fn {_key, [first | _] = group}, {acc_created, acc_skipped} ->
          case resolve_and_create(map_id, character_eve_id, first, length(group)) do
            {:ok, record} -> {[mission_to_map(record) | acc_created], acc_skipped}
            {:skip, reason} -> {acc_created, [Map.put(first, :skip_reason, reason) | acc_skipped]}
          end
        end)

      {:ok, %{created: Enum.reverse(created), skipped: Enum.reverse(skipped)}}
    end
  end

  @doc """
  Marks a mission as completed (soft status update).
  """
  @spec complete_mission(String.t()) :: {:ok, map()} | {:error, term()}
  def complete_mission(mission_id) do
    with {:ok, mission} <- AgentMission.by_id(mission_id),
         {:ok, updated} <- AgentMission.update(mission, %{status: "completed"}) do
      {:ok, mission_to_map(updated)}
    end
  end

  @doc """
  Marks all active missions for a specific character in a system as completed.
  """
  @spec complete_missions_for_character_in_system(String.t(), String.t(), String.t()) ::
          :ok | {:error, term()}
  def complete_missions_for_character_in_system(character_eve_id, map_id, system_name) do
    case AgentMission.by_character_and_map(character_eve_id, map_id) do
      {:ok, missions} ->
        missions
        |> Enum.filter(fn m -> m.system_name == system_name && m.status == "active" end)
        |> Enum.each(fn m -> AgentMission.update(m, %{status: "completed"}) end)

        :ok

      {:error, reason} ->
        Logger.error(
          "[AgentMissions.complete_missions_for_character_in_system] error: #{inspect(reason)}"
        )

        {:error, reason}
    end
  end

  @doc """
  Marks all active missions in a system as completed (all characters).
  """
  @spec complete_all_missions_in_system(String.t(), String.t()) :: :ok | {:error, term()}
  def complete_all_missions_in_system(map_id, system_name) do
    case AgentMission.by_map_id(map_id) do
      {:ok, missions} ->
        missions
        |> Enum.filter(fn m -> m.system_name == system_name && m.status == "active" end)
        |> Enum.each(fn m -> AgentMission.update(m, %{status: "completed"}) end)

        :ok

      {:error, reason} ->
        Logger.error("[AgentMissions.complete_all_missions_in_system] error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Soft-deletes all completed missions for a character on a map so they can be re-imported fresh.
  """
  @spec reset_all_missions_for_character(String.t(), String.t()) :: :ok | {:error, term()}
  def reset_all_missions_for_character(character_eve_id, map_id) do
    case AgentMission.by_map_id_completed(map_id) do
      {:ok, missions} ->
        missions
        |> Enum.filter(fn m -> m.character_eve_id == character_eve_id end)
        |> Enum.each(fn m -> AgentMission.update(m, %{deleted: true}) end)

        :ok

      {:error, reason} ->
        Logger.error("[AgentMissions.reset_all_missions_for_character] error: #{inspect(reason)}")
        {:error, reason}
    end
  end

  @doc """
  Soft-deletes a mission.
  """
  @spec delete_mission(String.t()) :: :ok | {:error, term()}
  def delete_mission(mission_id) do
    with {:ok, mission} <- AgentMission.by_id(mission_id),
         {:ok, _} <- AgentMission.update(mission, %{deleted: true}) do
      :ok
    end
  end

  # --- Private ---

  defp resolve_and_create(
         map_id,
         character_eve_id,
         %{system_name: system_name} = parsed,
         mission_count
       ) do
    case CachedInfo.get_system_id_by_name(system_name) do
      {:ok, solar_system_id} ->
        attrs = %{
          map_id: map_id,
          character_eve_id: character_eve_id,
          solar_system_id: solar_system_id,
          system_name: parsed.system_name,
          constellation: parsed.constellation,
          region: parsed.region,
          mission_name: parsed.mission_name,
          mission_type: Atom.to_string(parsed.mission_type),
          mission_datetime: parsed.datetime_str,
          mission_count: mission_count,
          status: "active",
          deleted: false
        }

        case AgentMission.create(attrs) do
          {:ok, record} ->
            {:ok, record}

          {:error, reason} ->
            Logger.error("[AgentMissions.resolve_and_create] create error: #{inspect(reason)}")
            {:skip, :create_error}
        end

      {:error, :not_found} ->
        Logger.warning("[AgentMissions] system not found in EVE data: #{inspect(system_name)}")
        {:skip, :system_not_found}

      {:error, reason} ->
        Logger.error(
          "[AgentMissions] system lookup error for #{inspect(system_name)}: #{inspect(reason)}"
        )

        {:skip, :lookup_error}
    end
  end

  defp mission_to_map(mission) do
    mission
    |> Map.from_struct()
    |> Map.drop([:__meta__, :map_system, :aggregates, :calculations])
  end
end
