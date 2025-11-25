import { create } from 'zustand';
import { nanoid } from 'nanoid';
import { BlockData, BlockType, NPC } from './types';

interface GameState {
  blocks: BlockData[];
  npcs: NPC[];
  selectedBlock: BlockType;
  closestNpcId: string | null;
  isTalking: boolean;
  voiceStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  npcChatText: string;
  addBlock: (x: number, y: number, z: number) => void;
  removeBlock: (x: number, y: number, z: number) => void;
  setBlockType: (type: BlockType) => void;
  setClosestNpcId: (id: string | null) => void;
  setIsTalking: (isTalking: boolean) => void;
  setVoiceStatus: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
  setNpcChatText: (text: string) => void;
  updateNpcPosition: (id: string, pos: [number, number, number]) => void;
  resetWorld: () => void;
}

const NPC_NAMES = [
  { name: 'Steve', personality: 'You are Steve, a grumpy miner who loves gold and hates creepers. You speak in short, gruff sentences.', color: '#0000FF' },
  { name: 'Alex', personality: 'You are Alex, an adventurous explorer who loves nature and animals. You are cheerful and helpful.', color: '#00FF00' },
  { name: 'Villager', personality: 'You are a Villager. You mostly make "Hmm" and "Hrr" sounds but occasionally offer terrible trades. You are very greedy.', color: '#8B4513' },
  { name: 'Guide', personality: 'You are the Tutorial Guide. You are overly enthusiastic about explaining basic mechanics like jumping and placing blocks.', color: '#FFFF00' }
];

// Initial world generation
const generateInitialWorld = () => {
  const blocks: BlockData[] = [];
  const npcs: NPC[] = [];
  const size = 10;
  
  // Generate terrain
  for (let x = -size; x <= size; x++) {
    for (let z = -size; z <= size; z++) {
      // Simple terrain noise
      const y = Math.floor(Math.sin(x / 4) * Math.cos(z / 4) * 2); 
      blocks.push({
        id: nanoid(),
        position: [x, y - 1, z],
        type: 'grass',
      });
      // Add dirt below
      blocks.push({
        id: nanoid(),
        position: [x, y - 2, z],
        type: 'dirt',
      });
    }
  }

  // Spawn exactly 2 NPCs at safe locations
  for (let i = 0; i < 2; i++) {
     let x = Math.floor((Math.random() * size * 1.5) - size * 0.75);
     let z = Math.floor((Math.random() * size * 1.5) - size * 0.75);
     // Find safe ground height
     const y = Math.floor(Math.sin(x / 4) * Math.cos(z / 4) * 2);
     
     const npcData = NPC_NAMES[i % NPC_NAMES.length];
     npcs.push({
        id: nanoid(),
        position: [x, y + 2, z], // Drop them from slightly higher to ensure they don't clip
        name: npcData.name,
        personality: npcData.personality,
        color: npcData.color
     });
  }

  return { blocks, npcs };
};

const initialData = generateInitialWorld();

export const useStore = create<GameState>((set) => ({
  blocks: initialData.blocks,
  npcs: initialData.npcs,
  selectedBlock: 'dirt',
  closestNpcId: null,
  isTalking: false,
  voiceStatus: 'disconnected',
  npcChatText: '',
  addBlock: (x, y, z) => set((state) => {
    const exists = state.blocks.some(b => 
      b.position[0] === x && b.position[1] === y && b.position[2] === z
    );
    if (exists) return state;
    return {
      blocks: [
        ...state.blocks,
        {
          id: nanoid(),
          position: [x, y, z],
          type: state.selectedBlock,
        },
      ],
    };
  }),
  removeBlock: (x, y, z) => set((state) => ({
    blocks: state.blocks.filter((b) => {
      const [bx, by, bz] = b.position;
      return bx !== x || by !== y || bz !== z;
    }),
  })),
  setBlockType: (type) => set({ selectedBlock: type }),
  setClosestNpcId: (id) => set({ closestNpcId: id }),
  setIsTalking: (talking) => set({ 
    isTalking: talking, 
    npcChatText: talking ? '' : '', 
    voiceStatus: talking ? 'connecting' : 'disconnected' 
  }),
  setVoiceStatus: (status) => set({ voiceStatus: status }),
  setNpcChatText: (text) => set({ npcChatText: text }),
  updateNpcPosition: (id, pos) => set((state) => ({
    npcs: state.npcs.map(npc => npc.id === id ? { ...npc, position: pos } : npc)
  })),
  resetWorld: () => {
    const newData = generateInitialWorld();
    set({ blocks: newData.blocks, npcs: newData.npcs });
  },
}));