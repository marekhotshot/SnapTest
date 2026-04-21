import { GoogleGenAI, Type } from "@google/genai";
import { Question } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function evaluateAnswers(questions: Question[], userAnswers: Record<number, string>): Promise<{ score: number; details: any[] }> {
  const prompt = `
    Si spravodlivý a vysoko inteligentný učiteľ. Vyhodnoť odpovede žiaka na testové otázky.
    
    KRITICKÉ PRAVIDLO: 
    - Akceptuj preklepy, gramatické chyby (chýbajúce dĺžne, mäkčene, veľké/malé písmená) alebo synonymá.
    - Ak je odpoveď vecne správna (napr. "Kyslík" namiesto "kyslík", alebo "stavce" namiesto "stavcov"), MUSÍŠ ju označiť ako správnu (isCorrect: true).
    - Buď veľmi benevolentný pri krátkych odpovediach (short). Ak žiak trafil podstatu, je to správne.
    
    Otázky a odpovede:
    ${questions.map((q, i) => `
      ID: ${i}
      Otázka: ${q.question}
      Správna odpoveď: ${q.correct}
      Odpoveď žiaka: ${userAnswers[i] || "Žiadna odpoveď"}
    `).join('\n')}

    Vráť JSON v tomto formáte:
    {
      "score": number (celkový počet bodov),
      "details": [
        {
          "questionIndex": number (použi presne ID uvedené vyššie),
          "isCorrect": boolean,
          "aiExplanation": string (krátke vysvetlenie prečo je to správne/nesprávne alebo oprava preklepu)
        }
      ]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            details: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionIndex: { type: Type.NUMBER },
                  isCorrect: { type: Type.BOOLEAN },
                  aiExplanation: { type: Type.STRING },
                },
                required: ["questionIndex", "isCorrect", "aiExplanation"],
              }
            }
          },
          required: ["score", "details"]
        }
      }
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Evaluation Error:", error);
    // Fallback to simple matching if AI fails
    let score = 0;
    const details = questions.map((q, i) => {
      const isCorrect = (userAnswers[i] || '').trim().toLowerCase() === q.correct.trim().toLowerCase();
      if (isCorrect) score++;
      return { questionIndex: i, isCorrect, aiExplanation: isCorrect ? "Správne" : `Nesprávne. Správna odpoveď je: ${q.correct}` };
    });
    return { score, details };
  }
}

export async function generateRetryQuestions(failedQuestions: Question[]): Promise<Question[]> {
  const prompt = `
    Žiak v teste nevedel odpovedať na nasledujúce otázky. 
    Vytvor NOVÉ otázky založené na rovnakých faktoch, ale s iným znením alebo formátom, aby si preveril, či žiak učivo pochopil.
    
    Pôvodné otázky (ktoré žiak nevedel):
    ${failedQuestions.map(q => `- ${q.question} (Správna odpoveď bola: ${q.correct})`).join('\n')}

    Vráť IBA čistý JSON formát (pole objektov) s rovnakou štruktúrou ako predtým.
    Štruktúra objektu: {"id": number, "type": "mcq" | "tf" | "short", "question": string, "options": string[], "correct": string, "hint": string}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ["mcq", "tf", "short"] },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correct: { type: Type.STRING },
              hint: { type: Type.STRING },
            },
            required: ["id", "type", "question", "options", "correct", "hint"],
          },
        },
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Retry Generation Error:", error);
    return failedQuestions; // Fallback to same questions
  }
}

export async function generateQuestionsFromImages(base64Images: string[]): Promise<Question[]> {
  const prompt = `
    Si expert na tvorbu testov pre žiakov základných škôl. 
    Z priložených obrázkov učebnice vygeneruj 15-20 testových otázok.
    Mixuj typy otázok: 
    - "mcq" (výber z 3 možností A, B, C)
    - "tf" (Pravda/Nepravda)
    - "short" (krátka odpoveď, 1-2 slová)

    Vráť IBA čistý JSON formát (pole objektov).
    Štruktúra objektu: {"id": number, "type": "mcq" | "tf" | "short", "question": string, "options": string[], "correct": string, "hint": string}
    - "hint" by mala byť nápoveda, ktorá žiaka navedie k odpovedi bez toho, aby ju priamo prezradila.
    Pre "short" nechaj options prázdne pole [].
    Pre "tf" použi options ["Pravda", "Nepravda"].
    Jazyk: Slovenčina.
  `;

  try {
    const imageParts = base64Images.map(img => ({
      inlineData: {
        data: img.split(',')[1] || img,
        mimeType: "image/jpeg",
      },
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          { text: prompt },
          ...imageParts
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.NUMBER },
              type: { type: Type.STRING, enum: ["mcq", "tf", "short"] },
              question: { type: Type.STRING },
              options: { type: Type.ARRAY, items: { type: Type.STRING } },
              correct: { type: Type.STRING },
              hint: { type: Type.STRING },
            },
            required: ["id", "type", "question", "options", "correct", "hint"],
          },
        },
      },
    });

    const text = response.text;
    if (!text) throw new Error("Model nevrátil žiadny text.");
    
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Error:", error);
    throw new Error("Nepodarilo sa vygenerovať otázky. Skúste to znova s inými fotky.");
  }
}
