import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { BLOCKS, TEXTURES, ChatMessage } from '../types';
import { getGeminiResponse } from '../services/geminiService';
import { Bot, Send, Sparkles, Mic, Volume2 } from 'lucide-react';

export const UI: React.FC = () => {
  // Atomic selectors to prevent unnecessary re-renders
  const activeBlock = useStore((state) => state.selectedBlock);
  const setActiveBlock = useStore((state) => state.setBlockType);
  const isTalking = useStore((state) => state.isTalking);
  const closestNpcId = useStore((state) => state.closestNpcId);
  const npcs = useStore((state) => state.npcs);

  const [chatOpen, setChatOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am your Voxel Assistant. Ask me anything about crafting or survival ideas!' }
  ]);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeNpc = npcs.find(n => n.id === closestNpcId);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, chatOpen]);

  // Toggle chat with 'T'
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' && !chatOpen) {
        e.preventDefault();
        setChatOpen(true);
        document.exitPointerLock();
      } else if (e.key === 'Escape' && chatOpen) {
        setChatOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [chatOpen]);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    
    const userMsg: ChatMessage = { role: 'user', text: prompt };
    setMessages(prev => [...prev, userMsg]);
    setPrompt('');
    setLoading(true);

    const aiText = await getGeminiResponse(userMsg.text, messages);
    
    setMessages(prev => [...prev, { role: 'model', text: aiText }]);
    setLoading(false);
  };

  return (
    <div className="absolute inset-0 pointer-events-none select-none z-50 overflow-hidden">
      {/* Crosshair */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
        <div className="w-full h-0.5 bg-white absolute top-1/2 transform -translate-y-1/2 opacity-80"></div>
        <div className="h-full w-0.5 bg-white absolute left-1/2 transform -translate-x-1/2 opacity-80"></div>
      </div>

      {/* Voice Chat Indicator */}
      {isTalking && activeNpc && (
        <div className="absolute top-20 left-1/2 transform -translate-x-1/2 bg-red-600/80 text-white px-6 py-2 rounded-full flex items-center gap-3 backdrop-blur border border-red-400 animate-pulse">
            <Mic className="w-5 h-5" />
            <span className="font-bold pixel-font text-xs">ON AIR: {activeNpc.name}</span>
            <Volume2 className="w-5 h-5" />
        </div>
      )}

      {/* Hotbar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 bg-black/60 p-2 rounded-lg flex gap-2 pointer-events-auto backdrop-blur-sm border border-white/20">
        {BLOCKS.map((type, index) => (
          <div
            key={type}
            onClick={() => setActiveBlock(type)}
            className={`w-12 h-12 border-4 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center relative group
              ${activeBlock === type ? 'border-yellow-400 scale-110' : 'border-gray-500 hover:border-white'}`}
            style={{ backgroundColor: TEXTURES[type] }}
          >
             {/* Tooltip */}
             <span className="absolute -top-10 left-1/2 -translate-x-1/2 bg-black/80 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pixel-font">
               {index + 1}. {type.toUpperCase()}
             </span>
             <span className="absolute bottom-0 right-1 text-xs text-white drop-shadow-md font-bold">{index+1}</span>
          </div>
        ))}
      </div>

      {/* Instructions */}
      <div className="absolute top-4 left-4 text-white text-sm font-bold drop-shadow-md bg-black/40 p-3 rounded pixel-font leading-6">
        <p>WASD to Move</p>
        <p>SPACE to Jump</p>
        <p>L-Click: Remove Block</p>
        <p>R-Click: Place Block</p>
        <p>1-8: Select Block</p>
        <p>T: Text Chat</p>
        <p>V: Voice Chat (Near NPC)</p>
      </div>

      {/* AI Chat Interface */}
      {chatOpen && (
        <div className="absolute top-20 left-4 w-96 max-h-[60vh] flex flex-col pointer-events-auto animate-fade-in-up">
           <div className="bg-slate-900/90 border border-purple-500/50 rounded-t-xl p-3 flex items-center gap-2 shadow-lg backdrop-blur-md">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h2 className="text-white font-bold pixel-font text-sm">Gemini Assistant</h2>
              <button onClick={() => setChatOpen(false)} className="ml-auto text-gray-400 hover:text-white">×</button>
           </div>
           
           <div className="flex-1 bg-black/80 overflow-y-auto p-4 space-y-3 h-64 scrollbar-hide border-x border-purple-500/30">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] p-2 rounded-lg text-sm leading-relaxed ${
                    msg.role === 'user' 
                      ? 'bg-purple-600 text-white rounded-br-none' 
                      : 'bg-slate-700 text-gray-100 rounded-bl-none border border-slate-600'
                  }`}>
                    {msg.role === 'model' && <Bot className="w-3 h-3 inline-block mr-1 mb-0.5 text-purple-300"/>}
                    {msg.text}
                  </div>
                </div>
              ))}
              {loading && (
                 <div className="flex justify-start">
                   <div className="bg-slate-700 p-2 rounded-lg rounded-bl-none">
                     <span className="animate-pulse text-purple-300 text-xs">Thinking...</span>
                   </div>
                 </div>
              )}
              <div ref={messagesEndRef} />
           </div>

           <div className="bg-slate-900/90 p-3 rounded-b-xl border border-t-0 border-purple-500/50 flex gap-2">
             <input
               autoFocus
               type="text"
               value={prompt}
               onChange={(e) => setPrompt(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleSend()}
               placeholder="Ask for crafting tips..."
               className="flex-1 bg-slate-800 text-white rounded px-3 py-2 text-sm outline-none border border-slate-600 focus:border-purple-500 transition-colors"
             />
             <button 
               onClick={handleSend}
               disabled={loading}
               className="bg-purple-600 hover:bg-purple-500 text-white p-2 rounded transition-colors disabled:opacity-50"
             >
               <Send className="w-4 h-4" />
             </button>
           </div>
        </div>
      )}
    </div>
  );
};