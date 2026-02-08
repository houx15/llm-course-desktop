import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { Message } from "../types";

const SYSTEM_INSTRUCTION = `You are an expert teaching assistant for a specialized course on "Social Science & Large Language Models".
Your goal is to help students understand complex concepts, debug code, and refine their social science methodologies using AI.
Be concise, encouraging, and academic but accessible.
If the user provides a "Context" from the course material, prioritize that information in your answer.`;

// Helper to get the API Key dynamically
const getApiKey = () => {
  try {
    const savedConfigs = JSON.parse(localStorage.getItem('app_model_configs') || '{}');
    if (savedConfigs.gemini && savedConfigs.gemini.key) {
      return savedConfigs.gemini.key;
    }
  } catch (e) {
    // ignore parsing errors
  }
  return process.env.API_KEY;
};

// Helper to get the model name dynamically
const getModelName = (defaultModel: string) => {
   try {
    const savedConfigs = JSON.parse(localStorage.getItem('app_model_configs') || '{}');
    if (savedConfigs.gemini && savedConfigs.gemini.model) {
      return savedConfigs.gemini.model;
    }
  } catch (e) {
    // ignore
  }
  return defaultModel;
}

export const createChatSession = (defaultModel: string = "gemini-3-flash-preview"): Chat => {
  const apiKey = getApiKey();
  const modelName = getModelName(defaultModel);

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  return ai.chats.create({
    model: modelName,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
    },
  });
};

export const sendMessageStream = async (
  chat: Chat,
  message: string,
  context: string | null
): Promise<AsyncIterable<GenerateContentResponse>> => {
  let finalMessage = message;
  if (context) {
    finalMessage = `[CONTEXT_START]\n${context}\n[CONTEXT_END]\n\nStudent Question: ${message}`;
  }

  return chat.sendMessageStream({ message: finalMessage });
};