export type MissionType = 'encounter' | 'home_base' | 'unknown';

export interface ParsedMission {
  missionName: string;
  missionType: MissionType;
  systemName: string;
  constellation: string;
  region: string;
  datetime: string;
  notes: string;
}

export interface MissionPair {
  encounter: ParsedMission;
  homeBase: ParsedMission;
}

export interface ParseMissionsResult {
  missions: ParsedMission[];
  pairs: MissionPair[];
  unpaired: ParsedMission[];
}

const ENCOUNTER_RE = /^Encounter\s+\([^)]+\)\s+-\s+(.+)$/;
const HOME_BASE_RE = /^Agent Home Base\s+-\s+(.+)$/;

/**
 * Determines the mission type from the bookmark title.
 */
function detectType(title: string): MissionType {
  if (ENCOUNTER_RE.test(title)) return 'encounter';
  if (HOME_BASE_RE.test(title)) return 'home_base';
  return 'unknown';
}

/**
 * Extracts the mission name from the bookmark title, stripping prefix boilerplate.
 */
function extractName(title: string): string {
  const encounterMatch = title.match(ENCOUNTER_RE);
  if (encounterMatch) return encounterMatch[1].trim();

  const homeBaseMatch = title.match(HOME_BASE_RE);
  if (homeBaseMatch) return homeBaseMatch[1].trim();

  return title.trim();
}

/**
 * Parses EVE bookmark text (tab-separated, one row per bookmark) into structured missions.
 *
 * Expected tab column layout (mirroring EVE copy-paste format):
 *   [0] title, [1] type?, [2] count?, [3] system_name, [4] constellation, [5] region, [6] datetime, [7] notes
 */
export const parseMissions = (text: string): ParseMissionsResult => {
  const missions: ParsedMission[] = [];

  const rows = text.split('\n');

  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed) continue;

    const cols = trimmed.split('\t');
    if (cols.length < 4) continue;

    const title = cols[0].trim();
    if (!title) continue;

    const missionType = detectType(title);
    if (missionType === 'unknown') continue;

    const mission: ParsedMission = {
      missionName: extractName(title),
      missionType,
      systemName: (cols[3] ?? '').trim(),
      constellation: (cols[4] ?? '').trim(),
      region: (cols[5] ?? '').trim(),
      datetime: (cols[6] ?? '').trim(),
      notes: (cols[7] ?? '').trim(),
    };

    if (!mission.systemName) continue;

    missions.push(mission);
  }

  const pairs: MissionPair[] = [];
  const unpaired: ParsedMission[] = [];

  const encounters = missions.filter(m => m.missionType === 'encounter');
  const homeBases = missions.filter(m => m.missionType === 'home_base');

  const usedHomeBases = new Set<number>();

  for (const encounter of encounters) {
    const hbIndex = homeBases.findIndex((_, i) => !usedHomeBases.has(i));
    if (hbIndex !== -1) {
      usedHomeBases.add(hbIndex);
      pairs.push({ encounter, homeBase: homeBases[hbIndex] });
    } else {
      unpaired.push(encounter);
    }
  }

  for (let i = 0; i < homeBases.length; i++) {
    if (!usedHomeBases.has(i)) {
      unpaired.push(homeBases[i]);
    }
  }

  return { missions, pairs, unpaired };
};
