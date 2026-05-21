<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/1a6edde9-5a5e-40fb-bb02-0b246c56b096

## 本地運行與配置說明

此專案已完全遷移至 **Google AI Studio 客戶端模式** (Pure Client-Side React SPA)。應用程式直接在瀏覽器端使用官方 `@google/genai` SDK 與 Gemini 3.5 進行互動，去除了繁瑣的後端伺服器架構，大幅提升加載效能。

### ⚙️ 快速運行步驟

1. **安裝依賴套件**：
   ```bash
   npm install
   ```

2. **配置 Gemini API Key** (二選一)：
   - **方式 A (推薦，最便利)**：本地啟動後，直接點擊右上角的「**設定密鑰**」齒輪按鈕貼上 API 密鑰即可。此密鑰將安全儲存在瀏覽器的 `localStorage` 中。
   - **方式 B (環境變數)**：在專案根目錄建立 `.env.local` 檔案並填入：
     ```env
     VITE_GEMINI_API_KEY="您的_GEMINI_API_KEY"
     ```

3. **啟動 Vite 開發伺服器**：
   ```bash
   npm run dev
   ```

4. **生產環境打包編譯**：
   ```bash
   npm run build
   ```
   打包完成後的靜態資源將生成於 `dist/` 目錄，可一鍵部署至任何靜態託管平台。
