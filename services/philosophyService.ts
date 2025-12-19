
import { GoogleGenAI } from "@google/genai";

export const generatePhilosophy = async (): Promise<string[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: "Напиши 110 коротких философских и абстрактных фраз на русском языке о космосе, звуке, метавселенной и гармонии. Каждая фраза должна быть не длиннее 5-7 слов. Стиль: психоделический, глубокий, созерцательный. Верни только список фраз без номеров, по одной в строке.",
    });
    
    const text = response.text || "";
    return text.split('\n').filter(line => line.trim().length > 0);
  } catch (error) {
    console.error("Error generating philosophy:", error);
    return [
      "Звук рождается из тишины пустоты",
      "Мы лишь тени в туманности звука",
      "Гармония кода пронзает вечность",
      "Полет сквозь эхо забытых миров",
      "Метавселенная дышит твоим ритмом",
      "Свет превращается в чистую ноту",
      "Бесконечность танцует в каждом нажатии",
      "Где кончается шум, начинается истина",
      "Твои пальцы создают созвездия",
      "Квантовый шепот великого Ничто"
    ];
  }
};
