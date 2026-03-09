defmodule WandererApp.AgentMissions.Parser do
  @moduledoc """
  Parses tab-separated EVE Online Agent Mission bookmark text into structured mission data.

  EVE exports bookmark pairs for each mission:
    - Encounter line:  "Encounter (Deadspace) - SYSTEM\\tBookmark\\t...\\tSYSTEM\\tCONST\\tREGION\\tDATETIME\\t-"
    - Home Base line:  "Agent Home Base - SYSTEM\\tStation\\t...\\tSYSTEM\\tCONST\\tREGION\\tDATETIME\\t-"

  Returns a list of parsed mission maps. Unpaired bookmarks are still returned
  individually; pairing (encounter ↔ home_base) is left to the caller.
  """

  @encounter_regex ~r/^Encounter\s+\([^)]+\)\s+-\s+(.+)$/
  @home_base_regex ~r/^Agent Home Base\s+-\s+(.+)$/

  @type mission_type :: :encounter | :home_base

  @type parsed_mission :: %{
          mission_name: String.t(),
          system_name: String.t(),
          constellation: String.t(),
          region: String.t(),
          mission_type: mission_type(),
          datetime_str: String.t(),
          raw_title: String.t()
        }

  @doc """
  Parses a multi-line string of EVE bookmark text.

  Returns `{:ok, missions}` where `missions` is a list of `parsed_mission` maps,
  or `{:error, :empty_input}` if the input is blank.

  Lines that cannot be parsed are silently skipped.
  """
  @spec parse(String.t()) :: {:ok, [parsed_mission()]} | {:error, :empty_input}
  def parse(text) when is_binary(text) do
    missions =
      text
      |> String.split("\n")
      |> Enum.map(&String.trim/1)
      |> Enum.reject(&(&1 == ""))
      |> Enum.flat_map(&parse_line/1)

    case missions do
      [] ->
        if String.trim(text) == "" do
          {:error, :empty_input}
        else
          {:ok, []}
        end

      missions ->
        {:ok, missions}
    end
  end

  def parse(_), do: {:error, :empty_input}

  @doc """
  Pairs encounter and home_base missions from a parsed list.

  Pairs are matched by index order: the first encounter is paired with the first
  home_base, the second encounter with the second home_base, and so on.
  Leftover unpaired missions are returned in the `:unpaired` list.

  Returns `%{pairs: [{encounter, home_base}], unpaired: [mission]}`.
  """
  @spec pair_missions([parsed_mission()]) :: %{
          pairs: [{parsed_mission(), parsed_mission()}],
          unpaired: [parsed_mission()]
        }
  def pair_missions(missions) when is_list(missions) do
    encounters = Enum.filter(missions, &(&1.mission_type == :encounter))
    home_bases = Enum.filter(missions, &(&1.mission_type == :home_base))

    pairs = Enum.zip(encounters, home_bases)

    paired_encounters = Enum.take(encounters, length(pairs))
    paired_home_bases = Enum.take(home_bases, length(pairs))

    unpaired =
      (encounters -- paired_encounters) ++ (home_bases -- paired_home_bases)

    %{pairs: pairs, unpaired: unpaired}
  end

  # --- Private ---

  defp parse_line(line) do
    fields = String.split(line, "\t")

    case fields do
      [title | rest] ->
        case classify_title(title) do
          {:ok, mission_type, mission_name} ->
            mission = build_mission(title, mission_name, mission_type, rest)
            [mission]

          :error ->
            []
        end

      _ ->
        []
    end
  end

  defp classify_title(title) do
    cond do
      Regex.match?(@encounter_regex, title) ->
        [_, system_name] = Regex.run(@encounter_regex, title)
        {:ok, :encounter, String.trim(system_name)}

      Regex.match?(@home_base_regex, title) ->
        [_, system_name] = Regex.run(@home_base_regex, title)
        {:ok, :home_base, String.trim(system_name)}

      true ->
        :error
    end
  end

  # Fields after the title in EVE bookmark export (0-indexed into `rest`):
  # 0: type (e.g. "Station", "In Space")
  # 1: count (numeric string)
  # 2: system name (repeated)
  # 3: constellation
  # 4: region
  # 5: datetime (e.g. "2025.12.27 17:09")
  # 6: notes ("-")
  defp build_mission(raw_title, mission_name, mission_type, rest) do
    system_name = Enum.at(rest, 2, mission_name)
    constellation = Enum.at(rest, 3, "")
    region = Enum.at(rest, 4, "")
    datetime_str = Enum.at(rest, 5, "")

    %{
      mission_name: mission_name,
      system_name: String.trim(system_name),
      constellation: String.trim(constellation),
      region: String.trim(region),
      mission_type: mission_type,
      datetime_str: String.trim(datetime_str),
      raw_title: raw_title
    }
  end
end
