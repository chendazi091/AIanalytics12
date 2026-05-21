import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";

// Load environment variables
dotenv.config();

// ES module path resolution helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enable JSON request bodies (up to 10MB to support large CSV pastes)
  app.use(express.json({ limit: "10mb" }));

  // Initialize Gemini client safely (server-side only)
  let ai: GoogleGenAI | null = null;
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
      console.log("Gemini API client successfully initialized.");
    } else {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not defined.");
    }
  } catch (err) {
    console.error("Failed to initialize GoogleGenAI client:", err);
  }

  // System Instruction defining Taiwan-Traditional Chinese data scientist persona
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

  // API endpoint for CSV data analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { csvData, analysisType, customGoal } = req.body;

      if (!csvData || typeof csvData !== "string" || csvData.trim() === "") {
        return res.status(400).json({ error: "沒有提供有效的 CSV 數據資料" });
      }

      if (!ai) {
        return res.status(500).json({
          error: "Gemini API 尚未配置，請先在 Secrets 面板中設定您的 GEMINI_API_KEY。",
        });
      }

      // Map interactive analysis type to friendly Traditional Chinese terms
      let typeLabel = "全面性核心分析與洞察";
      if (analysisType === "trends") {
        typeLabel = "關鍵趨勢預測與規律探索";
      } else if (analysisType === "anomalies") {
        typeLabel = "異常檢測與潛在風險診斷報告";
      } else if (analysisType === "actionable") {
        typeLabel = "以數據為導向的落地優化策略與行動建議";
      }

      // Build precise user query prompt
      let userPrompt = `請分析以下提供的 CSV 數據資料：\n\n\`\`\`csv\n${csvData}\n\`\`\`\n\n`;
      userPrompt += `【分析焦點方向】：${typeLabel}\n`;
      
      if (customGoal && typeof customGoal === "string" && customGoal.trim() !== "") {
        userPrompt += `【使用者特別關注的目標或疑問】：\n> ${customGoal}\n\n`;
      }
      
      userPrompt += `請依據上述的 System Instruction 指導原則，為此 CSV 數據撰寫一份極具洞察力的分析報告。`;

      console.log(`Starting content generation with 'gemini-3.5-flash'. Direction: ${typeLabel}`);

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.25, // Lower temperature for more factual, precise data analysis
        },
      });

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Gemini 模型返回了空內容。");
      }

      return res.json({ analysis: resultText });
    } catch (err: any) {
      console.error("Error during CSV analysis:", err);
      return res.status(500).json({
        error: `分析失敗：${err?.message || "伺服器內部未知錯誤"}。如果您使用了新的 API Key，請重新啟動伺服器或檢查 Secrets。`,
      });
    }
  });

  // Vite development server / static file setup
  if (process.env.NODE_ENV !== "production") {
    console.log("Configuring Vite middleware for development mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Serving static production web assets from /dist...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`AI 數據分析伺服器正在 port ${PORT} 運作。`);
  });
}

startServer().catch((err) => {
  console.error("CRITICAL: Failed to start server:", err);
});
