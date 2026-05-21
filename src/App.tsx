import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import Markdown from "react-markdown";
import {
  Database,
  FileText,
  Sparkles,
  Copy,
  Download,
  Check,
  Trash2,
  AlertTriangle,
  TrendingUp,
  Search,
  Table,
  ChevronRight,
  Layers,
  ArrowRightLeft,
  X,
  FileSpreadsheet,
  Settings,
  Eye,
  EyeOff
} from "lucide-react";
import { GoogleGenAI } from "@google/genai";
import { CSV_TEMPLATES, CsvTemplate } from "./data";

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

export default function App() {
  // 1. Data States
  const [csvInput, setCsvInput] = useState<string>("");
  const [customGoal, setCustomGoal] = useState<string>("");
  const [analysisType, setAnalysisType] = useState<string>("general");
  const [activeTab, setActiveTab] = useState<"analysis" | "preview">("analysis");

  // 2. Execution States
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState<string>("");
  const [analysisReport, setAnalysisReport] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // 3. Table Preview Search Filter
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [previewPage, setPreviewPage] = useState<number>(0);
  const ROWS_PER_PAGE = 8;

  // 4. API Key States
  const [apiKey, setApiKey] = useState<string>(() => {
    const saved = localStorage.getItem("GEMINI_API_KEY");
    if (saved) return saved;
    // Fallback to environment variables
    return (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY || "");
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [tempApiKey, setTempApiKey] = useState<string>(apiKey);
  const [showPassword, setShowPassword] = useState<boolean>(false);

  // Synchronize temp state when apiKey is updated elsewhere
  useEffect(() => {
    setTempApiKey(apiKey);
  }, [apiKey]);

  // Real-time parsed CSV data
  const parsedData = useMemo(() => {
    if (!csvInput.trim()) return { headers: [], rows: [] };
    
    const lines = csvInput.split(/\r?\n/).map(line => line.trim()).filter(line => line !== "");
    if (lines.length === 0) return { headers: [], rows: [] };

    // Robust CSV row splitter that respects double quotes values
    const parseRow = (rowText: string): string[] => {
      const result: string[] = [];
      let currentPart = "";
      let insideQuotes = false;
      for (let i = 0; i < rowText.length; i++) {
        const char = rowText[i];
        if (char === '"' || char === "'") {
          insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
          result.push(currentPart.trim());
          currentPart = "";
        } else {
          currentPart += char;
        }
      }
      result.push(currentPart.trim());
      return result;
    };

    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(line => parseRow(line));
    return { headers, rows };
  }, [csvInput]);

  // Fuzzy filtering on parsed rows
  const filteredRows = useMemo(() => {
    if (!searchQuery.trim() || parsedData.rows.length === 0) return parsedData.rows;
    const lowerQuery = searchQuery.toLowerCase();
    return parsedData.rows.filter(row => 
      row.some(cell => cell.toLowerCase().includes(lowerQuery))
    );
  }, [parsedData, searchQuery]);

  // Total pages for table preview pagination
  const totalPages = Math.ceil(filteredRows.length / ROWS_PER_PAGE);
  const paginatedRows = useMemo(() => {
    const start = previewPage * ROWS_PER_PAGE;
    return filteredRows.slice(start, start + ROWS_PER_PAGE);
  }, [filteredRows, previewPage]);

  // Handle templating click
  const applyTemplate = (template: CsvTemplate) => {
    setCsvInput(template.data);
    setCustomGoal(template.objective);
    setSearchQuery("");
    setPreviewPage(0);
    // Auto toggle to preview to let user see their data loading
    setActiveTab("preview");
  };

  // Trigger professional analysis API
  const handleAnalyze = async () => {
    if (!csvInput.trim()) {
      setErrorMsg("請輸入或點選載入有效的 CSV 數據資料後再進行分析。");
      return;
    }

    if (!apiKey.trim()) {
      setErrorMsg("請先設定您的 Gemini API Key。請點擊右上角的「設定密鑰」按鈕進行配置。");
      setShowSettings(true);
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setAnalysisReport("");
    setActiveTab("analysis");

    // Artificial steps to provide standard premium data feedback
    const steps = [
      "正在進行數據結構解析與完整性檢查...",
      "正在對關鍵統計特徵（合計值、平均數、分布情況）進行彙整計算...",
      "正在向 Google Gemini 3.5 載入 System Instructions 商業模型規則...",
      "正在由 AI 解析行銷、營運、銷售特徵，撰寫繁繁中高質量洞察報告..."
    ];

    let currentStep = 0;
    setLoadingStep(steps[currentStep]);

    const interval = setInterval(() => {
      if (currentStep < steps.length - 1) {
        currentStep++;
        setLoadingStep(steps[currentStep]);
      }
    }, 1500);

    try {
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
      let userPrompt = `請分析以下提供的 CSV 數據資料：\n\n\`\`\`csv\n${csvInput}\n\`\`\`\n\n`;
      userPrompt += `【分析焦點方向】：${typeLabel}\n`;
      
      if (customGoal && customGoal.trim() !== "") {
        userPrompt += `【使用者特別關注的目標或疑問】：\n> ${customGoal}\n\n`;
      }
      
      userPrompt += `請依據上述的 System Instruction 指導原則，為此 CSV 數據撰寫一份極具洞察力的分析報告。`;

      // Initialize GoogleGenAI client directly client-side
      const ai = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: userPrompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.25, // Lower temperature for more factual, precise data analysis
        },
      });

      clearInterval(interval);

      const resultText = response.text;
      if (!resultText) {
        throw new Error("Gemini 模型返回了空內容。");
      }

      setAnalysisReport(resultText);
    } catch (err: any) {
      clearInterval(interval);
      console.error(err);
      setErrorMsg(err?.message || "伺服器通訊超時或無效，請確認 Gemini 密鑰已填寫且具備額度。");
    } finally {
      setLoading(false);
      setLoadingStep("");
    }
  };

  // Helper metrics calculator for top visual dashboard widgets
  const quickStats = useMemo(() => {
    const rowCount = parsedData.rows.length;
    const colCount = parsedData.headers.length;
    if (rowCount === 0) return { rows: 0, cols: 0, blankCells: 0 };

    let totalCells = rowCount * colCount;
    let blankCells = 0;
    parsedData.rows.forEach(row => {
      row.forEach(cell => {
        if (!cell || cell.trim() === "" || cell === "無") blankCells++;
      });
    });

    return { rows: rowCount, cols: colCount, blankCells };
  }, [parsedData]);

  // Copy report output
  const handleCopyReport = () => {
    if (!analysisReport) return;
    navigator.clipboard.writeText(analysisReport).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback
      alert("複製失敗，請手動全選複製。");
    });
  };

  // Download report output as text
  const handleDownloadReport = () => {
    if (!analysisReport) return;
    const blob = new Blob([analysisReport], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Gemini_數據分析洞察報告_${new Date().toISOString().slice(0,10)}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#020617] text-slate-100 flex flex-col font-sans overflow-x-hidden relative">
      
      {/* Background Mesh Gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-[-5%] right-[-5%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[150px] pointer-events-none"></div>
      <div className="absolute top-[20%] right-[10%] w-[30%] h-[30%] bg-emerald-600/10 rounded-full blur-[100px] pointer-events-none"></div>

      {/* Premium Elegant Navigation */}
      <header className="bg-slate-950/40 backdrop-blur-xl border-b border-white/10 sticky top-0 z-40 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center text-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-indigo-500 to-emerald-400 rounded-xl text-white shadow-lg shadow-indigo-500/20">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-200 flex items-center gap-2">
                AI 數據分析與洞察工具
                <span className="text-[10px] bg-white/10 border border-white/15 text-indigo-300 font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  v3.5 Flash
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block mt-0.5">
                快速上載、一鍵解析。提供數據表格即時預覽與 Gemini 企業級深度洞察報告。
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-300 bg-white/5 border border-white/10 px-2.5 py-1 rounded-md font-mono hidden md:inline-flex items-center gap-1.5 backdrop-blur-md">
              <span className={`w-2.5 h-2.5 rounded-full ${apiKey ? "bg-emerald-400 animate-pulse" : "bg-rose-450 animate-pulse"}`}></span>
              API 狀態：{apiKey ? "已配置" : "未設定密鑰"}
            </span>
            <button
              onClick={() => {
                setTempApiKey(apiKey);
                setShowSettings(true);
              }}
              className="p-2 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 backdrop-blur-md shadow-md"
              title="設定 Gemini API 密鑰"
            >
              <Settings className="h-4 w-4" />
              <span className="text-xs font-semibold hidden sm:inline">設定密鑰</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col gap-6 z-10">

        {/* Dynamic Metric overview widget */}
        <AnimatePresence>
          {parsedData.rows.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg"
            >
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-indigo-500/10 text-indigo-300 rounded-lg border border-indigo-500/10">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">原始數據列數</div>
                  <div className="text-lg font-bold text-white font-mono">{quickStats.rows} 筆</div>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-blue-500/10 text-blue-300 rounded-lg border border-blue-500/10">
                  <Table className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">數據欄位數量</div>
                  <div className="text-lg font-bold text-white font-mono">{quickStats.cols} 個</div>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-yellow-500/10 text-yellow-300 rounded-lg border border-yellow-500/10">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">空白或缺項</div>
                  <div className="text-lg font-bold text-white font-mono">{quickStats.blankCells} 個</div>
                </div>
              </div>
              <div className="flex items-center gap-3.5">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-300 rounded-lg border border-emerald-500/10">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">數據結構檢測</div>
                  <div className="text-base font-bold text-emerald-450 font-display">良好符合</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Global Error Alert Banner */}
        <AnimatePresence>
          {errorMsg && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-rose-950/40 backdrop-blur-md border border-rose-500/30 p-4 rounded-xl flex items-start gap-3 shadow-lg"
            >
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-rose-200 text-sm">數據分析檢測到異常</h3>
                <p className="text-rose-350 text-xs mt-1 leading-relaxed">{errorMsg}</p>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="text-rose-400 hover:text-rose-200 shrink-0 p-1"
                title="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Layout Grid: 12-columns bento layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* LEFT COMPONENT: PASTING PANEL & INPUT PRESETS [Span 5] */}
          <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-5">
            
            {/* Template Presets Panel */}
            <div className="bg-white/5 backdrop-blur-md p-5 rounded-2xl border border-white/10 shadow-xl transition-all">
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-xs font-semibold text-slate-200 tracking-tight flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  快速測試：帶入日常數據範本
                </h2>
                <span className="text-[10px] text-slate-500">點擊即載入</span>
              </div>
              
              <div className="flex flex-col gap-2.5">
                {CSV_TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => applyTemplate(tmpl)}
                    className="group w-full flex items-start gap-3 p-3 rounded-xl border border-white/5 hover:border-white/15 bg-white/5 hover:bg-white/10 text-left transition-all cursor-pointer"
                  >
                    <span className="text-xl shrink-0 mt-0.5">{tmpl.emoji}</span>
                    <div className="flex-1">
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-indigo-300 transition-colors flex items-center gap-1">
                        {tmpl.name}
                        <ChevronRight className="w-3 h-3 text-slate-500 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {tmpl.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Main Textarea Form Area */}
            <div className="bg-white/10 backdrop-blur-md p-5 rounded-2xl border border-white/10 shadow-xl transition-all flex flex-col gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 tracking-tight flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-400" />
                  步驟 1: 貼上您的 CSV 格式數據
                </h2>
                <p className="text-xs text-slate-450 mt-1 leading-relaxed">
                  請將您欲分析的 Excel 報表匯出成 CSV 後貼至下方。首行需包含各欄位標題。
                </p>
              </div>

              {/* Text Area Frame container */}
              <div className="relative">
                <textarea
                  value={csvInput}
                  onChange={(e) => {
                    setCsvInput(e.target.value);
                    setPreviewPage(0);
                  }}
                  placeholder="請在此處貼上 CSV 數據...\n範例：\n日期,產品名稱,銷售數量,單價(TWD)\n2026/01/10,高階降噪耳機,5,5100"
                  rows={9}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-xs font-mono text-slate-200 placeholder:text-slate-600 outline-none focus:border-indigo-505/40 resize-y leading-relaxed transition-all scrollbar-thin shadow-inner"
                />
                
                {csvInput && (
                  <button
                    onClick={() => {
                      setCsvInput("");
                      setSearchQuery("");
                      setPreviewPage(0);
                    }}
                    className="absolute right-3.5 bottom-3.5 p-1.5 bg-white/10 border border-white/10 hover:bg-rose-950/50 hover:text-rose-400 hover:border-rose-500/30 rounded-lg text-slate-400 transition-colors shadow-xs"
                    title="清空重新貼上"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Configurations Form Area */}
              <div className="border-t border-white/10 pt-4 flex flex-col gap-4">
                
                {/* Mode Selector Option */}
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                    步驟 2: 選擇分析強調主軸
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { key: "general", label: "綜合核心診斷" },
                      { key: "trends", label: "趨勢預測與規律" },
                      { key: "anomalies", label: "異常診斷與風險" },
                      { key: "actionable", label: "優化行動與建議" }
                    ].map((type) => (
                      <button
                        key={type.key}
                        type="button"
                        onClick={() => setAnalysisType(type.key)}
                        className={`py-2 px-3 rounded-lg border text-xs font-medium text-center transition-all cursor-pointer ${
                          analysisType === type.key
                            ? "bg-white/15 text-white border-white/30 shadow-xs backdrop-blur-md font-semibold"
                            : "bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Optional specific concern objective */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
                      步驟 3: 自訂特殊關注目標 / 提問 (選填)
                    </label>
                    <span className="text-[10px] text-slate-500">更精解讀</span>
                  </div>
                  <input
                    type="text"
                    value={customGoal}
                    onChange={(e) => setCustomGoal(e.target.value)}
                    placeholder="例如：哪些客戶回報率低；或我想診斷銷售漏斗弱點..."
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-slate-200 placeholder:text-slate-650 outline-none focus:border-indigo-500/50 transition-all shadow-inner"
                  />
                </div>

                {/* Glass style Big Action Button */}
                <button
                  onClick={handleAnalyze}
                  disabled={loading}
                  className={`w-full py-4 px-4 rounded-xl font-bold text-sm tracking-wide shadow-lg shadow-indigo-500/10 transition-all flex items-center justify-center gap-3 cursor-pointer ${
                    loading
                      ? "bg-indigo-500/5 text-slate-400 border border-indigo-500/10 cursor-not-allowed"
                      : "bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white shadow-lg hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-px"
                  }`}
                >
                  {loading ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      正在執行深度 AI 數據分析...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4.5 h-4.5 text-emerald-300 animate-pulse" />
                      開始 AI 智能分析報告
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>

          {/* RIGHT COMPONENT: OUTPUT PORTALS (Tab layout for Report & Preview Data) [Span 7] */}
          <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-4">
            
            {/* Tab header is translucent Glass */}
            <div className="flex bg-white/5 border border-white/10 p-1 rounded-xl items-center self-start backdrop-blur-md">
              <button
                onClick={() => setActiveTab("analysis")}
                className={`py-2 px-5 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === "analysis"
                    ? "bg-white/10 text-white shadow-sm border border-white/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${activeTab === "analysis" ? "text-indigo-400" : "text-slate-500"}`} />
                AI 數據分析與洞察報告
              </button>
              <button
                onClick={() => setActiveTab("preview")}
                className={`py-2 px-5 rounded-lg text-xs font-semibold tracking-wide flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === "preview"
                    ? "bg-white/10 text-white shadow-sm border border-white/10"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Table className={`w-3.5 h-3.5 ${activeTab === "preview" ? "text-indigo-400" : "text-slate-500"}`} />
                原始數據預覽 {parsedData.rows.length > 0 && `(${parsedData.rows.length} 筆)`}
              </button>
            </div>

            {/* TAB CONTENT: AI ANALYSIS REPORT with Frosted look */}
            {activeTab === "analysis" && (
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 min-h-[580px] shadow-2xl flex flex-col overflow-hidden relative">
                
                {/* Interactive visual header when report exists with transparent frosted bg */}
                {analysisReport && !loading && (
                  <div className="bg-white/5 border-b border-white/10 py-3.5 px-5 flex flex-wrap gap-2 justify-between items-center z-10 shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-emerald-450 animate-pulse" />
                      <span className="text-xs font-semibold text-slate-200">Gemini 報告已就緒</span>
                    </div>
                    
                    <div className="flex items-center gap-2.5">
                      <button
                        onClick={handleCopyReport}
                        className="py-1.5 px-3 bg-white/10 hover:bg-white/20 text-xs font-medium text-slate-200 border border-white/10 rounded-lg flex items-center gap-1.5 hover:shadow-xs active:bg-white/5 transition-all cursor-pointer"
                      >
                        {copied ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-455" />
                            已複製！
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 text-slate-400" />
                            複製報告
                          </>
                        )}
                      </button>
                      <button
                        onClick={handleDownloadReport}
                        className="py-1.5 px-3 bg-indigo-550/20 hover:bg-indigo-500/30 text-xs font-medium text-indigo-200 border border-indigo-500/30 rounded-lg flex items-center gap-1.5 active:bg-indigo-500/10 transition-all cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-indigo-400" />
                        下載報告 (.md)
                      </button>
                    </div>
                  </div>
                )}

                {/* Dashboard Inner Core */}
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                  
                  {/* Empty Slate Initial Stage */}
                  {!analysisReport && !loading && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 my-auto min-h-[480px]">
                      <div className="w-16 h-16 bg-white/5 text-indigo-455 rounded-2xl flex items-center justify-center mb-4 border border-white/10 shadow-lg">
                        <Sparkles className="w-7 h-7" />
                      </div>
                      <h3 className="text-white font-bold text-base">等待數據分析優化啟動</h3>
                      <p className="text-slate-400 text-xs max-w-sm mt-2 leading-relaxed">
                        您可以在左側貼上資料或點閱載入「銷售業績」或「行銷成效」等範本後，點選「開始 AI 分析」按鈕。AI 數據專家會立即為您挖掘出蘊藏的商業價值與風險警示。
                      </p>
                      
                      <div className="mt-8 p-3.5 bg-white/5 rounded-xl border border-dashed border-white/10 max-w-sm">
                        <div className="text-left text-[11px] text-slate-405 font-mono flex gap-2 items-start">
                          <span className="bg-indigo-500/20 border border-indigo-500/25 text-indigo-305 px-1.5 py-0.5 rounded text-[10px] uppercase font-bold shrink-0">焦點</span>
                          <span className="leading-relaxed">支援統計匯算、異常挖掘、轉換漏斗分析、退貨/流失率檢索與營運建議。</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* LOADING ACTIVE STATE */}
                  {loading && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8 my-auto min-h-[480px]">
                      
                      {/* Interactive Visual Gear Loader animation */}
                      <div className="relative mb-6">
                        <div className="w-12 h-12 rounded-full border-4 border-white/5 border-t-indigo-500 animate-spin" />
                        <Sparkles className="w-5 h-5 text-indigo-400 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 animate-bounce" />
                      </div>

                      <h4 className="text-white font-semibold text-sm tracking-wide">
                        Gemini AI 大數據引擎正在作業
                      </h4>
                      
                      {/* Steps Status indicators */}
                      <div className="max-w-xs mt-3 flex flex-col gap-1.5 items-center">
                        <p className="text-xs text-indigo-305 bg-white/5 font-medium px-4 py-2 rounded-full border border-white/10 animate-pulse text-center">
                          {loadingStep || "正在讀取數據特徵欄位..."}
                        </p>
                        <span className="text-[10px] text-slate-500 mt-1">本程序約耗時 3 至 8 秒，請勿重新整理網頁。</span>
                      </div>
                    </div>
                  )}

                  {/* FINAL ANALYSIS OUTPUT RENDERER */}
                  {analysisReport && !loading && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="markdown-body text-slate-200 text-xs leading-relaxed space-y-4"
                    >
                      <Markdown
                        components={{
                          h1: ({node, ...props}) => <h1 className="text-md font-bold text-indigo-300 border-b border-white/10 pb-2 mt-6 mb-3 font-display flex items-center gap-2" {...props} />,
                          h2: ({node, ...props}) => <h2 className="text-sm font-semibold text-white mt-5 mb-2 font-display" {...props} />,
                          h3: ({node, ...props}) => <h3 className="text-xs font-semibold text-indigo-200 mt-4 mb-1 font-sans" {...props} />,
                          p: ({node, ...props}) => <p className="text-slate-350 mb-3 leading-relaxed" {...props} />,
                          ul: ({node, ...props}) => <ul className="list-disc pl-5 space-y-1.5 mb-4 text-slate-350" {...props} />,
                          ol: ({node, ...props}) => <ol className="list-decimal pl-5 space-y-1.5 mb-4 text-slate-350" {...props} />,
                          li: ({node, ...props}) => <li className="pl-0.5" {...props} />,
                          blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-500 bg-white/5 text-slate-300 px-4 py-2 my-4 rounded-r-lg italic" {...props} />,
                          table: ({node, ...props}) => (
                            <div className="overflow-x-auto my-5 rounded-xl border border-white/10 shadow-lg bg-black/20">
                              <table className="w-full text-left border-collapse text-[11px]" {...props} />
                            </div>
                          ),
                          thead: ({node, ...props}) => <thead className="bg-white/10 text-slate-200 font-semibold" {...props} />,
                          tbody: ({node, ...props}) => <tbody className="divide-y divide-white/5" {...props} />,
                          th: ({node, ...props}) => <th className="p-2.5 border-b border-white/10 text-slate-100" {...props} />,
                          td: ({node, ...props}) => <td className="p-2.5 text-slate-300 font-sans" {...props} />,
                          code: ({node, ...props}) => <code className="bg-white/10 font-mono px-1.5 py-0.5 rounded text-indigo-300" {...props} />
                        }}
                      >
                        {analysisReport}
                      </Markdown>
                    </motion.div>
                  )}

                </div>
              </div>
            )}

            {/* TAB CONTENT: RAW DATA PREVIEW MATRIX TABLE */}
            {activeTab === "preview" && (
              <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 min-h-[580px] shadow-2xl flex flex-col overflow-hidden">
                
                {parsedData.headers.length > 0 ? (
                  <>
                    {/* Filter and stats tool headers */}
                    <div className="bg-white/5 border-b border-white/10 p-4 shrink-0 flex flex-col sm:flex-row gap-3 items-center justify-between">
                      <div className="flex items-center gap-2 w-full sm:w-auto">
                        <span className="text-xs text-slate-400 font-medium whitespace-nowrap">模糊搜尋篩選</span>
                        <div className="relative w-full sm:w-60">
                          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 transform -translate-y-1/2" />
                          <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => {
                              setSearchQuery(e.target.value);
                              setPreviewPage(0);
                            }}
                            placeholder="輸入產品/日期/渠道關鍵字..."
                            className="bg-black/30 text-white w-full text-xs pl-8.5 pr-8 py-1.5 rounded-lg border border-white/10 outline-none focus:border-indigo-500/50 transition-all font-mono"
                          />
                          {searchQuery && (
                            <button
                              onClick={() => setSearchQuery("")}
                              className="absolute right-2.5 top-1/2 transform -translate-y-1/2 text-slate-500 hover:text-slate-300 p-0.5 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Summary statistics indicator */}
                      <div className="text-[11px] text-indigo-300 whitespace-nowrap bg-indigo-550/15 border border-indigo-500/20 font-semibold px-2.5 py-1 rounded-md">
                        已篩選過濾： {filteredRows.length} / {parsedData.rows.length} 筆
                      </div>
                    </div>

                    {/* Interactive table box */}
                    <div className="flex-1 overflow-auto">
                      <div className="min-w-full">
                        <table className="w-full text-[11px] text-left border-collapse">
                          <thead className="bg-[#020617]/50 text-slate-300 font-semibold border-b border-white/10 sticky top-0 font-display">
                            <tr>
                              <th className="p-3 border-r border-white/5 text-center w-12 bg-white/5 text-slate-400 font-mono">編號</th>
                              {parsedData.headers.map((header, idx) => (
                                <th key={idx} className="p-3 border-b border-white/10 whitespace-nowrap text-slate-200 border-r border-white/5 truncate max-w-[150px]">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {paginatedRows.length > 0 ? (
                              paginatedRows.map((row, rIdx) => (
                                <tr key={rIdx} className="hover:bg-white/5 transition-colors">
                                  <td className="p-2.5 bg-white/5 text-center border-r border-white/5 text-slate-400 font-mono font-medium">
                                    {previewPage * ROWS_PER_PAGE + rIdx + 1}
                                  </td>
                                  {parsedData.headers.map((_, cIdx) => (
                                    <td key={cIdx} className="p-2.5 whitespace-nowrap text-slate-300 max-w-xs overflow-hidden text-ellipsis border-r border-white/5 font-mono">
                                      {row[cIdx] !== undefined ? row[cIdx] : <span className="text-slate-600">-</span>}
                                    </td>
                                  ))}
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={parsedData.headers.length + 1} className="text-center p-12 text-slate-500 text-xs">
                                  找不到匹配「<span className="font-semibold text-indigo-400">{searchQuery}</span>」的數據列格。
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Pagination components */}
                    {totalPages > 1 && (
                      <div className="bg-white/5 border-t border-white/10 px-4 py-3 shrink-0 flex items-center justify-between gap-2">
                        <span className="text-slate-400 text-[10px]">
                          現在顯示：{previewPage * ROWS_PER_PAGE + 1} 至 {Math.min((previewPage + 1) * ROWS_PER_PAGE, filteredRows.length)} 筆（共 {filteredRows.length} 筆）
                        </span>
                        
                        <div className="flex gap-1.5">
                          <button
                            disabled={previewPage === 0}
                            onClick={() => setPreviewPage(p => Math.max(0, p - 1))}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                              previewPage === 0
                                ? "bg-white/5 border-white/5 text-slate-600 cursor-not-allowed"
                                : "bg-white/10 border-white/10 text-slate-200 hover:bg-white/20 active:bg-white/15"
                            }`}
                          >
                            上一頁
                          </button>
                          
                          <div className="flex gap-1">
                            {Array.from({ length: totalPages }).map((_, idx) => (
                              <button
                                key={idx}
                                onClick={() => setPreviewPage(idx)}
                                className={`w-6 h-6 rounded-md text-[10px] font-mono leading-6 cursor-pointer ${
                                  previewPage === idx
                                    ? "bg-indigo-600 text-white font-bold animate-pulse"
                                    : "bg-white/10 border border-white/10 text-slate-300 hover:bg-white/20"
                                }`}
                              >
                                {idx + 1}
                              </button>
                            ))}
                          </div>

                          <button
                            disabled={previewPage === totalPages - 1}
                            onClick={() => setPreviewPage(p => Math.min(totalPages - 1, p + 1))}
                            className={`px-3 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${
                              previewPage === totalPages - 1
                                ? "bg-white/5 border-white/5 text-slate-600 cursor-not-allowed"
                                : "bg-white/10 border-white/10 text-slate-200 hover:bg-white/20 active:bg-white/15"
                            }`}
                          >
                            下一頁
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 my-auto min-h-[480px]">
                    <div className="w-16 h-16 bg-white/5 text-slate-400 rounded-2xl flex items-center justify-center mb-4 border border-white/10 shadow-xs">
                      <Table className="w-7 h-7" />
                    </div>
                    <h3 className="text-white font-bold text-base">暫無數據預覽</h3>
                    <p className="text-slate-400 text-xs max-w-sm mt-1 leading-relaxed">
                      請在左半邊貼上您需要預覽和分析的 CSV 資料，表格預覽系統將在貼上後即時繪製數據行列。
                    </p>
                  </div>
                )}

              </div>
            )}

          </div>

        </div>

        {/* Dynamic usage insights alert footer */}
        <footer className="mt-8 border-t border-white/10 pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-slate-500 gap-4 mb-4 font-sans">
          <div>
            © 2026 AI 數據分析與洞察工具 · 基於 Google Gemini 深度優化
          </div>
          <div className="flex gap-4 items-center font-mono text-[10px]">
            <span>前端架構：React + Vite + Tailwind CSS</span>
            <span>運行環境：Google AI Studio Client Mode</span>
          </div>
        </footer>

      </main>

      {/* Glassmorphic Settings Modal */}
      <AnimatePresence>
        {showSettings && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-slate-900/90 border border-white/15 p-6 rounded-2xl shadow-2xl flex flex-col gap-4 relative overflow-hidden text-slate-100 font-sans"
            >
              {/* Mesh background inside modal */}
              <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] bg-indigo-650/10 rounded-full blur-[80px] pointer-events-none"></div>
              
              <div className="flex justify-between items-center z-10">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400 animate-spin-slow" />
                  設定 Gemini API 密鑰
                </h3>
                <button
                  onClick={() => setShowSettings(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs text-slate-300 leading-relaxed z-10 space-y-1">
                <p>請輸入您的 Google AI Studio API Key。本金鑰僅儲存於您的本機瀏覽器（LocalStorage）中，直接向 Google Gemini 發送請求，安全無虞。</p>
                <a 
                  href="https://aistudio.google.com/app/apikey" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-indigo-400 hover:text-indigo-300 hover:underline font-semibold inline-flex items-center gap-1 mt-1"
                >
                  前往 Google AI Studio 獲取免費的 API Key <ChevronRight className="w-3 h-3" />
                </a>
              </div>

              <div className="relative z-10">
                <input
                  type={showPassword ? "text" : "password"}
                  value={tempApiKey}
                  onChange={(e) => setTempApiKey(e.target.value)}
                  placeholder="請在此貼上您的 API Key (AIzaSy...)"
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3.5 pr-11 text-xs font-mono text-slate-200 placeholder:text-slate-650 outline-none focus:border-indigo-505/40 transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-200 p-1 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <div className="flex gap-3 justify-end mt-2 z-10">
                <button
                  onClick={() => {
                    setTempApiKey("");
                  }}
                  className="py-2 px-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 text-xs text-slate-300 font-semibold cursor-pointer transition-all"
                >
                  清除輸入
                </button>
                <button
                  onClick={() => {
                    setApiKey(tempApiKey);
                    localStorage.setItem("GEMINI_API_KEY", tempApiKey.trim());
                    setShowSettings(false);
                  }}
                  className="py-2 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs text-white font-bold cursor-pointer transition-all shadow-md shadow-indigo-600/25"
                >
                  儲存設定
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
