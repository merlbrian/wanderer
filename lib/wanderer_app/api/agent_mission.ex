defmodule WandererApp.Api.AgentMission do
  @moduledoc false

  use Ash.Resource,
    domain: WandererApp.Api,
    data_layer: AshPostgres.DataLayer,
    extensions: [AshJsonApi.Resource]

  postgres do
    repo(WandererApp.Repo)
    table("agent_missions_v1")
  end

  json_api do
    type "agent_missions"

    default_fields([
      :character_eve_id,
      :map_id,
      :solar_system_id,
      :system_name,
      :constellation,
      :region,
      :mission_name,
      :mission_type,
      :mission_datetime,
      :mission_count,
      :status,
      :deleted
    ])

    derive_filter?(true)
    derive_sort?(true)

    routes do
      # Exposed via map event handler, not directly via JSON API routes
    end
  end

  code_interface do
    define(:create, action: :create)
    define(:destroy, action: :destroy)
    define(:update, action: :update)

    define(:by_id,
      get_by: [:id],
      action: :read
    )

    define(:by_map_id, action: :by_map_id, args: [:map_id])
    define(:by_character_and_map, action: :by_character_and_map, args: [:character_eve_id, :map_id])
  end

  actions do
    default_accept [
      :character_eve_id,
      :map_id,
      :map_system_id,
      :solar_system_id,
      :system_name,
      :constellation,
      :region,
      :mission_name,
      :mission_type,
      :mission_datetime,
      :mission_count,
      :status,
      :deleted
    ]

    defaults [:destroy]

    read :read do
      primary?(true)

      pagination offset?: true,
                 default_limit: 200,
                 max_page_size: 500,
                 countable: true,
                 required?: false
    end

    create :create do
      primary? true
      upsert? true
      upsert_identity :uniq_char_map_system_type_datetime

      upsert_fields [
        :system_name,
        :constellation,
        :region,
        :mission_name,
        :mission_count,
        :updated_at
      ]

      accept [
        :character_eve_id,
        :map_id,
        :map_system_id,
        :solar_system_id,
        :system_name,
        :constellation,
        :region,
        :mission_name,
        :mission_type,
        :mission_datetime,
        :mission_count,
        :status,
        :deleted
      ]
    end

    update :update do
      accept [
        :status,
        :deleted,
        :map_system_id
      ]

      primary? true
      require_atomic? false
    end

    read :by_map_id do
      argument(:map_id, :uuid, allow_nil?: false)

      filter(expr(map_id == ^arg(:map_id) and deleted == false and status == "active"))
      prepare build(sort: [inserted_at: :asc])
    end

    read :by_character_and_map do
      argument(:character_eve_id, :string, allow_nil?: false)
      argument(:map_id, :uuid, allow_nil?: false)

      filter(
        expr(
          character_eve_id == ^arg(:character_eve_id) and
            map_id == ^arg(:map_id) and
            deleted == false and
            status == "active"
        )
      )

      prepare build(sort: [inserted_at: :asc])
    end
  end

  attributes do
    uuid_primary_key :id

    attribute :character_eve_id, :string do
      allow_nil? false
      public? true
    end

    attribute :map_id, :uuid do
      allow_nil? false
      public? true
    end

    attribute :solar_system_id, :integer do
      allow_nil? false
      public? true
    end

    attribute :system_name, :string do
      allow_nil? false
      public? true
    end

    attribute :constellation, :string do
      allow_nil? true
      public? true
    end

    attribute :region, :string do
      allow_nil? true
      public? true
    end

    attribute :mission_name, :string do
      allow_nil? false
      public? true
    end

    attribute :mission_type, :string do
      allow_nil? false
      public? true
    end

    attribute :mission_datetime, :string do
      allow_nil? false
      default ""
      public? true
    end

    attribute :mission_count, :integer do
      allow_nil? false
      default 1
      public? true
    end

    attribute :status, :string do
      allow_nil? false
      default "active"
      public? true
    end

    attribute :deleted, :boolean do
      allow_nil? false
      default false
      public? true
    end

    create_timestamp(:inserted_at)
    update_timestamp(:updated_at)
  end

  relationships do
    belongs_to :map_system, WandererApp.Api.MapSystem do
      attribute_writable? true
      public? true
      allow_nil? true
    end
  end

  identities do
    identity :uniq_char_map_system_type_datetime,
             [:character_eve_id, :map_id, :solar_system_id, :mission_type, :mission_datetime]
  end

  @derive {Jason.Encoder,
           only: [
             :id,
             :character_eve_id,
             :map_id,
             :map_system_id,
             :solar_system_id,
             :system_name,
             :constellation,
             :region,
             :mission_name,
             :mission_type,
             :mission_datetime,
             :mission_count,
             :status,
             :deleted,
             :inserted_at,
             :updated_at
           ]}
end
