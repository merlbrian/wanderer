export type FleetRole = 'fleet_commander' | 'wing_commander' | 'squad_commander' | 'squad_member';

export interface FleetMember {
  character_id: number;
  character_name: string;
  role: FleetRole;
  wing_id: number | null;
  squad_id: number | null;
  ship_type_id: number | null;
  solar_system_id: number | null;
}

export interface FleetInfo {
  fleet_id: number;
  members: FleetMember[];
}
