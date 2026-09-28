import React from 'react';
import SoundList from './SoundList';
import { SoundSource, SoundType } from '../types';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sounds: SoundSource[];
  listenerPos: { x: number; z: number };
  onUpdateSound: (id: string, updates: Partial<SoundSource>) => void;
  onDeleteSound: (id: string) => void;
  onDeleteAllSounds: () => void;
  onAddSound: (type: SoundType, name: string, file?: File) => void;
  onAddRecordedSound: (file: File) => void;
  onTeleportTo: (x: number, z: number) => void;
  onError: (msg: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  onClose,
  sounds,
  listenerPos,
  onUpdateSound,
  onDeleteSound,
  onDeleteAllSounds,
  onAddSound,
  onAddRecordedSound,
  onTeleportTo,
  onError
}) => {
  if (!isOpen) return null;

  return (
    <aside
      aria-label="Soundscape sources dashboard"
      className="absolute top-0 right-0 h-full w-[90vw] md:w-80 z-30 flex flex-col bg-white shadow-2xl pointer-events-auto border-l border-zinc-200 animate-slide-left"
    >
      <SoundList
        sounds={sounds}
        listenerPos={listenerPos}
        onUpdateSound={onUpdateSound}
        onDeleteSound={onDeleteSound}
        onDeleteAllSounds={onDeleteAllSounds}
        onAddSound={onAddSound}
        onAddRecordedSound={onAddRecordedSound}
        onTeleportTo={onTeleportTo}
        onClose={onClose}
        onError={onError}
      />
    </aside>
  );
};

export default Sidebar;
