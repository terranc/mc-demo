
export type BlockType = 'dirt' | 'grass' | 'stone' | 'wood' | 'glass' | 'log' | 'leaves' | 'diamond';

export interface BlockData {
  id: string;
  position: [number, number, number];
  type: BlockType;
}

export interface NPC {
  id: string;
  position: [number, number, number];
  name: string;
  personality: string;
  color: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export const TEXTURES: Record<BlockType, string> = {
  dirt: '#5D4037',   // Darker Earth Brown
  grass: '#48B518',  // Vibrant Grass Green
  stone: '#757575',  // Stone Grey
  wood: '#A1887F',   // Oak Wood Plank
  glass: '#87CEEB',  // Sky Blue Glass
  log: '#3E2723',    // Dark Oak Log
  leaves: '#2E7D32', // Deep Forest Green
  diamond: '#00BFFF' // Cyan Diamond
};

export const BLOCKS: BlockType[] = ['dirt', 'grass', 'stone', 'wood', 'glass', 'log', 'leaves', 'diamond'];