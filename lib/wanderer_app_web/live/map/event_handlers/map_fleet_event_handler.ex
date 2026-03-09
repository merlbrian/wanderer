defmodule WandererAppWeb.MapFleetEventHandler do
  use WandererAppWeb, :live_component
  use Phoenix.Component
  require Logger

  alias WandererAppWeb.MapCoreEventHandler
  alias WandererApp.Character.Fleet

  @doc """
  Iterates the current user's owned characters until we find one in a fleet,
  then returns the full member list for that fleet.

  Reply shape:
    {:ok}    => %{fleet_id: integer, members: [%{character_id, character_name, role, wing_id, squad_id, ship_type_id, solar_system_id}]}
    {:error} => %{error: "not_in_fleet"}
  """
  def handle_ui_event(
        "get_fleet",
        _event,
        %{assigns: %{current_user: current_user}} = socket
      ) do
    # Collect which characters are missing fleet scope, and try the rest for fleet
    {missing_scope_chars, fleet_eligible_chars} =
      current_user.characters
      |> Enum.split_with(fn %{id: char_id} ->
        case WandererApp.Character.get_character(char_id) do
          {:ok, char} -> not WandererApp.Character.has_fleet_access?(char)
          _ -> true
        end
      end)

    result =
      fleet_eligible_chars
      |> Enum.reduce_while({:error, :not_in_fleet}, fn %{id: char_id} = _char, _acc ->
        case Fleet.get_fleet_for_character(char_id) do
          {:ok, %{"fleet_id" => fleet_id} = _info} ->
            case Fleet.get_fleet_members(char_id, fleet_id) do
              {:ok, members} ->
                {:halt, {:ok, char_id, fleet_id, members}}

              _ ->
                {:cont, {:error, :not_in_fleet}}
            end

          _ ->
            {:cont, {:error, :not_in_fleet}}
        end
      end)

    missing_scope_names = Enum.map(missing_scope_chars, & &1.name)

    case result do
      {:ok, boss_char_id, fleet_id, members} ->
        {:reply, %{fleet_id: fleet_id, members: members},
         Phoenix.Component.assign(socket, :fleet_boss_char_id, boss_char_id)}

      {:error, :not_in_fleet} when missing_scope_chars != [] and fleet_eligible_chars == [] ->
        # All characters lack fleet scope — prompt re-auth
        {:reply, %{error: "missing_scope", characters: missing_scope_names}, socket}

      {:error, :not_in_fleet} ->
        {:reply, %{error: "not_in_fleet", missing_scope_characters: missing_scope_names}, socket}
    end
  end

  def handle_ui_event(
        "set_wing_commander",
        %{
          "fleet_id" => fleet_id,
          "target_character_eve_id" => target_eve_id
        },
        %{assigns: assigns} = socket
      ) do
    boss_char_id = Map.get(assigns, :fleet_boss_char_id)

    if is_nil(boss_char_id) do
      {:reply, %{status: "error", reason: "fleet not loaded — please refresh the fleet widget first"}, socket}
    else
      do_set_wing_commander(socket, fleet_id, boss_char_id, target_eve_id)
    end
  end

  def handle_ui_event(event, body, socket),
    do: MapCoreEventHandler.handle_ui_event(event, body, socket)

  # ---------------------------------------------------------------------------
  # Private helpers
  # ---------------------------------------------------------------------------

  defp do_set_wing_commander(socket, fleet_id, boss_char_id, target_eve_id) do
    # Fetch fresh member list to find wing_id and current wing_commander
    case Fleet.get_fleet_members(boss_char_id, fleet_id) do
      {:ok, members} ->
        # Find Wing 1 — the wing_id used by current members (any wing member or commander)
        wing_id =
          members
          |> Enum.find_value(fn
            %{"wing_id" => wid} when not is_nil(wid) and wid > 0 -> wid
            _ -> nil
          end)

        if is_nil(wing_id) do
          {:reply, %{status: "error", reason: "no wing found in fleet — please create Wing 1 in-game"}, socket}
        else
          # Find the target member_id (ESI uses integer character_id as member_id)
          target_member =
            members
            |> Enum.find(fn m ->
              (m["character_id"] || m[:character_id]) |> to_string() == to_string(integer_eve_id(target_eve_id))
            end)

          if is_nil(target_member) do
            {:reply, %{status: "error", reason: "target character not in fleet"}, socket}
          else
            target_member_id = target_member["character_id"] || target_member[:character_id]

            # Demote existing wing_commander(s) to squad_member
            members
            |> Enum.filter(fn m ->
              (m["role"] || m[:role]) == "wing_commander" &&
                (m["character_id"] || m[:character_id]) != target_member_id
            end)
            |> Task.async_stream(
              fn m ->
                member_id = m["character_id"] || m[:character_id]
                Fleet.set_fleet_member_role(boss_char_id, fleet_id, member_id, "squad_member", wing_id, nil)
              end,
              max_concurrency: 4,
              timeout: :timer.seconds(30)
            )
            |> Enum.each(fn _ -> :ok end)

            # Promote target to wing_commander
            case Fleet.set_fleet_member_role(boss_char_id, fleet_id, target_member_id, "wing_commander", wing_id, nil) do
              :ok ->
                {:reply, %{status: "ok"}, socket}

              {:error, reason} ->
                Logger.error("[MapFleetEventHandler] promote failed: #{inspect(reason)}")
                {:reply, %{status: "error", reason: inspect(reason)}, socket}
            end
          end
        end

      {:error, reason} ->
        Logger.error("[MapFleetEventHandler] get_fleet_members failed: #{inspect(reason)}")
        {:reply, %{status: "error", reason: "could not fetch fleet members"}, socket}
    end
  end

  defp integer_eve_id(eve_id) when is_binary(eve_id) do
    case Integer.parse(eve_id) do
      {i, _} -> i
      :error -> eve_id
    end
  end

  defp integer_eve_id(eve_id), do: eve_id
end
