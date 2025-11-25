import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || ''; // Ensure this is set in your environment
const ai = new GoogleGenAI({ apiKey });

export const getGeminiResponse = async (
  prompt: string,
  history: { role: 'user' | 'model'; text: string }[]
): Promise<string> => {
  if (!apiKey) {
    return "Error: API_KEY not found in environment.";
  }

  try {
    const model = 'gemini-2.5-flash';
    
    // Construct chat history for context
    // We limit history to last 6 messages to keep context concise
    const recentHistory = history.slice(-6);
    
    let chatContext = "You are a Minecraft/Voxel survival expert AI assistant. Keep answers short, witty, and helpful for a gamer. The user is playing a web-based voxel game.";
    
    // Simple way to format history for the prompt if not using chat session directly for statelessness
    // Ideally use ai.chats.create for stateful, but here we do single-shot with context for simplicity in UI handling
    const formattedHistory = recentHistory.map(h => `${h.role === 'user' ? 'User' : 'AI'}: ${h.text}`).join('\n');
    
    const fullPrompt = `${chatContext}\n\nCurrent Chat History:\n${formattedHistory}\n\nUser: ${prompt}\nAI:`;

    const response = await ai.models.generateContent({
      model,
      contents: fullPrompt,
    });

    return response.text || "I couldn't think of anything to say.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "The spirits of the void are blocking my thoughts (API Error).";
  }
};