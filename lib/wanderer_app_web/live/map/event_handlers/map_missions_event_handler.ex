defmodule WandererAppWeb.MapMissionsEventHandler do
  use WandererAppWeb, :live_component
  use Phoenix.Component
  require Logger

  alias WandererAppWeb.{MapEventHandler, MapCoreEventHandler}
  alias WandererApp.Map.Operations.AgentMissions

  def handle_server_event(
        %{event: :missions_updated, payload: map_id},
        socket
      ),
      do:
        socket
        |> MapEventHandler.push_map_event(
          "missions_updated",
          map_id
        )

  def handle_server_event(event, socket),
    do: MapCoreEventHandler.handle_server_event(event, socket)

  def handle_ui_event(
        "load_missions",
        _event,
        %{
          assigns: %{
            map_id: map_id
          }
        } = socket
      ) do
    missions = AgentMissions.list_missions(map_id)

    {:noreply,
     socket
     |> MapEventHandler.push_map_event("map_updated", %{missions: missions})}
  end

  def handle_ui_event(
        "paste_missions",
        %{
          "character_eve_id" => character_eve_id,
          "bookmark_text" => bookmark_text
        },
        %{
          assigns: %{
            map_id: map_id,
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.create_missions_from_text(map_id, character_eve_id, bookmark_text) do
      {:ok, %{created: created, skipped: skipped}} ->
        Logger.info(
          "[MapMissionsEventHandler] paste_missions: #{length(created)} created, #{length(skipped)} skipped"
        )

        {:reply,
         %{
           status: "ok",
           created_count: length(created),
           skipped_count: length(skipped)
         }, socket}

      {:error, :empty_input} ->
        {:reply, %{status: "error", reason: "empty_input"}, socket}

      {:error, reason} ->
        Logger.error("[MapMissionsEventHandler] paste_missions error: #{inspect(reason)}")
        {:reply, %{status: "error", reason: "internal_error"}, socket}
    end
  end

  def handle_ui_event(
        "get_missions",
        _event,
        %{
          assigns: %{
            map_id: map_id
          }
        } = socket
      ) do
    missions = AgentMissions.list_missions(map_id)
    {:reply, %{missions: missions}, socket}
  end

  def handle_ui_event(
        "complete_mission",
        %{"mission_id" => mission_id},
        %{
          assigns: %{
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.complete_mission(mission_id) do
      {:ok, mission} ->
        {:reply, %{status: "ok", mission: mission}, socket}

      {:error, reason} ->
        Logger.error("[MapMissionsEventHandler] complete_mission error: #{inspect(reason)}")
        {:reply, %{status: "error", reason: "not_found"}, socket}
    end
  end

  def handle_ui_event(
        "delete_mission",
        %{"mission_id" => mission_id},
        %{
          assigns: %{
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.delete_mission(mission_id) do
      :ok ->
        {:reply, %{status: "ok"}, socket}

      {:error, reason} ->
        Logger.error("[MapMissionsEventHandler] delete_mission error: #{inspect(reason)}")
        {:reply, %{status: "error", reason: "not_found"}, socket}
    end
  end

  def handle_ui_event(
        "clear_character_in_system",
        %{"character_eve_id" => character_eve_id, "system_name" => system_name},
        %{
          assigns: %{
            map_id: map_id,
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.complete_missions_for_character_in_system(
           character_eve_id,
           map_id,
           system_name
         ) do
      :ok ->
        {:reply, %{status: "ok"}, socket}

      {:error, reason} ->
        Logger.error(
          "[MapMissionsEventHandler] clear_character_in_system error: #{inspect(reason)}"
        )

        {:reply, %{status: "error"}, socket}
    end
  end

  def handle_ui_event(
        "clear_all_in_system",
        %{"system_name" => system_name},
        %{
          assigns: %{
            map_id: map_id,
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.complete_all_missions_in_system(map_id, system_name) do
      :ok ->
        {:reply, %{status: "ok"}, socket}

      {:error, reason} ->
        Logger.error("[MapMissionsEventHandler] clear_all_in_system error: #{inspect(reason)}")
        {:reply, %{status: "error"}, socket}
    end
  end

  def handle_ui_event(
        "reset_character_missions",
        %{"character_eve_id" => character_eve_id},
        %{
          assigns: %{
            map_id: map_id,
            user_permissions: %{update_system: true}
          }
        } = socket
      ) do
    case AgentMissions.reset_all_missions_for_character(character_eve_id, map_id) do
      :ok ->
        {:reply, %{status: "ok"}, socket}

      {:error, reason} ->
        Logger.error(
          "[MapMissionsEventHandler] reset_character_missions error: #{inspect(reason)}"
        )

        {:reply, %{status: "error"}, socket}
    end
  end

  def handle_ui_event(event, body, socket),
    do: MapCoreEventHandler.handle_ui_event(event, body, socket)
end
