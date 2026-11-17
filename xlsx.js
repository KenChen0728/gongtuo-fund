// 不靠外部套件的 Excel（.xlsx）讀寫：只做本程式需要的部分
// 寫：儲存格值、公式（附算好的值）、字型、底色、框線、數字格式、合併、欄寬列高、A4 橫式一頁
// 讀：找指定名稱的工作表，回傳 { 'D3': 值 }（公式取 Excel 存下來的結果）

/* ===== zip ===== */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } return t })();
const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0 };
function zip(files) {            // files: [{name, data: string}]，不壓縮（STORE）
  const enc = new TextEncoder(), parts = [], cen = []; let off = 0;
  for (const f of files) {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    parts.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    cen.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cenSize = cen.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cenSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(e.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
async function unzip(buf) {      // 回傳 { 檔名: 文字 }
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let eo = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eo = i; break }
  if (eo < 0) throw new Error('notzip');
  const n = dv.getUint16(eo + 10, true); let p = dv.getUint32(eo + 16, true); const out = {}, dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
    if (!/\.(xml|rels)$/.test(name)) continue;
    const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(start, start + csize);
    let data = raw;
    if (method === 8) data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else if (method !== 0) continue;
    out[name] = dec.decode(data);
  }
  return out;
}

/* ===== 寫 ===== */
const xe = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const colName = i => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26) } return s };
// sheet: { name, cols:[寬], rows:{列號:高}, cells:{ 'A1': {v, f, s:{fill, fmt, bold, color, align, wrap, border}} }, merges:['A1:Q1'], landscape }
// sheet 可以是一張，或好幾張的陣列（例如四間公托各一張）
export function writeXlsx(sheetOrList) {
  const list = Array.isArray(sheetOrList) ? sheetOrList : [sheetOrList];
  const fonts = [], fills = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'], xfs = [], fmts = [], keyOf = {};
  const fontId = (bold, color) => { const k = `<font>${bold ? '<b/>' : ''}<sz val="12"/>${color ? `<color rgb="FF${color}"/>` : ''}<name val="標楷體"/><family val="3"/><charset val="136"/></font>`; let i = fonts.indexOf(k); if (i < 0) { fonts.push(k); i = fonts.length - 1 } return i };
  fontId(false, '');
  const fillId = c => { if (!c) return 0; const k = `<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`; let i = fills.indexOf(k); if (i < 0) { fills.push(k); i = fills.length - 1 } return i };
  const fmtId = f => { if (!f) return 0; if (f === '0%') return 9; let i = fmts.indexOf(f); if (i < 0) { fmts.push(f); i = fmts.length - 1 } return 164 + i };
  const xf = s => {
    s = s || {}; const k = JSON.stringify([s.fill, s.fmt, s.bold, s.color, s.align, s.wrap, s.border]);
    if (keyOf[k] != null) return keyOf[k];
    const a = `<alignment horizontal="${s.align || 'center'}" vertical="center"${s.wrap ? ' wrapText="1"' : ''}/>`;
    xfs.push(`<xf numFmtId="${fmtId(s.fmt)}" fontId="${fontId(s.bold, s.color)}" fillId="${fillId(s.fill)}" borderId="${s.border === false ? 0 : 1}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">${a}</xf>`);
    return keyOf[k] = xfs.length - 1;
  };
  xf({ border: false });          // 第 0 個：沒有框線的預設
  const sheetXml = sheet => {
  const byRow = {};
  for (const [ref, c] of Object.entries(sheet.cells)) { const m = /^([A-Z]+)(\d+)$/.exec(ref); (byRow[+m[2]] ||= []).push([m[1], c, ref]) }
  const colIdx = l => [...l].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
  let rowsXml = '';
  for (const r of Object.keys({ ...byRow, ...(sheet.rows || {}) }).map(Number).sort((a, b) => a - b)) {
    const cs = (byRow[r] || []).sort((a, b) => colIdx(a[0]) - colIdx(b[0]));
    const ht = (sheet.rows || {})[r];
    rowsXml += `<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>` + cs.map(([, c, ref]) => {
      const s = xf(c.s);
      if (c.f) return `<c r="${ref}" s="${s}"><f>${xe(c.f)}</f>${typeof c.v === 'number' ? `<v>${c.v}</v>` : ''}</c>`;
      if (typeof c.v === 'number') return `<c r="${ref}" s="${s}"><v>${c.v}</v></c>`;
      if (c.v == null || c.v === '') return `<c r="${ref}" s="${s}"/>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xe(c.v)}</t></is></c>`;
    }).join('') + '</row>';
  }
  const cols = (sheet.cols || []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const ws = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetFormatPr defaultRowHeight="16.5"/>${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rowsXml}</sheetData>${(sheet.merges || []).length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}<printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="${sheet.landscape ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="1"/></worksheet>`;
  return ws;
  };
  const wss = list.map(sheetXml);
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fmts.length ? `<numFmts count="${fmts.length}">${fmts.map((f, i) => `<numFmt numFmtId="${164 + i}" formatCode="${xe(f)}"/>`).join('')}</numFmts>` : ''}<fonts count="${fonts.length}">${fonts.join('')}</fonts><fills count="${fills.length}">${fills.join('')}</fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return zip([
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${wss.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((sh, i) => `<sheet name="${xe(sh.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${wss.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${wss.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
    ...wss.map((ws, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: ws })),
  ]);
}

/* ===== 讀 ===== */
export async function readXlsx(buf, prefer) {
  const z = await unzip(buf), P = new DOMParser();
  const doc = n => z[n] ? P.parseFromString(z[n], 'application/xml') : null;
  const wb = doc('xl/workbook.xml'); if (!wb) throw new Error('notxlsx');
  const rels = doc('xl/_rels/workbook.xml.rels'), relMap = {};
  for (const r of rels.getElementsByTagName('Relationship')) relMap[r.getAttribute('Id')] = r.getAttribute('Target');
  const sheets = [...wb.getElementsByTagName('sheet')].map(s => ({ name: s.getAttribute('name'), rid: s.getAttribute('r:id') || s.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id') }));
  const pick = sheets.find(s => s.name === prefer) || sheets[0];
  let target = relMap[pick.rid] || ''; target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
  const ss = doc('xl/sharedStrings.xml'), strs = ss ? [...ss.getElementsByTagName('si')].map(si => [...si.getElementsByTagName('t')].map(t => t.textContent).join('')) : [];
  const sh = doc(target), cells = {};
  for (const c of sh.getElementsByTagName('c')) {
    const t = c.getAttribute('t'), vEl = c.getElementsByTagName('v')[0], v = vEl ? vEl.textContent : null;
    let val = null;
    if (t === 's') val = v == null ? null : strs[+v];
    else if (t === 'inlineStr') val = [...c.getElementsByTagName('t')].map(x => x.textContent).join('');
    else if (t === 'str' || t === 'e') val = v;
    else if (t === 'b') val = v === '1';
    else if (v != null && v !== '') val = Number(v);
    if (val !== null && val !== '') cells[c.getAttribute('r')] = val;
  }
  return { sheet: pick.name, sheets: sheets.map(s => s.name), cells };
}
