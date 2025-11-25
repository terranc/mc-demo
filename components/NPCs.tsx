
import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { Text, Billboard } from '@react-three/drei';
import * as THREE from 'three';
import { NPC } from '../types';

const NPC_SPEED = 0.03; 
const GRAVITY = 0.01;
const NPC_RADIUS = 0.3;
const NPC_HEIGHT = 1.8;

// Individual NPC Component with Physics
const NPCInstance: React.FC<{ npc: NPC; blockMap: Set<string> }> = ({ npc, blockMap }) => {
  const meshRef = useRef<THREE.Group>(null);
  const velocity = useRef(new THREE.Vector3(0, 0, 0));
  const targetPos = useRef<THREE.Vector3 | null>(null);
  const state = useRef<'IDLE' | 'MOVING'>('IDLE');
  const timer = useRef(0);
  
  const updateNpcPosition = useStore((state) => state.updateNpcPosition);
  const closestNpcId = useStore((state) => state.closestNpcId);
  const npcChatText = useStore((state) => state.npcChatText);
  const isTalking = useStore((state) => state.isTalking);
  const voiceStatus = useStore((state) => state.voiceStatus);

  const checkCollision = (pos: THREE.Vector3) => {
    const r = NPC_RADIUS;
    
    const minX = Math.floor(pos.x - r); const maxX = Math.ceil(pos.x + r);
    const minY = Math.floor(pos.y);     const maxY = Math.ceil(pos.y + NPC_HEIGHT);
    const minZ = Math.floor(pos.z - r); const maxZ = Math.ceil(pos.z + r);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (blockMap.has(`${x},${y},${z}`)) {
             const bMinX = x - 0.5; const bMaxX = x + 0.5;
             const bMinY = y - 0.5; const bMaxY = y + 0.5;
             const bMinZ = z - 0.5; const bMaxZ = z + 0.5;
             
             const pMinX = pos.x - r; const pMaxX = pos.x + r;
             const pMinY = pos.y;     const pMaxY = pos.y + NPC_HEIGHT;
             const pMinZ = pos.z - r; const pMaxZ = pos.z + r;

             if (pMinX < bMaxX && pMaxX > bMinX &&
                 pMinY < bMaxY && pMaxY > bMinY &&
                 pMinZ < bMaxZ && pMaxZ > bMinZ) {
               return true;
             }
          }
        }
      }
    }
    return false;
  };

  useFrame((stateThree) => {
    if (!meshRef.current) return;
    
    if (closestNpcId === npc.id && isTalking) {
        state.current = 'IDLE';
        targetPos.current = null;
        meshRef.current.lookAt(stateThree.camera.position.x, meshRef.current.position.y, stateThree.camera.position.z);
        return; 
    }

    const pos = meshRef.current.position;

    // --- AI Logic ---
    timer.current -= 0.016;
    if (timer.current <= 0) {
        if (state.current === 'IDLE') {
             if (Math.random() < 0.3) {
                 state.current = 'MOVING';
                 const angle = Math.random() * Math.PI * 2;
                 const dist = 1 + Math.random() * 4;
                 targetPos.current = new THREE.Vector3(
                     pos.x + Math.cos(angle) * dist,
                     pos.y, 
                     pos.z + Math.sin(angle) * dist
                 );
                 timer.current = 1 + Math.random() * 3;
             } else {
                 timer.current = 2 + Math.random() * 3;
             }
        } else {
            state.current = 'IDLE';
            timer.current = 1 + Math.random();
        }
    }

    // --- Movement Physics ---
    const moveDir = new THREE.Vector3(0, 0, 0);
    
    if (state.current === 'MOVING' && targetPos.current) {
        const diff = new THREE.Vector3().subVectors(targetPos.current, pos);
        diff.y = 0;
        if (diff.length() > 0.1) {
            diff.normalize();
            moveDir.copy(diff).multiplyScalar(NPC_SPEED);
            
            const targetRotation = Math.atan2(diff.x, diff.z);
            meshRef.current.rotation.y = THREE.MathUtils.lerp(meshRef.current.rotation.y, targetRotation, 0.1);
        } else {
            state.current = 'IDLE';
        }
    }

    // X Movement
    const oldX = pos.x;
    pos.x += moveDir.x;
    if (checkCollision(pos)) pos.x = oldX;

    // Z Movement
    const oldZ = pos.z;
    pos.z += moveDir.z;
    if (checkCollision(pos)) pos.z = oldZ;

    // Y (Gravity)
    velocity.current.y -= GRAVITY;
    pos.y += velocity.current.y;
    
    if (checkCollision(pos)) {
        if (velocity.current.y < 0) {
           // Landed - Snap to block top
           const blockCenterY = Math.floor(pos.y + 0.5); 
           const surfaceY = blockCenterY + 0.5;
           pos.y = surfaceY; 
        }
        velocity.current.y = 0;
    }

    if (pos.y < -20) {
        pos.set(0, 10, 0);
        velocity.current.set(0,0,0);
    }

    if (stateThree.clock.elapsedTime % 0.5 < 0.02) {
        updateNpcPosition(npc.id, [pos.x, pos.y, pos.z]);
    }
  });

  return (
    <group ref={meshRef} position={npc.position}>
        <group userData={{ isNPC: true }}>
            {/* Body */}
            <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.6, 1.5, 0.6]} />
                <meshStandardMaterial color={npc.color} />
            </mesh>
            {/* Head */}
            <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
                <boxGeometry args={[0.5, 0.5, 0.5]} />
                <meshStandardMaterial color="#FFCCAA" /> 
            </mesh>
            {/* Eyes */}
            <mesh position={[0.15, 1.8, 0.26]}>
                <planeGeometry args={[0.1, 0.1]} />
                <meshBasicMaterial color="black" />
            </mesh>
            <mesh position={[-0.15, 1.8, 0.26]}>
                <planeGeometry args={[0.1, 0.1]} />
                <meshBasicMaterial color="black" />
            </mesh>
        </group>

        <Billboard position={[0, 2.8, 0]}>
            <Text
                fontSize={0.25}
                color={closestNpcId === npc.id ? "#FFFF00" : "white"}
                outlineWidth={0.02}
                outlineColor="black"
                anchorY="bottom"
            >
                {npc.name}
            </Text>
            
            {closestNpcId === npc.id && !isTalking && (
                <Text
                position={[0, -0.35, 0]}
                fontSize={0.15}
                color="#DDDDDD"
                outlineWidth={0.01}
                outlineColor="black"
                anchorY="top"
                >
                [V] Start Chat
                </Text>
            )}

             {closestNpcId === npc.id && isTalking && voiceStatus !== 'connected' && (
                <Text
                    position={[0, -0.35, 0]}
                    fontSize={0.15}
                    color="#FFA500"
                    outlineWidth={0.01}
                    outlineColor="black"
                    anchorY="top"
                >
                    {voiceStatus === 'connecting' ? 'Connecting...' : 'Error'}
                </Text>
            )}

            {closestNpcId === npc.id && isTalking && voiceStatus === 'connected' && !npcChatText && (
                 <Text
                 position={[0, -0.35, 0]}
                 fontSize={0.15}
                 color="#00FF00"
                 outlineWidth={0.01}
                 outlineColor="black"
                 anchorY="top"
             >
                 [V] Stop Chat
             </Text>
            )}

            {closestNpcId === npc.id && isTalking && npcChatText && (
                 <group position={[0, 0.8, 0]}>
                    <mesh position={[0, 0, -0.01]}>
                        <planeGeometry args={[3.2, 1.2]} />
                        <meshBasicMaterial color="white" opacity={0.95} transparent />
                    </mesh>
                    <Text
                        position={[0, 0, 0.01]}
                        fontSize={0.14}
                        color="black"
                        maxWidth={3}
                        textAlign="center"
                        anchorY="middle"
                        lineHeight={1.2}
                    >
                        {npcChatText}
                    </Text>
                 </group>
            )}
        </Billboard>
    </group>
  );
};

export const NPCs: React.FC = () => {
  const npcs = useStore((state) => state.npcs);
  const blocks = useStore((state) => state.blocks);

  const blockMap = useMemo(() => {
    const map = new Set<string>();
    blocks.forEach(b => map.add(`${b.position[0]},${b.position[1]},${b.position[2]}`));
    return map;
  }, [blocks]);

  return (
    <group>
      {npcs.map((npc) => (
        <NPCInstance key={npc.id} npc={npc} blockMap={blockMap} />
      ))}
    </group>
  );
};
