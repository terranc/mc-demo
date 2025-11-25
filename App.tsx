
import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { Sky, Stars, Cloud } from '@react-three/drei';
import { Blocks } from './components/Blocks';
import { Player } from './components/Player';
import { NPCs } from './components/NPCs';
import { VoiceChat } from './components/VoiceChat';
import { UI } from './components/UI';
import { useStore } from './store';
import { BLOCKS } from './types';

// Keyboard listener for hotbar
const HotkeyListener = () => {
  const setBlockType = useStore(state => state.setBlockType);
  
  React.useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
       const key = parseInt(e.key);
       if (!isNaN(key) && key >= 1 && key <= 8) {
         const type = BLOCKS[key - 1];
         if (type) setBlockType(type);
       }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [setBlockType]);
  return null;
}

const App: React.FC = () => {
  return (
    <div className="h-full w-full bg-slate-900 relative">
      <UI />
      <VoiceChat />
      <HotkeyListener />
      <Canvas
        shadows
        gl={{ alpha: false }}
        camera={{ fov: 75, position: [0, 5, 5] }}
      >
        <Sky sunPosition={[100, 20, 100]} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        {/* Improved Lighting for Depth */}
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[50, 100, 50]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]} 
          shadow-camera-left={-50}
          shadow-camera-right={50}
          shadow-camera-top={50}
          shadow-camera-bottom={-50}
        />
        
        {/* Clouds for atmosphere */}
        <Cloud opacity={0.5} speed={0.4} bounds={[10, 1.5, 10]} segments={20} position={[0, 20, 0]} />

        <Suspense fallback={null}>
          <Blocks />
          <NPCs />
          <Player />
        </Suspense>
      </Canvas>
    </div>
  );
};

export default App;