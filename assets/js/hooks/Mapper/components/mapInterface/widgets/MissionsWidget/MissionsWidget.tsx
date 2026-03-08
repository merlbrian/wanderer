import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMapRootState } from '@/hooks/Mapper/mapRootProvider';
import { Widget } from '@/hooks/Mapper/components/mapInterface/components';
import { OutCommand } from '@/hooks/Mapper/types/mapHandlers';
import { parseMissions, MissionPair } from '@/hooks/Mapper/helpers/parseMissions';

interface Mission {
  id: string;
  mission_name: string;
  mission_type: string;
  system_name: string;
  constellation: string;
  region: string;
  status: string;
}

const WINDOW_ID = 'missions-widget';

const MissionsContent: React.FC = () => {
  const { outCommand, data } = useMapRootState();
  const { characters, userCharacters } = data;

  const [missions, setMissions] = useState<Mission[]>([]);
  const [pasteText, setPasteText] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [preview, setPreview] = useState<MissionPair[]>([]);
  const didLoad = useRef(false);

  const userOwnedChars = characters.filter(c => c.eve_id && userCharacters.includes(c.eve_id as string));

  useEffect(() => {
    if (!selectedCharId && userOwnedChars.length > 0) {
      setSelectedCharId(userOwnedChars[0].eve_id as string);
    }
  }, [userOwnedChars, selectedCharId]);

  const loadMissions = useCallback(async () => {
    try {
      const resp = await outCommand<{ missions: Mission[] }>({
        type: OutCommand.getMissions,
        data: {},
      });
      setMissions(resp.missions ?? []);
    } catch {
      // ignore
    }
  }, [outCommand]);

  useEffect(() => {
    if (!didLoad.current) {
      didLoad.current = true;
      loadMissions();
    }
  }, [loadMissions]);

  useEffect(() => {
    if (!pasteText.trim()) {
      setPreview([]);
      return;
    }
    const { pairs } = parseMissions(pasteText);
    setPreview(pairs);
  }, [pasteText]);

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
      setFeedback('Failed to submit missions');
    } finally {
      setIsSubmitting(false);
    }
  }, [outCommand, pasteText, selectedCharId, loadMissions]);

  const handleComplete = useCallback(
    async (missionId: string) => {
      try {
        await outCommand({ type: OutCommand.completeMission, data: { mission_id: missionId } });
        await loadMissions();
      } catch {
        // ignore
      }
    },
    [outCommand, loadMissions],
  );

  const handleDelete = useCallback(
    async (missionId: string) => {
      try {
        await outCommand({ type: OutCommand.deleteMission, data: { mission_id: missionId } });
        await loadMissions();
      } catch {
        // ignore
      }
    },
    [outCommand, loadMissions],
  );

  const activeMissions = missions.filter(m => m.status === 'active');
  const completedMissions = missions.filter(m => m.status === 'completed');

  return (
    <div className="flex flex-col gap-2 p-2 text-xs h-full overflow-auto custom-scrollbar">
      {/* Paste section */}
      <div className="flex flex-col gap-1">
        <div className="text-stone-400 uppercase tracking-wide text-[10px]">Import Bookmarks</div>

        {userOwnedChars.length > 1 && (
          <select
            className="bg-neutral-800 border border-gray-600 text-gray-200 rounded px-1 py-0.5 text-xs"
            value={selectedCharId}
            onChange={e => setSelectedCharId(e.target.value)}
          >
            {userOwnedChars.map(c => (
              <option key={c.eve_id} value={c.eve_id}>
                {c.name ?? c.eve_id}
              </option>
            ))}
          </select>
        )}

        <textarea
          className="w-full bg-neutral-800 border border-gray-600 text-gray-200 rounded px-1 py-0.5 text-xs resize-y min-h-[60px]"
          placeholder="Paste EVE bookmark text here…"
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
        />

        {preview.length > 0 && (
          <div className="text-stone-400 text-[10px]">
            Preview: {preview.length} mission pair{preview.length !== 1 ? 's' : ''} detected
          </div>
        )}

        <button
          className="px-2 py-0.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded text-xs self-end"
          disabled={isSubmitting || !pasteText.trim() || !selectedCharId}
          onClick={handlePaste}
        >
          {isSubmitting ? 'Importing…' : 'Import'}
        </button>

        {feedback && <div className="text-stone-300 text-[10px]">{feedback}</div>}
      </div>

      <div className="border-t border-gray-600 border-opacity-30" />

      {/* Active missions */}
      {activeMissions.length === 0 && completedMissions.length === 0 && (
        <div className="text-stone-500 text-center py-2">No missions yet</div>
      )}

      {activeMissions.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-stone-400 uppercase tracking-wide text-[10px]">Active</div>
          {activeMissions.map(m => (
            <MissionRow key={m.id} mission={m} onComplete={handleComplete} onDelete={handleDelete} />
          ))}
        </div>
      )}

      {completedMissions.length > 0 && (
        <div className="flex flex-col gap-1">
          <div className="text-stone-400 uppercase tracking-wide text-[10px] mt-1">Completed</div>
          {completedMissions.map(m => (
            <MissionRow key={m.id} mission={m} onComplete={handleComplete} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
};

interface MissionRowProps {
  mission: Mission;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
}

const MissionRow: React.FC<MissionRowProps> = ({ mission, onComplete, onDelete }) => (
  <div className="flex items-center justify-between gap-1 bg-neutral-800 rounded px-1.5 py-1">
    <div className="flex flex-col min-w-0">
      <span className="truncate font-medium text-gray-200">{mission.mission_name}</span>
      <span className="text-stone-400 text-[10px] truncate">
        {mission.system_name}
        {mission.constellation ? ` · ${mission.constellation}` : ''}
        {mission.region ? ` · ${mission.region}` : ''}
      </span>
      <span className="text-stone-500 text-[10px]">
        {mission.mission_type === 'encounter' ? '⚔ Encounter' : '🏠 Home Base'}
      </span>
    </div>
    <div className="flex gap-1 shrink-0">
      {mission.status === 'active' && (
        <button
          className="px-1 py-0.5 bg-green-800 hover:bg-green-700 text-white rounded text-[10px]"
          title="Mark complete"
          onClick={() => onComplete(mission.id)}
        >
          ✓
        </button>
      )}
      <button
        className="px-1 py-0.5 bg-red-900 hover:bg-red-800 text-white rounded text-[10px]"
        title="Delete"
        onClick={() => onDelete(mission.id)}
      >
        ✕
      </button>
    </div>
  </div>
);

export const MissionsWidget: React.FC = () => (
  <Widget label="Agent Missions" windowId={WINDOW_ID}>
    <MissionsContent />
  </Widget>
);
