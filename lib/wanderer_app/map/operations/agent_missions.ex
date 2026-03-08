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
        |> Enum.reduce({[], []}, fn mission, {acc_created, acc_skipped} ->
          case resolve_and_create(map_id, character_eve_id, mission) do
            {:ok, record} -> {[mission_to_map(record) | acc_created], acc_skipped}
            {:skip, reason} -> {acc_created, [Map.put(mission, :skip_reason, reason) | acc_skipped]}
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

  defp resolve_and_create(map_id, character_eve_id, %{system_name: system_name} = parsed) do
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
        Logger.error("[AgentMissions] system lookup error for #{inspect(system_name)}: #{inspect(reason)}")
        {:skip, :lookup_error}
    end
  end

  defp mission_to_map(mission) do
    mission
    |> Map.from_struct()
    |> Map.drop([:__meta__, :map_system, :aggregates, :calculations])
  end
end
