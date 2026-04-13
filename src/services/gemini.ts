import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY as string });

export const geminiService = {
  async autoCategorizeExpense(description: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Categorize this expense description into one of: rent, groceries, utilities, other. Description: "${description}"`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING, enum: ["rent", "groceries", "utilities", "other"] }
          },
          required: ["category"]
        }
      }
    });
    return JSON.parse(response.text).category;
  },

  async getFairnessScore(roommates: any[], expenses: any[], chores: any[], inventory: any[]) {
    const prompt = `Analyze the following house data and provide a fairness summary for each roommate.
    Roommates: ${JSON.stringify(roommates)}
    Expenses: ${JSON.stringify(expenses)}
    Chores: ${JSON.stringify(chores)}
    Inventory Purchases: ${JSON.stringify(inventory)}
    
    Output a fairness score (0-100) and a plain English insight for each roommate. 
    Be warm, neutral, and non-judgmental.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              userId: { type: Type.STRING },
              score: { type: Type.NUMBER },
              insight: { type: Type.STRING }
            },
            required: ["userId", "score", "insight"]
          }
        }
      }
    });
    return JSON.parse(response.text);
  },

  async mediateConflict(conflict: string, houseRules: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `As a neutral house mediator, suggest a fair resolution for this conflict based on the house rules.
      Conflict: "${conflict}"
      House Rules: "${houseRules}"
      Tone: Warm, neutral, non-judgmental.`,
    });
    return response.text;
  },

  async draftAwkwardMessage(situation: string) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Draft a friendly, non-confrontational message for this situation: "${situation}". 
      The goal is to make a difficult conversation easier.`,
    });
    return response.text;
  },

  async suggestChoreSchedule(roommates: any[], chores: any[]) {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Suggest a fair chore schedule for these roommates and chores.
      Roommates: ${JSON.stringify(roommates)}
      Chores: ${JSON.stringify(chores)}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              choreId: { type: Type.STRING },
              assignedTo: { type: Type.STRING },
              reason: { type: Type.STRING }
            },
            required: ["choreId", "assignedTo", "reason"]
          }
        }
      }
    });
    return JSON.parse(response.text);
  },

  async generateDailyReminders(chores: any[], expenses: any[], inventory: any[]) {
    const prompt = `Generate a warm, friendly daily summary for a household.
    Pending Chores: ${JSON.stringify(chores.filter(c => !c.completed))}
    Unpaid Bills: ${JSON.stringify(expenses.filter(e => e.isRecurring))}
    Low Inventory: ${JSON.stringify(inventory.filter(i => i.status !== 'In Stock'))}
    
    Tone: Warm, non-nagging, helpful. Max 3 bullet points.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  }
};
