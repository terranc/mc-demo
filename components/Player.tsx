
import React, { useEffect, useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { useStore } from '../store';
import * as THREE from 'three';

const JUMP_FORCE = 0.18;
const SPEED = 0.12;
const GRAVITY = 0.008;
const PLAYER_RADIUS = 0.3;
const PLAYER_HEIGHT = 1.8;
const EYE_HEIGHT = 1.5;

// Distance thresholds
const NPC_ACTIVATE_DIST = 3.5;
const NPC_DEACTIVATE_DIST = 6.0;

export const Player: React.FC = () => {
  const { camera, scene } = useThree();
  
  const blocks = useStore((state) => state.blocks);
  const npcs = useStore((state) => state.npcs);
  const addBlock = useStore((state) => state.addBlock);
  const removeBlock = useStore((state) => state.removeBlock);
  const setClosestNpcId = useStore((state) => state.setClosestNpcId);
  const setIsTalking = useStore((state) => state.setIsTalking);
  const isTalking = useStore((state) => state.isTalking);
  const closestNpcId = useStore((state) => state.closestNpcId);

  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const canJump = useRef(false);
  const velocity = useRef(new THREE.Vector3());
  const lastToggleTime = useRef(0);
  
  const raycaster = useRef(new THREE.Raycaster());

  // Optimization: Create a Set for O(1) block lookup
  const blockMap = useMemo(() => {
    const map = new Set<string>();
    blocks.forEach(b => map.add(`${b.position[0]},${b.position[1]},${b.position[2]}`));
    return map;
  }, [blocks]);

  // Block Interaction Logic
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;
      if (isTalking) return;

      raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
      
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      const validIntersects = intersects.filter(i => i.distance < 6 && i.object.type !== 'GridHelper');

      if (validIntersects.length > 0) {
        const intersect = validIntersects[0];
        if (intersect.object.userData?.isNPC) return;
        if (!intersect.face) return;

        if (e.button === 0) {
          const targetX = Math.floor(intersect.point.x - intersect.face.normal.x * 0.5);
          const targetY = Math.floor(intersect.point.y - intersect.face.normal.y * 0.5);
          const targetZ = Math.floor(intersect.point.z - intersect.face.normal.z * 0.5);
          removeBlock(targetX, targetY, targetZ);
        } else if (e.button === 2) {
          const targetX = Math.floor(intersect.point.x + intersect.face.normal.x * 0.5);
          const targetY = Math.floor(intersect.point.y + intersect.face.normal.y * 0.5);
          const targetZ = Math.floor(intersect.point.z + intersect.face.normal.z * 0.5);
          
          const dx = Math.abs(targetX - camera.position.x);
          const dy = Math.abs(targetY - (camera.position.y - 1)); 
          const dz = Math.abs(targetZ - camera.position.z);
          
          if (dx < 0.6 && dy < 1.0 && dz < 0.6) return;

          addBlock(targetX, targetY, targetZ);
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [camera, scene, addBlock, removeBlock, isTalking]);

  // Keyboard Movement Controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward.current = true; break;
        case 'KeyS': moveBackward.current = true; break;
        case 'KeyA': moveLeft.current = true; break;
        case 'KeyD': moveRight.current = true; break;
        case 'Space': 
          if (canJump.current) {
            velocity.current.y = JUMP_FORCE;
            canJump.current = false;
          }
          break;
        case 'KeyV':
        case 'KeyB': 
           if (e.repeat) return; 
           if (closestNpcId) {
             const now = Date.now();
             // Debounce logic: prevent toggling more than once every 500ms
             if (now - lastToggleTime.current > 500) {
                 lastToggleTime.current = now;
                 setIsTalking(!isTalking);
             }
           }
           break;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      switch (e.code) {
        case 'KeyW': moveForward.current = false; break;
        case 'KeyS': moveBackward.current = false; break;
        case 'KeyA': moveLeft.current = false; break;
        case 'KeyD': moveRight.current = false; break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, [closestNpcId, isTalking, setIsTalking]);

  // Check collision at a specific position
  const checkCollision = (pos: THREE.Vector3) => {
    const r = PLAYER_RADIUS; 
    const feetY = pos.y - EYE_HEIGHT;
    
    // Check local bounds
    const minX = Math.floor(pos.x - r); const maxX = Math.ceil(pos.x + r);
    const minY = Math.floor(feetY);     const maxY = Math.ceil(feetY + PLAYER_HEIGHT);
    const minZ = Math.floor(pos.z - r); const maxZ = Math.ceil(pos.z + r);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (blockMap.has(`${x},${y},${z}`)) {
             // AABB vs AABB
             const pMinX = pos.x - r; const pMaxX = pos.x + r;
             const pMinY = feetY;     const pMaxY = feetY + PLAYER_HEIGHT;
             const pMinZ = pos.z - r; const pMaxZ = pos.z + r;
             
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

  // Main Physics Loop
  useFrame(() => {
    if (isTalking) return; 

    // 1. Calculate Horizontal Movement
    const direction = new THREE.Vector3();
    const frontVector = new THREE.Vector3(
      0, 
      0, 
      Number(moveBackward.current) - Number(moveForward.current)
    );
    const sideVector = new THREE.Vector3(
      Number(moveLeft.current) - Number(moveRight.current), 
      0, 
      0
    );

    direction
      .subVectors(frontVector, sideVector)
      .normalize()
      .multiplyScalar(SPEED)
      .applyEuler(camera.rotation);

    velocity.current.x = direction.x;
    velocity.current.z = direction.z;

    // 2. Apply XZ Movement (Wall Sliding)
    const oldPos = camera.position.clone();
    
    // Try X
    camera.position.x += velocity.current.x;
    if (checkCollision(camera.position)) {
        camera.position.x = oldPos.x;
    }

    // Try Z
    camera.position.z += velocity.current.z;
    if (checkCollision(camera.position)) {
        camera.position.z = oldPos.z;
    }

    // 3. Apply Y Movement (Gravity)
    velocity.current.y -= GRAVITY;
    
    camera.position.y += velocity.current.y;

    if (checkCollision(camera.position)) {
       // We hit something vertically
       
       if (velocity.current.y < 0) {
           // Falling down -> Hit ground
           canJump.current = true;
           velocity.current.y = 0;
           
           // Snap to surface
           const feetY = camera.position.y - EYE_HEIGHT;
           const blockCenterY = Math.floor(feetY + 0.5); 
           const surfaceY = blockCenterY + 0.5;
           
           camera.position.y = surfaceY + EYE_HEIGHT;

       } else {
           // Jumping up -> Hit ceiling
           velocity.current.y = 0;
           camera.position.y = oldPos.y; // Simply revert to avoid getting stuck
       }
    }

    // Void reset
    if (camera.position.y < -30) {
        camera.position.set(0, 10, 0);
        velocity.current.set(0, 0, 0);
    }

    // --- NPC Proximity Logic with Hysteresis ---
    let nearestId: string | null = null;
    let minDst = Infinity;

    for (const npc of npcs) {
        const npcPos = new THREE.Vector3(npc.position[0], npc.position[1], npc.position[2]);
        const dist = npcPos.distanceTo(camera.position);
        if (dist < minDst) {
            minDst = dist;
            nearestId = npc.id;
        }
    }

    let newClosestId = closestNpcId;

    if (nearestId) {
        if (nearestId === closestNpcId) {
             // Currently selected: Keep it until we are far away (Hysteresis Exit)
             if (minDst > NPC_DEACTIVATE_DIST) {
                 newClosestId = null;
             }
        } else {
             // Not selected: Select only if very close (Hysteresis Entry)
             if (minDst < NPC_ACTIVATE_DIST) {
                 newClosestId = nearestId;
             } else if (!closestNpcId && minDst < NPC_ACTIVATE_DIST + 1) {
                 // Slight ease-in if nothing is selected
                 newClosestId = nearestId;
             }
        }
    } else {
        newClosestId = null;
    }

    if (newClosestId !== closestNpcId) {
        setClosestNpcId(newClosestId);
    }
  });

  return (
    <PointerLockControls 
      onLock={() => console.log('locked')} 
      onUnlock={() => console.log('unlocked')} 
    />
  );
};
