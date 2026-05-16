defmodule WandererAppWeb.DevLoginController do
  @moduledoc false

  use WandererAppWeb, :controller

  import Plug.Conn

  @test_user_hash "test_user_e2e"
  @test_user_name "E2E Test User"
  @test_character_eve_id "0"
  @test_character_name "E2E Test Character"

  def login(conn, _params) do
    user_id = find_or_create_test_user()
    find_or_create_test_character(user_id)

    conn
    |> put_session(:user_id, user_id)
    |> redirect(to: "/maps")
  end

  defp find_or_create_test_user do
    case WandererApp.Api.User.by_hash(@test_user_hash) do
      {:ok, user} ->
        user.id

      _ ->
        WandererApp.Api.User
        |> Ash.Changeset.for_create(:create, %{
          name: @test_user_name,
          hash: @test_user_hash
        })
        |> Ash.create!()
        |> Map.get(:id)
    end
  end

  defp find_or_create_test_character(user_id) do
    case WandererApp.Api.Character.by_eve_id(@test_character_eve_id) do
      {:ok, _character} ->
        :ok

      _ ->
        WandererApp.Api.Character
        |> Ash.Changeset.for_create(:link, %{
          eve_id: @test_character_eve_id,
          name: @test_character_name,
          user_id: user_id
        })
        |> Ash.create!()
    end
  end
end
