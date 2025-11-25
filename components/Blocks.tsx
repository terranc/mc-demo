
import React, { useMemo } from 'react';
import { useStore } from '../store';
import { TEXTURES, BlockType } from '../types';
import { Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';

interface BlockGroupProps {
  type: BlockType;
}

// Generate a texture with a border to simulate edges
const createBlockTexture = () => {
  if (typeof document === 'undefined') return new THREE.Texture();

  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.Texture();

  // 1. Base Fill (White so it multiplies with Instance Color)
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, 64, 64);

  // 2. Subtle Noise (for texture)
  for (let i = 0; i < 64; i++) {
    const x = Math.random() * 64;
    const y = Math.random() * 64;
    ctx.fillStyle = `rgba(0, 0, 0, ${Math.random() * 0.1})`; // Very faint noise
    ctx.fillRect(x, y, 2, 2);
  }

  // 3. Border (The "Edge")
  // Draw an inner border.
  ctx.lineWidth = 6; 
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'; // 20% dark border
  ctx.strokeRect(0, 0, 64, 64); // Draws centered on line, so 3px inside, 3px outside (clipped)

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
};

const BlockGroup: React.FC<BlockGroupProps> = ({ type }) => {
  const allBlocks = useStore((state) => state.blocks);

  // Filter within the component using useMemo for efficiency
  const blocks = useMemo(() => 
    allBlocks.filter((b) => b.type === type), 
    [allBlocks, type]
  );

  const texture = useMemo(() => createBlockTexture(), []);

  const color = TEXTURES[type];
  const isGlass = type === 'glass';

  if (blocks.length === 0) return null;

  return (
    <Instances range={10000} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial
        map={texture}
        color="white" // Base color white so instance color shines through correctly
        transparent={isGlass}
        opacity={isGlass ? 0.6 : 1}
        roughness={0.8}
      />
      {blocks.map((data) => (
        <Instance
          key={data.id}
          position={data.position}
          color={color} // Explicitly pass color to the instance
        />
      ))}
    </Instances>
  );
};

export const Blocks: React.FC = () => {
  const allBlockTypes = useMemo(() => Object.keys(TEXTURES) as BlockType[], []);

  return (
    <group>
      {allBlockTypes.map((type) => (
        <BlockGroup key={type} type={type} />
      ))}
    </group>
  );
};
