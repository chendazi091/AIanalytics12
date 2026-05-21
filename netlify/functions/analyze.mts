import type { Context } from "@netlify/functions";
import { GoogleGenAI } from "@google/genai";

const SYSTEM_INSTRUCTION = `你是一位資深的數據分析專家與商業智慧導師。你的任務是協助使用者分析貼上的 CSV 數據報表，提供專業、客觀且具備商業價值的解讀報告。

請務必遵守以下指導原則：
1. 語言規範：
   - 必須完全使用繁體中文（台灣習慣用語，例如「數據」、「資料」、「分析」、「欄位」、「指標」、「專案」）進行回答。
   - 語氣必須專業、嚴謹、富有洞察力，切忌浮誇與空洞內容。

2. 格式化輸出：
   - 輸出格式必須清晰優雅，充分利用 Markdown 語法。
   - 使用 Markdown 標題、粗體、清單與引用區塊來組織長篇段落，使其高可讀性。
   - 建議根據合適的數據指標，整理出重點摘要表格。

3. 專業分析架構（視數據類型與欄位動態調整，但應涵蓋以下核心面向）：
   - 【數據總覽】：一目了然的關鍵指標（KPI）摘要，對統計特徵（如總和、平均值、最大値/最小值值、整體趨勢等）進行總和重點描述。
   - 【關鍵趨勢與發現】：指出資料中的核心脈絡、時間規律、增長點或衰退趨勢。
   - 【異常偵測與風險診斷】：找出資料中不合理、極端、有隱憂或潛在問題之處（例如突然暴跌/暴增的數據、空白無效欄位、不匹配指標）。
   - 【具體行動與優化策略】：根據數據優化空間，提供明晰、可口、具體有商業可行性的改善策略建議。

4. 健全性檢查：
   - 所有的推論、趨勢判斷與百分比計算皆需基於使用者提供的 CSV 數據本身，拒絕無中生有的虛構數據。
   - 若使用者提供的 CSV 格式不佳或數據存在缺漏，請在開頭簡潔有禮地提示，並儘可能就現有可信數據進行客觀分析。`;

interface AnalyzeRequestBody {
  csvData: string;
  analysisType: string;
  customGoal?: string;
}

export default async (req: Request, _context: Context) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Read API key from server-side environment variable (never exposed to client)
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "伺服器未配置 Gemini API Key，請聯繫管理員。" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  let body: AnalyzeRequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: "無效的請求格式。" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const { csvData, analysisType, customGoal } = body;

  if (!csvData || !csvData.trim()) {
    return new Response(
      JSON.stringify({ error: "請提供有效的 CSV 數據資料。" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // Map analysis type to Traditional Chinese label
  let typeLabel = "全面性核心分析與洞察";
  if (analysisType === "trends") {
    typeLabel = "關鍵趨勢預測與規律探索";
  } else if (analysisType === "anomalies") {
    typeLabel = "異常檢測與潛在風險診斷報告";
  } else if (analysisType === "actionable") {
    typeLabel = "以數據為導向的落地優化策略與行動建議";
  }

  // Build user prompt
  let userPrompt = `請分析以下提供的 CSV 數據資料：\n\n\`\`\`csv\n${csvData}\n\`\`\`\n\n`;
  userPrompt += `【分析焦點方向】：${typeLabel}\n`;

  if (customGoal && customGoal.trim() !== "") {
    userPrompt += `【使用者特別關注的目標或疑問】：\n> ${customGoal}\n\n`;
  }

  userPrompt += `請依據上述的 System Instruction 指導原則，為此 CSV 數據撰寫一份極具洞察力的分析報告。`;

  try {
    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.25,
      },
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Gemini 模型返回了空內容。");
    }

    return new Response(
      JSON.stringify({ report: resultText }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Gemini API Error:", err);
    return new Response(
      JSON.stringify({
        error: err?.message || "Gemini API 呼叫失敗，請確認 API Key 是否正確且具備額度。",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
