defmodule WandererApp.AgentMissions.ParserTest do
  use ExUnit.Case, async: true

  alias WandererApp.AgentMissions.Parser

  # Sample bookmark lines using real EVE format (tab-separated)
  @encounter_line "Encounter (Deadspace) - H-PA29\tBookmark\t1\tH-PA29\tEDVY-W\tVenal\t2025.12.27 17:09\t-"
  @home_base_line "Agent Home Base - K3JR-J\tStation\t3\tK3JR-J\t48R-PS\tVenal\t2025.12.27 17:09\t-"

  @sample_text """
  Encounter (Deadspace) - H-PA29\tBookmark\t1\tH-PA29\tEDVY-W\tVenal\t2025.12.27 17:09\t-
  Agent Home Base - K3JR-J\tStation\t3\tK3JR-J\t48R-PS\tVenal\t2025.12.27 17:09\t-
  """

  describe "parse/1" do
    test "parses an encounter bookmark line" do
      {:ok, [mission]} = Parser.parse(@encounter_line)

      assert mission.mission_type == :encounter
      assert mission.mission_name == "H-PA29"
      assert mission.system_name == "H-PA29"
      assert mission.constellation == "EDVY-W"
      assert mission.region == "Venal"
      assert mission.datetime_str == "2025.12.27 17:09"
      assert mission.raw_title == "Encounter (Deadspace) - H-PA29"
    end

    test "parses a home base bookmark line" do
      {:ok, [mission]} = Parser.parse(@home_base_line)

      assert mission.mission_type == :home_base
      assert mission.mission_name == "K3JR-J"
      assert mission.system_name == "K3JR-J"
      assert mission.constellation == "48R-PS"
      assert mission.region == "Venal"
      assert mission.datetime_str == "2025.12.27 17:09"
      assert mission.raw_title == "Agent Home Base - K3JR-J"
    end

    test "parses multiple lines of mixed types" do
      {:ok, missions} = Parser.parse(@sample_text)
      assert length(missions) == 2
      types = Enum.map(missions, & &1.mission_type)
      assert :encounter in types
      assert :home_base in types
    end

    test "skips unrecognized lines silently" do
      text = "Some random line\tBookmark\t1\tSystem\tConst\tRegion\t2025.01.01 00:00\t-\n#{@encounter_line}"
      {:ok, missions} = Parser.parse(text)
      assert length(missions) == 1
      assert hd(missions).mission_type == :encounter
    end

    test "skips blank lines" do
      text = "\n\n#{@encounter_line}\n\n"
      {:ok, [mission]} = Parser.parse(text)
      assert mission.mission_name == "H-PA29"
    end

    test "returns empty list for text with no parseable lines" do
      {:ok, missions} = Parser.parse("completely unrelated text\nanother line\n")
      assert missions == []
    end

    test "returns error for empty input" do
      assert {:error, :empty_input} = Parser.parse("")
      assert {:error, :empty_input} = Parser.parse("   \n  \n ")
    end

    test "returns error for non-string input" do
      assert {:error, :empty_input} = Parser.parse(nil)
      assert {:error, :empty_input} = Parser.parse(123)
    end

    test "handles encounter with different deadspace types" do
      line = "Encounter (Unrated Complex) - Jita\tBookmark\t1\tJita\tLonetrek\tThe Forge\t2026.01.01 12:00\t-"
      {:ok, [mission]} = Parser.parse(line)
      assert mission.mission_type == :encounter
      assert mission.mission_name == "Jita"
    end

    test "handles system name with numbers and hyphens" do
      line = "Agent Home Base - 9-F0B2\tStation\t1\t9-F0B2\tSome Const\tSome Region\t2026.01.01 12:00\t-"
      {:ok, [mission]} = Parser.parse(line)
      assert mission.mission_type == :home_base
      assert mission.mission_name == "9-F0B2"
      assert mission.system_name == "9-F0B2"
    end

    test "handles tab-only line gracefully (no title)" do
      {:ok, missions} = Parser.parse("actual text with no bookmark format\t\t\t\t\t\t\t")
      assert missions == []
    end
  end

  describe "pair_missions/1" do
    test "pairs encounters with home bases by order" do
      {:ok, missions} = Parser.parse(@sample_text)
      %{pairs: pairs, unpaired: unpaired} = Parser.pair_missions(missions)

      assert length(pairs) == 1
      assert unpaired == []

      {encounter, home_base} = hd(pairs)
      assert encounter.mission_type == :encounter
      assert home_base.mission_type == :home_base
    end

    test "returns unpaired when encounter has no matching home base" do
      {:ok, [encounter]} = Parser.parse(@encounter_line)
      %{pairs: pairs, unpaired: unpaired} = Parser.pair_missions([encounter])

      assert pairs == []
      assert length(unpaired) == 1
      assert hd(unpaired).mission_type == :encounter
    end

    test "returns unpaired when home base has no matching encounter" do
      {:ok, [home_base]} = Parser.parse(@home_base_line)
      %{pairs: pairs, unpaired: unpaired} = Parser.pair_missions([home_base])

      assert pairs == []
      assert length(unpaired) == 1
      assert hd(unpaired).mission_type == :home_base
    end

    test "pairs multiple missions in order" do
      text = """
      Encounter (Deadspace) - H-PA29\tBookmark\t1\tH-PA29\tEDVY-W\tVenal\t2025.12.27 17:09\t-
      Agent Home Base - K3JR-J\tStation\t3\tK3JR-J\t48R-PS\tVenal\t2025.12.27 17:09\t-
      Encounter (Deadspace) - Jita\tBookmark\t1\tJita\tLonetrek\tThe Forge\t2026.01.01 12:00\t-
      Agent Home Base - Amarr\tStation\t1\tAmarr\tDomain\tAmarr\t2026.01.01 12:00\t-
      """

      {:ok, missions} = Parser.parse(text)
      %{pairs: pairs, unpaired: unpaired} = Parser.pair_missions(missions)

      assert length(pairs) == 2
      assert unpaired == []
    end

    test "handles empty mission list" do
      %{pairs: pairs, unpaired: unpaired} = Parser.pair_missions([])
      assert pairs == []
      assert unpaired == []
    end
  end
end
