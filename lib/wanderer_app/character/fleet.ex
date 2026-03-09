defmodule WandererApp.Character.Fleet do
  @moduledoc """
  Character-level fleet operations — wraps ESI fleet endpoints with token handling.
  """

  require Logger

  alias WandererApp.Esi

  @doc """
  Returns the fleet info for a character, or `{:error, :not_in_fleet}` if they
  are not currently in a fleet or lack the required ESI scope.
  """
  @spec get_fleet_for_character(String.t()) ::
          {:ok, map()} | {:error, :not_in_fleet} | {:error, term()}
  def get_fleet_for_character(character_id) do
    with {:ok, %{access_token: access_token, eve_id: eve_id} = character} <-
           WandererApp.Character.get_character(character_id),
         :ok <- check_fleet_scope(character),
         {:ok, fleet_info} <-
           Esi.get_character_fleet(eve_id,
             access_token: access_token,
             character_id: character_id,
             refresh_token?: true
           ) do
      {:ok, fleet_info}
    else
      {:error, :missing_scope} -> {:error, :missing_scope}
      {:error, :forbidden} -> {:error, :not_in_fleet}
      {:error, :not_found} -> {:error, :not_in_fleet}
      {:error, reason} -> {:error, reason}
    end
  end

  defp check_fleet_scope(character) do
    if WandererApp.Character.has_fleet_access?(character), do: :ok, else: {:error, :missing_scope}
  end

  @doc """
  Returns the full member list for `fleet_id`, authenticated as `character_id`.
  """
  @spec get_fleet_members(String.t(), integer()) :: {:ok, list(map())} | {:error, term()}
  def get_fleet_members(character_id, fleet_id) do
    with {:ok, %{access_token: access_token}} <-
           WandererApp.Character.get_character(character_id) do
      Esi.get_fleet_members(fleet_id,
        access_token: access_token,
        character_id: character_id,
        refresh_token?: true
      )
    end
  end

  @doc """
  Sets the fleet role for `target_character_eve_id` inside `fleet_id`.
  The call is authenticated as `acting_character_id` (must be wing commander or FC).

  `role` is one of `"fleet_commander"`, `"wing_commander"`, `"squad_commander"`, `"squad_member"`.
  `wing_id` and `squad_id` are required by ESI for positional roles; pass `nil` for squad_member.
  """
  @spec set_fleet_member_role(String.t(), integer(), integer(), String.t(), integer() | nil, integer() | nil) ::
          :ok | {:error, term()}
  def set_fleet_member_role(acting_character_id, fleet_id, target_member_id, role, wing_id, squad_id) do
    with {:ok, %{access_token: access_token}} <-
           WandererApp.Character.get_character(acting_character_id) do
      Esi.move_fleet_member(fleet_id, target_member_id, role, wing_id, squad_id,
        access_token: access_token,
        character_id: acting_character_id,
        refresh_token?: true
      )
    end
  end
end
