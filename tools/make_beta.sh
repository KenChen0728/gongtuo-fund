#!/bin/sh
# 產生 beta/ 預覽版：只用範例資料（虛構名字、不連資料庫、不存檔），給 Hedy 看新功能。
# 用法：在專案資料夾執行 sh tools/make_beta.sh；正式上線後刪掉 beta/ 資料夾。
set -e
rm -rf beta && mkdir -p beta/icons
cp index.html style.css app.js data.js sample.js xlsx.js beta/
cp icons/icon-192.png icons/icon-180.png beta/icons/
cp -r help beta/help
# 一律範例模式、不註冊 service worker、不能回到登入
sed -i "s/const demo = new URLSearchParams(location.search).has('demo') || sessionStorage.getItem('gongtuo.demo') === '1';/const demo = true;/" beta/app.js
sed -i "s/const DEMO_ONLY = location.protocol === 'file:';/const DEMO_ONLY = true;/" beta/app.js
sed -i "s/const VERSION = '\([^']*\)';/const VERSION = '\1 預覽版';/" beta/app.js
grep -q "const demo = true;" beta/app.js && grep -q "const DEMO_ONLY = true;" beta/app.js
sed -i 's#<link rel="manifest" href="manifest.webmanifest">##' beta/index.html
sed -i 's#範例資料模式：裡面都是虛構的資料，修改不會存下來。<button type="button" class="btn" id="leaveDemo" style="margin-left:8px">回到登入</button>#預覽版：試用新功能，裡面都是虛構的資料，修改不會存下來，也不影響正式版。<button type="button" class="btn" id="leaveDemo" hidden>回到登入</button>#' beta/index.html
grep -q "預覽版：試用新功能" beta/index.html
echo "beta/ 已產生"
