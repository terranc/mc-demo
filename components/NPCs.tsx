import React, { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../store';
import { Text, Billboard, Instance, Instances } from '@react-three/drei';
import * as THREE from 'three';
import { NPC } from '../types';

const NPC_SPEED = 0.04; // Slower than player
const GRAVITY = 0.01;
const NPC_RADIUS = 0.3;

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

  // Helper: Check Collision (Copied logic from Player to keep them independent)
  const checkCollision = (pos: THREE.Vector3) => {
    const r = NPC_RADIUS;
    const pMinX = pos.x - r; const pMaxX = pos.x + r;
    const pMinY = pos.y;     const pMaxY = pos.y + 1.5; // Height
    const pMinZ = pos.z - r; const pMaxZ = pos.z + r;

    const minX = Math.floor(pMinX - 0.5); const maxX = Math.ceil(pMaxX + 0.5);
    const minY = Math.floor(pMinY - 0.5); const maxY = Math.ceil(pMaxY + 0.5);
    const minZ = Math.floor(pMinZ - 0.5); const maxZ = Math.ceil(pMaxZ + 0.5);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (blockMap.has(`${x},${y},${z}`)) {
             const bMinX = x - 0.5; const bMaxX = x + 0.5;
             const bMinY = y - 0.5; const bMaxY = y + 0.5;
             const bMinZ = z - 0.5; const bMaxZ = z + 0.5;
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
    const pos = meshRef.current.position;

    // --- AI Logic ---
    timer.current -= 0.016;

    // Stop moving if talking
    if (closestNpcId === npc.id && isTalking) {
        state.current = 'IDLE';
        targetPos.current = null;
        // Look at player (simple rotation)
        meshRef.current.lookAt(stateThree.camera.position.x, pos.y, stateThree.camera.position.z);
    } else if (timer.current <= 0) {
        if (state.current === 'IDLE') {
             // Decide to move
             if (Math.random() < 0.3) {
                 state.current = 'MOVING';
                 // Pick random nearby point
                 const angle = Math.random() * Math.PI * 2;
                 const dist = 2 + Math.random() * 3;
                 targetPos.current = new THREE.Vector3(
                     pos.x + Math.cos(angle) * dist,
                     pos.y, // Target Y doesn't matter much for horizontal move
                     pos.z + Math.sin(angle) * dist
                 );
                 timer.current = 1 + Math.random() * 3; // Move for 1-4s
             } else {
                 timer.current = 2 + Math.random() * 3; // Stay idle
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
            
            // Rotate towards movement
            const angle = Math.atan2(diff.x, diff.z);
            meshRef.current.rotation.y = angle;
        } else {
            state.current = 'IDLE';
        }
    }

    // Apply Velocity
    // X
    const oldX = pos.x;
    pos.x += moveDir.x;
    if (checkCollision(pos)) pos.x = oldX;

    // Z
    const oldZ = pos.z;
    pos.z += moveDir.z;
    if (checkCollision(pos)) pos.z = oldZ;

    // Y (Gravity)
    velocity.current.y -= GRAVITY;
    pos.y += velocity.current.y;
    
    if (checkCollision(pos)) {
        pos.y -= velocity.current.y;
        velocity.current.y = 0;
    }

    // Void floor
    if (pos.y < -20) {
        pos.set(0, 5, 0);
        velocity.current.set(0,0,0);
    }

    // Sync to store (Throttled for performance)
    // We only update the store every ~10 frames so Player interactions can find us
    if (stateThree.clock.elapsedTime % 0.5 < 0.02) {
        updateNpcPosition(npc.id, [pos.x, pos.y, pos.z]);
    }
  });

  return (
    <group ref={meshRef} position={npc.position}>
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

        {/* Eyes (Simple) */}
        <mesh position={[0.15, 1.8, 0.26]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial color="black" />
        </mesh>
        <mesh position={[-0.15, 1.8, 0.26]}>
            <planeGeometry args={[0.1, 0.1]} />
            <meshBasicMaterial color="black" />
        </mesh>

        {/* Name Tag & Chat Bubble */}
        <Billboard position={[0, 2.5, 0]}>
            <Text
                fontSize={0.25}
                color={closestNpcId === npc.id ? "#FFFF00" : "white"}
                outlineWidth={0.02}
                outlineColor="black"
                anchorY="bottom"
            >
                {npc.name}
            </Text>
            
            {/* Interaction Prompt */}
            {closestNpcId === npc.id && !isTalking && (
                <Text
                position={[0, -0.3, 0]}
                fontSize={0.15}
                color="#DDDDDD"
                outlineWidth={0.01}
                outlineColor="black"
                anchorY="top"
                >
                [V] to Talk
                </Text>
            )}

            {/* Chat Bubble */}
            {closestNpcId === npc.id && isTalking && npcChatText && (
                 <group position={[0, 0.8, 0]}>
                    <mesh position={[0, 0, -0.01]}>
                        <planeGeometry args={[3, 1]} />
                        <meshBasicMaterial color="white" opacity={0.9} transparent />
                    </mesh>
                    <Text
                        position={[0, 0, 0]}
                        fontSize={0.15}
                        color="black"
                        maxWidth={2.8}
                        textAlign="center"
                        anchorY="middle"
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

  // Optimized Block Map for Collision
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