# 有界實作計畫
1. 沿既有 AccessController 增加注入式 lease storage／clock；先真控制器紅測，再實作 14 天持久授權與競態／撤權／失敗處理。
2. AuthGate 不因正常背景查核／離線／更新重掛 CAD；顯示期限及 SW readiness；SW 查完整 cache 回報，不快取身份 API。
3. 沿 tests/mockBackend + vite.mock.config 建立隔離 headless 產物，實測實際 DXF 與 SW。更新 README／隱私文字。
4. 全套回歸與 production build；保存 baseline SHA、紅綠 log、headless JSON 與精確修改清單。不發布。
