<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AI 數據分析與洞察工具

基於 Google Gemini 3.5 Flash 的 CSV 數據深度分析工具。提供趨勢分析、異常偵測與改善建議，一鍵獲取繁體中文專業洞察報告。

## 架構說明

此專案採用 **Netlify Functions 後端代理架構**：

- **前端**：React + Vite + Tailwind CSS v4（純靜態 SPA）
- **後端**：Netlify Serverless Functions（代理 Gemini API 呼叫）
- **安全性**：API Key 僅存於伺服器端環境變數，不暴露給前端

## 本地開發

### ⚙️ 快速運行步驟

1. **安裝依賴套件**：
   ```bash
   npm install
   ```

2. **配置 Gemini API Key**：
   在專案根目錄建立 `.env` 檔案並填入：
   ```env
   GEMINI_API_KEY="您的_GEMINI_API_KEY"
   ```

3. **啟動本地開發伺服器（含 Netlify Functions）**：
   ```bash
   npx netlify dev
   ```
   > 這會同時啟動 Vite 前端開發伺服器與 Netlify Functions 本地模擬器。

4. **僅打包前端靜態資源**：
   ```bash
   npm run build
   ```

## 部署至 Netlify

### 方式 A：Git 連結部署（推薦）
1. 將此專案推送至 GitHub/GitLab
2. 在 [Netlify Dashboard](https://app.netlify.com) 中連結您的 Git 倉庫
3. Netlify 會自動偵測 `netlify.toml` 進行建置與部署
4. 在 **Site Settings > Environment Variables** 中新增：
   - `GEMINI_API_KEY` = 您的 Google Gemini API Key

### 方式 B：Netlify CLI 手動部署
```bash
npx netlify deploy --prod
```

## 環境變數說明

| 變數名稱 | 用途 | 設定位置 |
|---------|------|---------|
| `GEMINI_API_KEY` | Gemini AI API 金鑰（僅伺服器端使用） | Netlify Dashboard 或 `.env` |
