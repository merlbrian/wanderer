import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMapRootState } from '@/hooks/Mapper/mapRootProvider';
import { Widget } from '@/hooks/Mapper/components/mapInterface/components';
import { OutCommand } from '@/hooks/Mapper/types/mapHandlers';
import { parseMissions, MissionPair } from '@/hooks/Mapper/helpers/parseMissions';
import { getCharacterPortraitUrl } from '@/hooks/Mapper/helpers/getEveImageUrl';
import { FleetInfo, FleetMember } from '@/hooks/Mapper/types/fleet';

interface Mission {
  id: string;
  mission_name: string;
  mission_type: string;
  system_name: string;
  constellation: string;
  region: string;
  status: string;
  character_eve_id: string;
  mission_count: number;
  mission_datetime: string;
  solar_system_id: number;
}

interface SystemGroup {
  system_name: string;
  constellation: string;
  region: string;
  byChar: Map<string, Mission[]>;
}

interface CurrentSystemGroup {
  system_name: string;
  byChar: Map<string, Mission[]>;
}

const WINDOW_ID = 'missions-widget';

const MissionsContent: React.FC = () => {
  const { outCommand, update, data } = useMapRootState();
  const { characters, userCharacters, selectedSystems } = data;

  const [missions, setMissions] = useState<Mission[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<MissionPair[]>([]);
  const [fleetInfo, setFleetInfo] = useState<FleetInfo | null>(null);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [promoteFeedback, setPromoteFeedback] = useState<string | null>(null);
  const didLoad = useRef(false);

  const userOwnedChars = useMemo(
    () => characters.filter(c => userCharacters.includes(c.eve_id)),
    [characters, userCharacters],
  );

  const charNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of characters) map.set(c.eve_id, c.name);
    return map;
  }, [characters]);

  const charByNumericId = useMemo(() => {
    const map = new Map<number, (typeof characters)[0]>();
    for (const c of characters) map.set(parseInt(c.eve_id, 10), c);
    return map;
  }, [characters]);

  const missionCountByChar = useMemo<Map<string, number>>(() => {
    const counts = new Map<string, number>();
    for (const m of missions) {
      if (m.status === 'active') {
        counts.set(m.character_eve_id, (counts.get(m.character_eve_id) ?? 0) + (m.mission_count ?? 1));
      }
    }
    return counts;
  }, [missions]);

  useEffect(() => {
    if (!selectedCharId && userOwnedChars.length > 0) {
      setSelectedCharId(userOwnedChars[0].eve_id);
    }
  }, [userOwnedChars, selectedCharId]);

  // ── Selected system ─────────────────────────────────────────────────────────
  const selectedSystemId = useMemo(() => {
    const [first] = selectedSystems;
    if (!first) return null;
    const n = parseInt(first, 10);
    return isNaN(n) ? null : n;
  }, [selectedSystems]);

  // ── Derived counts ───────────────────────────────────────────────────────────
  const totalMissionCount = useMemo(
    () => missions.filter(m => m.status === 'active').reduce((sum, m) => sum + (m.mission_count ?? 1), 0),
    [missions],
  );

  const currentSystemGroup = useMemo<CurrentSystemGroup | null>(() => {
    if (!selectedSystemId) return null;
    const inSystem = missions.filter(m => m.status === 'active' && m.solar_system_id === selectedSystemId);
    if (!inSystem.length) return null;
    const byChar = new Map<string, Mission[]>();
    for (const m of inSystem) {
      if (!byChar.has(m.character_eve_id)) byChar.set(m.character_eve_id, []);
      byChar.get(m.character_eve_id)!.push(m);
    }
    return { system_name: inSystem[0].system_name, byChar };
  }, [missions, selectedSystemId]);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const loadMissions = useCallback(async () => {
    try {
      const resp = await outCommand<{ missions: Mission[] }>({
        type: OutCommand.getMissions,
        data: {},
      });
      const activeMissions = resp.missions ?? [];
      setMissions(activeMissions);
      const bySystem: Record<number, number> = {};
      for (const m of activeMissions) {
        if (m.status === 'active') {
          bySystem[m.solar_system_id] = (bySystem[m.solar_system_id] ?? 0) + (m.mission_count ?? 1);
        }
      }
      update({ activeMissionsBySystem: bySystem });
    } catch {
      // ignore
    }
  }, [outCommand, update]);

  const loadFleet = useCallback(async () => {
    try {
      const resp = await outCommand<{ fleet_id?: number; members?: FleetMember[]; error?: string }>({
        type: OutCommand.getFleet,
        data: {},
      });
      if (resp.fleet_id != null) {
        setFleetInfo({ fleet_id: resp.fleet_id, members: resp.members ?? [] });
      } else {
        setFleetInfo(null);
      }
    } catch {
      setFleetInfo(null);
    }
  }, [outCommand]);

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true;
      loadMissions();
      loadFleet();
    }
  }, [loadMissions, loadFleet]);

  useEffect(() => {
    if (!pasteText.trim()) { setPreview([]); return; }
    const { pairs } = parseMissions(pasteText);
    setPreview(pairs);
  }, [pasteText]);

  // ── Actions ──────────────────────────────────────────────────────────────────
  const handlePaste = useCallback(async () => {
    if (!pasteText.trim() || !selectedCharId) return;
    setIsSubmitting(true);
    setFeedback(null);
    try {
      const resp = await outCommand<{ status: string; created_count: number; skipped_count: number }>({
        type: OutCommand.pasteMissions,
        data: { character_eve_id: selectedCharId, bookmark_text: pasteText },
      });
      if (resp.status === 'ok') {
        setFeedback(`Created ${resp.created_count}, skipped ${resp.skipped_count}`);
        setPasteText('');
        setPreview([]);
        await loadMissions();
      } else {
        setFeedback(`Error: ${resp.status}`);
      }
    } catch {
      setFeedback('Failed to submit');
    } finally {
      setIsSubmitting(false);
    }
  }, [outCommand, pasteText, selectedCharId, loadMissions]);

  const handleClearCharacter = useCallback(
    async (charId: string, systemName: string) => {
      try {
        await outCommand({ type: OutCommand.clearCharacterInSystem, data: { character_eve_id: charId, system_name: systemName } });
        await loadMissions();
      } catch { /* ignore */ }
    },
    [outCommand, loadMissions],
  );

  const handleClearAll = useCallback(
    async (systemName: string) => {
      try {
        await outCommand({ type: OutCommand.clearAllInSystem, data: { system_name: systemName } });
        await loadMissions();
      } catch { /* ignore */ }
    },
    [outCommand, loadMissions],
  );

  const handleReset = useCallback(async () => {
    if (!selectedCharId) return;
    try {
      await outCommand({ type: OutCommand.resetCharacterMissions, data: { character_eve_id: selectedCharId } });
      await loadMissions();
    } catch { /* ignore */ }
  }, [outCommand, selectedCharId, loadMissions]);

  const handlePromote = useCallback(
    async (characterEveId: string) => {
      if (!fleetInfo) return;
      const numericId = parseInt(characterEveId, 10);
      const member = fleetInfo.members.find(m => m.character_id === numericId);
      if (!member) return;

      setPromotingId(numericId);
      setPromoteFeedback(null);

      // Optimistic update
      setFleetInfo(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m => {
            if (m.character_id === numericId) return { ...m, role: 'wing_commander' };
            if (m.role === 'wing_commander') return { ...m, role: 'squad_member' };
            return m;
          }),
        };
      });

      try {
        const resp = await outCommand<{ status: string; reason?: string }>({
          type: OutCommand.setWingCommander,
          data: { fleet_id: fleetInfo.fleet_id, target_character_eve_id: String(numericId) },
        });
        if (resp.status === 'ok') {
          setPromoteFeedback(`${charByNumericId.get(numericId)?.name ?? characterEveId} promoted`);
          setTimeout(() => loadFleet(), 2500);
        } else {
          setPromoteFeedback(`Error: ${resp.reason ?? 'unknown'}`);
          await loadFleet();
        }
      } catch {
        setPromoteFeedback('Promotion failed');
        await loadFleet();
      } finally {
        setPromotingId(null);
      }
    },
    [fleetInfo, outCommand, charByNumericId, loadFleet],
  );

  // ── All-systems grouping (for the bottom list) ───────────────────────────────
  const systemGroups = useMemo<SystemGroup[]>(() => {
    const active = missions.filter(m => m.status === 'active');
    const bySystem = new Map<string, SystemGroup>();
    for (const m of active) {
      if (!bySystem.has(m.system_name)) {
        bySystem.set(m.system_name, { system_name: m.system_name, constellation: m.constellation, region: m.region, byChar: new Map() });
      }
      const sys = bySystem.get(m.system_name)!;
      if (!sys.byChar.has(m.character_eve_id)) sys.byChar.set(m.character_eve_id, []);
      sys.byChar.get(m.character_eve_id)!.push(m);
    }
    return Array.from(bySystem.values());
  }, [missions]);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs h-full">

      {/* ── Frame 1: Total missions ──────────────────────────────────────────── */}
      <div className="bg-neutral-800 rounded border border-gray-600 border-opacity-20 px-3 py-2 flex items-center justify-between">
        <div className="text-stone-400 uppercase tracking-wide text-[10px]">Total Active Missions</div>
        <span className={['text-base font-bold', totalMissionCount > 0 ? 'text-violet-400' : 'text-stone-600'].join(' ')}>
          {totalMissionCount}
        </span>
      </div>

      {/* ── Frame 2: Current system missions ────────────────────────────────── */}
      {selectedSystemId ? (
        currentSystemGroup ? (
          <div className="bg-neutral-800 rounded border border-violet-700 border-opacity-40 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-2 py-1.5 bg-violet-900 bg-opacity-20">
              <div>
                <div className="text-violet-300 font-semibold text-[11px]">{currentSystemGroup.system_name}</div>
                <div className="text-stone-500 text-[10px]">
                  {Array.from(currentSystemGroup.byChar.values())
                    .flat()
                    .reduce((s, m) => s + (m.mission_count ?? 1), 0)}{' '}
                  missions in system
                </div>
              </div>
              <button
                className="ml-2 px-1.5 py-0.5 bg-red-900 hover:bg-red-700 text-white rounded text-[10px] shrink-0"
                title="Clear all missions in this system"
                onClick={() => handleClearAll(currentSystemGroup.system_name)}
              >
                Clear all
              </button>
            </div>

            {/* Per-character rows */}
            <div className="flex flex-col divide-y divide-gray-700 divide-opacity-30">
              {Array.from(currentSystemGroup.byChar.entries()).map(([charId, charMissions]) => {
                const missionCount = charMissions.reduce((s, m) => s + (m.mission_count ?? 1), 0);
                const numericId = parseInt(charId, 10);
                const member = fleetInfo?.members.find(m => m.character_id === numericId);
                const isWingCdr = member?.role === 'wing_commander';
                const isPromoting = promotingId === numericId;

                return (
                  <div key={charId} className="flex items-center gap-2 px-2 py-1.5">
                    <img
                      src={getCharacterPortraitUrl(charId, 32)}
                      alt={charNameById.get(charId) ?? charId}
                      className="w-8 h-8 rounded shrink-0"
                    />
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-gray-200 truncate text-[11px]">{charNameById.get(charId) ?? charId}</span>
                      <span className="text-stone-400 text-[10px]">
                        {missionCount} mission{missionCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Promote button (fleet members not already wing commander) */}
                    {fleetInfo && member && !isWingCdr && (
                      <button
                        className="px-1.5 py-0.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-[10px] shrink-0"
                        disabled={isPromoting || promotingId !== null}
                        title={`Promote ${charNameById.get(charId) ?? charId} to Wing Commander`}
                        onClick={() => handlePromote(charId)}
                      >
                        {isPromoting ? '…' : 'Promote'}
                      </button>
                    )}

                    {/* Wing commander badge */}
                    {fleetInfo && isWingCdr && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded shrink-0 bg-violet-700 text-white">
                        ⭐ Wing Cdr
                      </span>
                    )}

                    {/* Clear character button */}
                    <button
                      className="px-1.5 py-0.5 bg-green-800 hover:bg-green-600 text-white rounded text-[10px] shrink-0"
                      title={`Clear ${charNameById.get(charId) ?? charId}'s missions here`}
                      onClick={() => handleClearCharacter(charId, currentSystemGroup.system_name)}
                    >
                      Clear
                    </button>
                  </div>
                );
              })}
            </div>

            {promoteFeedback && (
              <div className="text-stone-300 text-[10px] px-2 pb-1.5">{promoteFeedback}</div>
            )}
          </div>
        ) : (
          <div className="bg-neutral-800 rounded border border-gray-600 border-opacity-20 px-3 py-2 text-stone-500 text-[10px] text-center">
            No missions in selected system
          </div>
        )
      ) : (
        <div className="bg-neutral-800 rounded border border-gray-600 border-opacity-20 px-3 py-2 text-stone-500 text-[10px] text-center">
          Select a system to see its missions
        </div>
      )}

      {/* ── Scrollable section: import + all systems ────────────────────────── */}
      <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-auto custom-scrollbar">

      <div className="border-t border-gray-600 border-opacity-30" />

      {/* ── Import section ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-1.5">
        <div className="text-stone-400 uppercase tracking-wide text-[10px]">Import Bookmarks</div>

        {userOwnedChars.length > 0 && (
          <div className="flex flex-row gap-2 flex-wrap px-0.5 py-0.5">
            {userOwnedChars.map(c => (
              <button
                key={c.eve_id}
                title={c.name}
                onClick={() => setSelectedCharId(c.eve_id)}
                className={[
                  'relative rounded overflow-visible shrink-0 w-10 h-10',
                  'ring-2 ring-offset-1 ring-offset-neutral-900 transition-all',
                  selectedCharId === c.eve_id
                    ? 'ring-blue-500 opacity-100'
                    : 'ring-transparent opacity-50 hover:opacity-90',
                ].join(' ')}
              >
                <img src={getCharacterPortraitUrl(c.eve_id, 64)} alt={c.name} className="w-full h-full object-cover rounded" />
                {(missionCountByChar.get(c.eve_id) ?? 0) > 0 && (
                  <span className="absolute bottom-0 right-0 bg-blue-600 text-white text-[8px] leading-none rounded px-[3px] py-[1px] font-bold pointer-events-none">
                    {missionCountByChar.get(c.eve_id)}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <textarea
          className="w-full bg-neutral-800 border border-gray-600 text-gray-200 rounded px-1 py-0.5 text-xs resize-y min-h-[60px]"
          placeholder="Paste EVE bookmark text here…"
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        {preview.length > 0 && (
          <div className="text-stone-400 text-[10px]">
            {preview.length} mission pair{preview.length !== 1 ? 's' : ''} detected
          </div>
        )}

        <div className="flex gap-2 self-end">
          <button
            className="px-2 py-0.5 bg-amber-700 hover:bg-amber-600 disabled:opacity-40 text-white rounded text-xs"
            disabled={!selectedCharId}
            title="Remove cleared missions so they can be re-imported"
            onClick={handleReset}
          >
            Reset
          </button>
          <button
            className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded text-xs"
            disabled={isSubmitting || !pasteText.trim() || !selectedCharId}
            onClick={handlePaste}
          >
            {isSubmitting ? 'Importing…' : 'Import'}
          </button>
        </div>

        {feedback && <div className="text-stone-300 text-[10px]">{feedback}</div>}
      </div>

      <div className="border-t border-gray-600 border-opacity-30" />

      {/* ── All systems list ─────────────────────────────────────────────────── */}
      {systemGroups.length === 0 ? (
        <div className="text-stone-500 text-center py-2">No active missions</div>
      ) : (
        <>
          <div className="text-stone-400 uppercase tracking-wide text-[10px]">All Systems</div>
          <div className="flex flex-col gap-2">
            {systemGroups.map(group => (
              <SystemCard
                key={group.system_name}
                group={group}
                charNameById={charNameById}
                onClearCharacter={handleClearCharacter}
                onClearAll={handleClearAll}
              />
            ))}
          </div>
        </>
      )}

      </div>{/* end scrollable section */}
    </div>
  );
};

interface SystemCardProps {
  group: SystemGroup;
  charNameById: Map<string, string>;
  onClearCharacter: (charId: string, systemName: string) => void;
  onClearAll: (systemName: string) => void;
}

const SystemCard: React.FC<SystemCardProps> = ({ group, charNameById, onClearCharacter, onClearAll }) => {
  const charEntries = Array.from(group.byChar.entries());
  const totalCount = charEntries.reduce((sum, [, ms]) => sum + ms.reduce((s, m) => s + (m.mission_count ?? 1), 0), 0);

  return (
    <div className="bg-neutral-800 rounded border border-gray-600 border-opacity-20 overflow-hidden">
      <div className="flex items-center justify-between px-2 py-1.5 bg-neutral-700 bg-opacity-40">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-100 truncate">{group.system_name}</span>
            <span className="text-[10px] bg-neutral-600 text-stone-300 rounded px-1 shrink-0">{totalCount}</span>
          </div>
          <div className="text-stone-500 text-[10px] truncate">
            {[group.constellation, group.region].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          className="ml-2 px-1.5 py-0.5 bg-red-900 hover:bg-red-700 text-white rounded text-[10px] shrink-0"
          title="Clear all missions in this system"
          onClick={() => onClearAll(group.system_name)}
        >
          Clear all
        </button>
      </div>

      <div className="flex flex-col divide-y divide-gray-700 divide-opacity-30">
        {charEntries.map(([charId, charMissions]) => {
          const missionCount = charMissions.reduce((s, m) => s + (m.mission_count ?? 1), 0);
          return (
            <div key={charId} className="flex items-center gap-2 px-2 py-1.5">
              <img
                src={getCharacterPortraitUrl(charId, 32)}
                alt={charNameById.get(charId) ?? charId}
                className="w-8 h-8 rounded shrink-0"
              />
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-gray-200 truncate text-[11px]">{charNameById.get(charId) ?? charId}</span>
                <span className="text-stone-400 text-[10px]">
                  {missionCount} mission{missionCount !== 1 ? 's' : ''}
                </span>
              </div>
              <button
                className="px-1.5 py-0.5 bg-green-800 hover:bg-green-600 text-white rounded text-[10px] shrink-0"
                title={`Clear ${charNameById.get(charId) ?? charId}'s missions here`}
                onClick={() => onClearCharacter(charId, group.system_name)}
              >
                Clear
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const MissionsWidget: React.FC = () => (
  <Widget label="Agent Missions" windowId={WINDOW_ID}>
    <MissionsContent />
  </Widget>
);
