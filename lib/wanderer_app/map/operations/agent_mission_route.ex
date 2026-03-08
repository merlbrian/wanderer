defmodule WandererApp.Map.Operations.AgentMissionRoute do
  @moduledoc """
  Operations for the per-map Saved Route feature.
  Stores a list of system names + IDs per map, upserted on each save.
  """

  require Logger

  alias WandererApp.Api.AgentMissionRoute
  alias WandererApp.CachedInfo

  @doc """
  Returns the saved route for a map, or an empty route if none exists.
  """
  @spec get_route(String.t()) :: {:ok, %{names: [String.t()], ids: [integer()]}}
  def get_route(map_id) do
    case AgentMissionRoute.get_by_map_id(map_id) do
      {:ok, route} ->
        {:ok, %{names: route.solar_system_names, ids: route.solar_system_ids}}

      {:error, _} ->
        {:ok, %{names: [], ids: []}}
    end
  end

  @doc """
  Saves a route for a map, resolving system names to IDs.
  Systems whose names cannot be resolved are skipped and returned in the `skipped` list.
  Returns `{:ok, %{saved_count: N, skipped: [name, ...]}}`.
  """
  @spec save_route(String.t(), [String.t()]) ::
          {:ok, %{saved_count: non_neg_integer(), skipped: [String.t()]}} | {:error, term()}
  def save_route(map_id, system_names) do
    {resolved_names, ids, skipped} =
      Enum.reduce(system_names, {[], [], []}, fn name, {acc_names, acc_ids, acc_skip} ->
        case CachedInfo.get_system_id_by_name(name) do
          {:ok, id} -> {[name | acc_names], [id | acc_ids], acc_skip}
          _ -> {acc_names, acc_ids, [name | acc_skip]}
        end
      end)

    resolved_names = Enum.reverse(resolved_names)
    ids = Enum.reverse(ids)
    skipped = Enum.reverse(skipped)

    attrs = %{
      map_id: map_id,
      solar_system_names: resolved_names,
      solar_system_ids: ids
    }

    case AgentMissionRoute.save_route(attrs) do
      {:ok, _} ->
        {:ok, %{saved_count: length(ids), skipped: skipped}}

      {:error, reason} ->
        Logger.error("[AgentMissionRoute.save_route] error: #{inspect(reason)}")
        {:error, reason}
    end
  end
end
