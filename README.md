# 公托經費記帳

四間公托共用的經費記帳網頁：發票、支出憑證粘存單、零用金結報、月費收據、人事費和年度報表。

- 網址：https://kenchen0728.github.io/gongtuo-fund/
- 範例資料（不會存檔）：https://kenchen0728.github.io/gongtuo-fund/?demo

## 登入
每間公托一組序號，序號由管理者保管，**不要放進這個公開的 repository**。
序號去掉「-」、轉小寫後，就是 Firebase 帳號 `<序號>@gongtuo-fund.firebaseapp.com` 的帳號和密碼。

## 換序號
1. Firebase → Authentication → 新增使用者（新序號）。
2. Firestore → members → 新增文件：ID＝新帳號電子郵件，欄位 `nursery`＝公托代號。
3. 刪掉舊帳號和舊的 members 文件。用舊序號的裝置最晚一小時內登出。

公托代號：wandan（萬丹）、yuying（育英）、gongzheng（公正）、shoutian（壽天）。

## 檔案
| 檔案 | 用途 |
|---|---|
| index.html | 畫面骨架和對話框 |
| style.css | 樣式（沿用交辦本的配色） |
| app.js | 畫面和流程 |
| data.js | 資料層：Firebase 正式模式、範例模式 |
| sample.js | 範例資料（全部虛構） |
| sw.js | 離線開啟與更新 |
| help/ | 使用說明的畫面截圖（範例資料） |
| tools/help_shots.py | 重新產生說明截圖：先在專案資料夾開 `python3 -m http.server 8765`，再執行這支 |

## 資料結構（Firestore）
- `members/{帳號電子郵件}`：`nursery`
- `nurseries/{公托代號}`：設定（公托資料、員工、預算、類別、收據號碼）
- `nurseries/{代號}/invoices`、`vouchers`、`settlements`、`kids`、`months`、`incomes`

存取規則在 Firebase 主控台，每間公托只讀寫得到自己的資料。

## 退回上一版
每次較大的修改前會留一個備份分支，名稱是 `backup-<版本號>`（例如 `backup-2026.11.17.4`）。
要退回時：GitHub → 這個 repository → Commits，找到要退回的版本按「Revert」；或把 main 重設到備份分支，或請 Claude 協助。

## 資料還原
設定 → 備份 →「從備份還原」。只能還原同一間公托的備份；還原前會先自動下載目前資料。備份裡有的資料改回備份當時的內容，之後新增的資料保留。

## 注意
- 不要把序號、真實名單或任何個資放進這個 repository。
- 改版時要同時更新 `app.js` 的 `VERSION` 和 `sw.js` 的 `CACHE`。
