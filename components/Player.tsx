
import React, { useEffect, useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { useStore } from '../store';
import * as THREE from 'three';

const JUMP_FORCE = 0.16; // Slightly higher for better feel
const SPEED = 0.12;
const GRAVITY = 0.006; // Slightly stronger gravity
const PLAYER_RADIUS = 0.3; 
const PLAYER_HEIGHT = 1.8;

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

      raycaster.current.setFromCamera(new THREE.Vector2(0, 0), camera);
      
      const intersects = raycaster.current.intersectObjects(scene.children, true);
      const validIntersects = intersects.filter(i => i.distance < 8 && i.object.type !== 'GridHelper');

      if (validIntersects.length > 0) {
        const intersect = validIntersects[0];
        if (!intersect.face) return;

        if (e.button === 0) {
          // Left Click: Remove
          const targetX = Math.floor(intersect.point.x - intersect.face.normal.x * 0.5);
          const targetY = Math.floor(intersect.point.y - intersect.face.normal.y * 0.5);
          const targetZ = Math.floor(intersect.point.z - intersect.face.normal.z * 0.5);
          removeBlock(targetX, targetY, targetZ);
        } else if (e.button === 2) {
          // Right Click: Add
          const targetX = Math.floor(intersect.point.x + intersect.face.normal.x * 0.5);
          const targetY = Math.floor(intersect.point.y + intersect.face.normal.y * 0.5);
          const targetZ = Math.floor(intersect.point.z + intersect.face.normal.z * 0.5);
          
          // Simple distance check to prevent placing inside self
          // (The physics loop handles collision, but this prevents getting stuck immediately)
          const dx = Math.abs(targetX - camera.position.x);
          const dy = Math.abs(targetY - (camera.position.y - 1)); // Approximate center
          const dz = Math.abs(targetZ - camera.position.z);
          
          if (dx < 0.8 && dy < 1.0 && dz < 0.8) return;

          addBlock(targetX, targetY, targetZ);
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    return () => window.removeEventListener('mousedown', handleMouseDown);
  }, [addBlock, removeBlock, camera, scene]);

  // Keyboard Controls
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward.current = true; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft.current = true; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward.current = true; break;
        case 'ArrowRight':
        case 'KeyD': moveRight.current = true; break;
        case 'Space': 
          if (canJump.current) {
            velocity.current.y = JUMP_FORCE;
            canJump.current = false;
          }
          break;
        case 'KeyV':
            if (closestNpcId && !isTalking) {
               setIsTalking(true);
            } else if (isTalking) {
               setIsTalking(false);
            }
            break;
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      switch (event.code) {
        case 'ArrowUp':
        case 'KeyW': moveForward.current = false; break;
        case 'ArrowLeft':
        case 'KeyA': moveLeft.current = false; break;
        case 'ArrowDown':
        case 'KeyS': moveBackward.current = false; break;
        case 'ArrowRight':
        case 'KeyD': moveRight.current = false; break;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [closestNpcId, isTalking, setIsTalking]);

  // Collision Helper
  const checkCollision = (pos: THREE.Vector3) => {
    const r = PLAYER_RADIUS;
    // Player AABB (Axis-Aligned Bounding Box) relative to Camera Position
    // Camera is at eye level (approx 1.6m from feet)
    const pMinX = pos.x - r;
    const pMaxX = pos.x + r;
    const pMinY = pos.y - 1.6; // Feet
    const pMaxY = pos.y + 0.2; // Top of head
    const pMinZ = pos.z - r;
    const pMaxZ = pos.z + r;

    // Scan integer coordinates around the player
    const minX = Math.floor(pMinX - 0.5);
    const maxX = Math.ceil(pMaxX + 0.5);
    const minY = Math.floor(pMinY - 0.5);
    const maxY = Math.ceil(pMaxY + 0.5);
    const minZ = Math.floor(pMinZ - 0.5);
    const maxZ = Math.ceil(pMaxZ + 0.5);

    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          if (blockMap.has(`${x},${y},${z}`)) {
            // Block AABB
            const bMinX = x - 0.5;
            const bMaxX = x + 0.5;
            const bMinY = y - 0.5;
            const bMaxY = y + 0.5;
            const bMinZ = z - 0.5;
            const bMaxZ = z + 0.5;

            // Check overlap
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

  // Physics Loop
  useFrame(() => {
    // 1. NPC Detection
    let foundNpc = null;
    let minDist = 3; // Interaction radius

    for (const npc of npcs) {
        const npcPos = new THREE.Vector3(...npc.position);
        const dist = camera.position.distanceTo(npcPos);
        if (dist < minDist) {
            minDist = dist;
            foundNpc = npc.id;
        }
    }
    
    // Only update state if it changed to prevent loop trash
    if (foundNpc !== closestNpcId) {
        setClosestNpcId(foundNpc);
        if (foundNpc === null && isTalking) {
            setIsTalking(false); // Walked away
        }
    }

    // 2. Calculate Movement Vector
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

    // 3. X Movement & Collision
    const oldX = camera.position.x;
    camera.position.x += direction.x;
    if (checkCollision(camera.position)) {
      camera.position.x = oldX;
    }

    // 4. Z Movement & Collision
    const oldZ = camera.position.z;
    camera.position.z += direction.z;
    if (checkCollision(camera.position)) {
      camera.position.z = oldZ;
    }

    // 5. Y Movement (Gravity) & Collision
    camera.position.y += velocity.current.y;
    velocity.current.y -= GRAVITY;

    if (checkCollision(camera.position)) {
      // Revert Y to previous valid state
      // (This is a simplified approach; ideally we'd snap to surface)
      camera.position.y -= velocity.current.y;
      
      if (velocity.current.y < 0) {
        // Landing
        velocity.current.y = 0;
        canJump.current = true;
      } else {
        // Hitting head
        velocity.current.y = 0;
      }
    }

    // Void Respawn
    if (camera.position.y < -30) {
        camera.position.set(0, 10, 0);
        velocity.current.set(0,0,0);
    }
  });

  return <PointerLockControls />;
};
