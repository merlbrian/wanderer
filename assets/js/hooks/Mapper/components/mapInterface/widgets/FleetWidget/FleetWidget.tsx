import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMapRootState } from '@/hooks/Mapper/mapRootProvider';
import { Widget } from '@/hooks/Mapper/components/mapInterface/components';
import { OutCommand } from '@/hooks/Mapper/types/mapHandlers';
import { FleetInfo, FleetMember, FleetRole } from '@/hooks/Mapper/types/fleet';
import { getCharacterPortraitUrl } from '@/hooks/Mapper/helpers/getEveImageUrl';

const WINDOW_ID = 'fleet-widget';

const ROLE_LABELS: Record<FleetRole, string> = {
  fleet_commander: 'FC',
  wing_commander: 'Wing Cdr',
  squad_commander: 'Squad Cdr',
  squad_member: 'Member',
};

const FleetContent: React.FC = () => {
  const { outCommand, data } = useMapRootState();
  const { characters, userCharacters, activeMissionsBySystem } = data;

  const [fleetInfo, setFleetInfo] = useState<FleetInfo | null>(null);
  const [fleetError, setFleetError] = useState<string | null>(null);
  const [missingAccessChars, setMissingAccessChars] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const didLoad = useRef(false);

  // The user's own EVE characters (with location data)
  const userOwnedChars = useMemo(
    () => characters.filter(c => userCharacters.includes(c.eve_id)),
    [characters, userCharacters],
  );

  // Build a name→eve_id map for fleet members (fleet returns integer character_ids)
  const charById = useMemo(() => {
    const map = new Map<number, (typeof characters)[0]>();
    for (const c of characters) map.set(parseInt(c.eve_id, 10), c);
    return map;
  }, [characters]);

  // Determine system name from the systems list (systems in state have solar_system_id + solar_system_name)
  const systemNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of (data as any).systems ?? []) {
      if (s.solar_system_id) map.set(s.solar_system_id, s.solar_system_name ?? `${s.solar_system_id}`);
    }
    return map;
  }, [(data as any).systems]);

  const loadFleet = useCallback(async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const resp = await outCommand<{ fleet_id?: number; members?: FleetMember[]; error?: string; characters?: string[]; missing_scope_characters?: string[] }>({
        type: OutCommand.getFleet,
        data: {},
      });
      if (resp.error) {
        setFleetInfo(null);
        setFleetError(resp.error);
        // Capture which characters need re-auth (either all missing scope, or a partial subset)
        setMissingAccessChars(resp.characters ?? resp.missing_scope_characters ?? []);
      } else if (resp.fleet_id != null) {
        setMissingAccessChars([]);
        setFleetInfo({ fleet_id: resp.fleet_id, members: resp.members ?? [] });
        setFleetError(null);
      }
    } catch {
      setFleetError('Failed to load fleet');
    } finally {
      setIsLoading(false);
    }
  }, [outCommand]);

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true;
      loadFleet();
    }
  }, [loadFleet]);

  const handlePromote = useCallback(
    async (targetMember: FleetMember) => {
      if (!fleetInfo) return;
      setPromotingId(targetMember.character_id);
      setFeedback(null);

      // Optimistic update
      setFleetInfo(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          members: prev.members.map(m => {
            if (m.character_id === targetMember.character_id) return { ...m, role: 'wing_commander' };
            if (m.role === 'wing_commander') return { ...m, role: 'squad_member' };
            return m;
          }),
        };
      });

      try {
        const resp = await outCommand<{ status: string; reason?: string }>({
          type: OutCommand.setWingCommander,
          data: {
            fleet_id: fleetInfo.fleet_id,
            target_character_eve_id: String(targetMember.character_id),
          },
        });
        if (resp.status === 'ok') {
          setFeedback(`${charById.get(targetMember.character_id)?.name ?? targetMember.character_id} promoted`);
          await loadFleet();
        } else {
          setFeedback(`Error: ${resp.reason ?? 'unknown'}`);
          await loadFleet(); // revert optimistic
        }
      } catch {
        setFeedback('Promotion failed');
        await loadFleet();
      } finally {
        setPromotingId(null);
      }
    },
    [fleetInfo, outCommand, charById, loadFleet],
  );

  if (!userOwnedChars.length) {
    return (
      <div className="flex items-center justify-center h-full text-stone-500 text-xs p-4 text-center">
        No tracked characters found.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2 text-xs h-full overflow-auto custom-scrollbar">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="text-stone-400 uppercase tracking-wide text-[10px]">Fleet</div>
        <button
          className="px-2 py-0.5 bg-neutral-700 hover:bg-neutral-600 disabled:opacity-40 text-white rounded text-[10px]"
          disabled={isLoading}
          onClick={loadFleet}
        >
          {isLoading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {/* Missing fleet scope — show re-auth prompts */}
      {fleetError === 'missing_scope' && (
        <div className="flex flex-col gap-2 py-2">
          <div className="text-amber-400 text-[10px] text-center">
            Fleet access not granted. Re-authenticate to enable fleet tracking:
          </div>
          {missingAccessChars.map(name => (
            <a
              key={name}
              href="/auth/eve"
              className="flex items-center justify-center gap-1 px-3 py-1.5 bg-amber-800 hover:bg-amber-700 text-white text-[10px] rounded text-center"
            >
              🔑 Grant Fleet Access — {name}
            </a>
          ))}
        </div>
      )}

      {/* Not in fleet */}
      {fleetError === 'not_in_fleet' && (
        <>
          <div className="text-stone-500 text-[10px] text-center py-2">
            None of your characters are currently in a fleet.
          </div>
          {missingAccessChars.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-amber-500 text-[10px] text-center">
                Some characters need fleet scope:
              </div>
              {missingAccessChars.map(name => (
                <a
                  key={name}
                  href="/auth/eve"
                  className="flex items-center justify-center gap-1 px-3 py-1 bg-neutral-700 hover:bg-neutral-600 text-amber-300 text-[10px] rounded"
                >
                  🔑 Re-auth — {name}
                </a>
              ))}
            </div>
          )}
        </>
      )}

      {/* Generic error */}
      {fleetError && fleetError !== 'not_in_fleet' && fleetError !== 'missing_scope' && (
        <div className="text-red-400 text-[10px] text-center py-2">{fleetError}</div>
      )}

      {/* Fleet member table */}
      {fleetInfo && (
        <div className="flex flex-col gap-1">
          {userOwnedChars.map(ownedChar => {
            const numericId = parseInt(ownedChar.eve_id, 10);
            const member = fleetInfo.members.find(m => m.character_id === numericId);
            const location = ownedChar.location;
            const sysId = location?.solar_system_id ?? null;
            const sysName = sysId ? (systemNameById.get(sysId) ?? `#${sysId}`) : '—';
            const hasMissions = sysId != null && (activeMissionsBySystem?.[sysId] ?? 0) > 0;
            const missionCount = sysId != null ? (activeMissionsBySystem?.[sysId] ?? 0) : 0;
            const role: FleetRole = member?.role ?? 'squad_member';
            const isWingCdr = role === 'wing_commander';
            const isPromoting = promotingId === numericId;

            return (
              <div
                key={ownedChar.eve_id}
                className={[
                  'flex items-center gap-2 px-2 py-1.5 rounded border',
                  isWingCdr
                    ? 'bg-violet-900 bg-opacity-30 border-violet-700 border-opacity-40'
                    : 'bg-neutral-800 border-gray-600 border-opacity-20',
                ].join(' ')}
              >
                {/* Portrait */}
                <img
                  src={getCharacterPortraitUrl(ownedChar.eve_id, 32)}
                  alt={ownedChar.name}
                  className="w-8 h-8 rounded shrink-0"
                />

                {/* System + name */}
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-gray-200 truncate text-[11px] font-medium">{ownedChar.name}</span>
                  <div className="flex items-center gap-1">
                    <span className="text-stone-400 text-[10px] truncate">{sysName}</span>
                    {hasMissions && (
                      <span
                        className="text-amber-400 text-[10px] shrink-0"
                        title={`${missionCount} mission${missionCount !== 1 ? 's' : ''} in this system`}
                      >
                        🎯{missionCount > 1 ? ` ${missionCount}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Role badge */}
                <span
                  className={[
                    'text-[10px] px-1.5 py-0.5 rounded shrink-0',
                    isWingCdr
                      ? 'bg-violet-700 text-white'
                      : 'bg-neutral-700 text-stone-300',
                  ].join(' ')}
                >
                  {isWingCdr && '⭐ '}{ROLE_LABELS[role]}
                </span>

                {/* Promote button */}
                {!isWingCdr && member && (
                  <button
                    className="px-2 py-0.5 bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-white rounded text-[10px] shrink-0"
                    disabled={isPromoting || promotingId !== null}
                    onClick={() => handlePromote(member)}
                  >
                    {isPromoting ? '…' : 'Promote'}
                  </button>
                )}

                {/* Not in fleet indicator */}
                {!member && (
                  <span className="text-stone-600 text-[10px] shrink-0 italic">not in fleet</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {feedback && <div className="text-stone-300 text-[10px] mt-1">{feedback}</div>}
    </div>
  );
};

export const FleetWidget: React.FC = () => (
  <Widget windowId={WINDOW_ID} label="Fleet">
    <FleetContent />
  </Widget>
);
