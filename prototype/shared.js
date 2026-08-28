/* ============================================================
   shared.js — デモ画面4本（admin / lab / clinic / station）の共通部品

   ★方針
   - 外部ライブラリは使わない。file:// と GitHub Pages の両方で動くこと。
   - ここに置くのは「どの画面でも同じ振る舞いをするもの」だけ。
     業務ロジック（案件・料金の算定など）は各画面のファイルに置く。
   - 本実装（Next.js + TypeScript）へ移すときに、そのまま
     lib/brand.ts / lib/csv.ts に対応させられる粒度で切っている。

   使い方：<script src="shared.js"></script> を <script> より先に置く。
   ============================================================ */
(function(global){
'use strict';

const DL = {};

/* ============================================================
   1. 小物
   ============================================================ */
DL.esc = s => String(s ?? '').replace(/[&<>"]/g, m =>
  ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
DL.yen = n => '¥' + Math.round(n || 0).toLocaleString();
DL.pct = n => (Math.round(n * 10) / 10) + '%';
DL.digits = t => String(t || '').replace(/[^0-9]/g, '');
DL.pad = (n, w) => String(n).padStart(w, '0');

/* デモの「今日」。実データではないので固定しておく（画面間で日付がズレないように） */
DL.TODAY = '2026-08-15';

/* localStorage は file:// でも使えるが、環境によっては例外を投げる。
   落ちるとデモ全体が止まるので必ず包む。 */
DL.store = {
  get(k, fallback){
    try{ const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  },
  set(k, v){
    try{ localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch(e){ return false; }
  },
  del(k){ try{ localStorage.removeItem(k); }catch(e){} }
};

/* ============================================================
   2. 色の計算

   テーマカラーを1色もらって、面・文字・境界に使う濃淡を作る。
   本実装でも同じ考え方（1色から派生させる）にすると、
   技工所が色を選ぶときに「3色決めてください」と言わずに済む。
   ============================================================ */
function hexToRgb(hex){
  const h = String(hex || '').replace('#','').trim();
  const s = h.length === 3 ? h.split('').map(c=>c+c).join('') : h;
  const n = parseInt(s.slice(0,6), 16);
  if(isNaN(n)) return {r:45,g:106,b:79};
  return {r:(n>>16)&255, g:(n>>8)&255, b:n&255};
}
const clamp = (v,a,b) => Math.min(b, Math.max(a, v));
function rgbToHex({r,g,b}){
  return '#' + [r,g,b].map(v => DL.pad(clamp(Math.round(v),0,255).toString(16),2)).join('');
}
function mix(hex, target, ratio){
  const c = hexToRgb(hex), t = hexToRgb(target);
  return rgbToHex({
    r: c.r + (t.r - c.r) * ratio,
    g: c.g + (t.g - c.g) * ratio,
    b: c.b + (t.b - c.b) * ratio
  });
}
DL.color = {
  darken : (hex, r=0.22) => mix(hex, '#000000', r),
  lighten: (hex, r=0.90) => mix(hex, '#ffffff', r),
  /* 背景色に対して読める文字色（白 or 濃色）を返す。W3C の相対輝度に近い簡易式 */
  onColor(hex){
    const {r,g,b} = hexToRgb(hex);
    const L = (0.299*r + 0.587*g + 0.114*b) / 255;
    return L > 0.62 ? '#1a1a24' : '#ffffff';
  },
  /* 文字色とのコントラスト比。4.5 未満なら警告を出す用 */
  contrast(a, b){
    const lum = hex => {
      const {r,g,b} = hexToRgb(hex);
      const f = v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
      return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
    };
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
  }
};

/* ============================================================
   3. ブランディング（ロゴ・テーマカラー）

   技工所ごと・医院ごとに設定できる。運営（admin）は自分の色を持ちつつ、
   代理ログイン時は相手の色になる、という運用を想定している。

   scope は 'lab:t1' / 'clinic:c1' / 'ops' のような文字列。
   ============================================================ */
DL.brand = {
  /* 選びやすさ優先で、実際に医院・技工所が使いそうな系統に絞ったプリセット */
  PRESETS: [
    {id:'green',  name:'グリーン（既定）', color:'#2d6a4f'},
    {id:'teal',   name:'ティール',        color:'#0f766e'},
    {id:'blue',   name:'ブルー',          color:'#1d4ed8'},
    {id:'navy',   name:'ネイビー',        color:'#14213d'},
    {id:'purple', name:'パープル',        color:'#5b21b6'},
    {id:'wine',   name:'ワイン',          color:'#9d174d'},
    {id:'orange', name:'オレンジ',        color:'#c2410c'},
    {id:'brown',  name:'ブラウン',        color:'#7f5539'},
    {id:'gray',   name:'グレー',          color:'#3f3f46'}
  ],

  /* ロゴは3種類に対応する。
     - mark : 文字（1〜3字）を四角に置く。何も用意がなくても成立するので既定にした
     - emoji: 絵文字。導入初期の「とりあえず」用
     - image: 画像（data URI で保持）。実装では Storage に置く */
  defaults(name){
    return {
      name : name || '',
      color: '#2d6a4f',
      logoType: 'mark',
      mark : (name || '＋').trim().slice(0,2),
      emoji: '🦷',
      image: null,          /* data URI */
      showName: true
    };
  },

  key(scope){ return 'dl.brand.' + scope; },

  load(scope, name){
    const d = this.defaults(name);
    const s = DL.store.get(this.key(scope), null);
    return s ? Object.assign(d, s) : d;
  },

  save(scope, b){
    const ok = DL.store.set(this.key(scope), b);
    if(!ok) console.warn('ブランド設定を保存できませんでした（保存領域の上限か、file:// の制限）');
    return ok;
  },

  reset(scope){ DL.store.del(this.key(scope)); },

  /* CSS 変数を差し替える。各画面の CSS が --primary 系だけを見ていれば
     これだけで全体の色が変わる。 */
  apply(b, root){
    const el = root || document.documentElement;
    const c = b.color || '#2d6a4f';
    el.style.setProperty('--primary',      c);
    el.style.setProperty('--primary-dark', DL.color.darken(c, 0.24));
    el.style.setProperty('--primary-soft', DL.color.lighten(c, 0.90));
    el.style.setProperty('--primary-on',   DL.color.onColor(c));
  },

  /* ヘッダーのロゴ部分の HTML。各画面で同じ見た目にする */
  logoHtml(b, cls){
    const k = cls || 'mk';
    if(b.logoType === 'image' && b.image)
      return `<span class="${k}" style="background:none;padding:0;overflow:hidden">
        <img src="${DL.esc(b.image)}" alt="" style="width:100%;height:100%;object-fit:contain"></span>`;
    if(b.logoType === 'emoji')
      return `<span class="${k}" style="background:${DL.esc(DL.color.lighten(b.color,0.86))}">${DL.esc(b.emoji||'🦷')}</span>`;
    return `<span class="${k}">${DL.esc((b.mark || b.name || '＋').slice(0,2))}</span>`;
  },

  /* 設定画面のプレビュー（ヘッダーの見え方をその場で確認する） */
  previewHtml(b){
    return `<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden">
      <div style="background:${DL.esc(b.color)};color:${DL.esc(DL.color.onColor(b.color))};
        padding:10px 14px;display:flex;align-items:center;gap:9px;font-weight:700;font-size:14px">
        ${this.logoHtml(b,'mk').replace('class="mk"','class="mk" style="background:rgba(255,255,255,.22)"')}
        <span>${DL.esc(b.showName ? (b.name||'（名称未設定）') : '')}</span>
      </div>
      <div style="padding:10px 14px;background:#fff;display:flex;gap:8px;align-items:center">
        <button class="btn pri sm" type="button">主要な操作</button>
        <button class="btn sm" type="button">通常の操作</button>
        <span class="b" style="background:${DL.esc(DL.color.lighten(b.color,0.9))};
          color:${DL.esc(DL.color.darken(b.color,0.24))}">バッジ</span>
      </div></div>`;
  },

  /* 画像を選ばせて data URI にする。大きいままだと保存領域を食うので縮小する */
  pickImage(cb, maxPx){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        const img = new Image();
        img.onload = () => {
          const M = maxPx || 256;
          const s = Math.min(1, M / Math.max(img.width, img.height));
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cb(cv.toDataURL('image/png'), f.name);
        };
        img.onerror = () => cb(null, f.name);
        img.src = fr.result;
      };
      fr.readAsDataURL(f);
    };
    inp.click();
  }
};

/* ============================================================
   4. CSV

   導入時のサポートで効くのは「今の台帳をそのまま流し込めること」。
   - 出力は Excel で文字化けしないよう BOM を付ける
   - 取り込みは必ずプレビューを挟む（いきなり反映しない）
   ============================================================ */
DL.csv = {
  /* cols: [{k:'code', l:'医院コード'}, ...] rows: オブジェクトの配列 */
  stringify(cols, rows){
    const q = v => {
      const s = v == null ? '' : String(v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const head = cols.map(c => q(c.l)).join(',');
    const body = rows.map(r => cols.map(c =>
      q(typeof c.v === 'function' ? c.v(r) : r[c.k])).join(',')).join('\r\n');
    return head + '\r\n' + body;
  },

  /* RFC4180 相当。引用符の中の改行・カンマ・二重引用符に対応する */
  parse(text){
    const s = String(text || '').replace(/^﻿/, '');
    const rows = []; let row = [], cur = '', inQ = false;
    for(let i = 0; i < s.length; i++){
      const ch = s[i];
      if(inQ){
        if(ch === '"'){
          if(s[i+1] === '"'){ cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      }else{
        if(ch === '"') inQ = true;
        else if(ch === ','){ row.push(cur); cur = ''; }
        else if(ch === '\r'){ /* 次の \n で処理 */ }
        else if(ch === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
    }
    if(cur !== '' || row.length){ row.push(cur); rows.push(row); }
    return rows.filter(r => r.some(v => String(v).trim() !== ''));
  },

  /* 1行目を見出しとして、オブジェクトの配列にする。
     cols の l（表示名）と k（キー）のどちらでも受ける。表記ゆれを吸収するため。 */
  toObjects(cols, rows){
    if(!rows.length) return {header:[], items:[]};
    const header = rows[0].map(h => String(h).trim());
    const idx = {};
    cols.forEach(c => {
      let i = header.indexOf(c.l);
      if(i < 0) i = header.indexOf(c.k);
      if(i < 0) i = header.findIndex(h => h.replace(/\s/g,'') === String(c.l).replace(/\s/g,''));
      idx[c.k] = i;
    });
    const items = rows.slice(1).map(r => {
      const o = {};
      cols.forEach(c => { o[c.k] = idx[c.k] >= 0 ? String(r[idx[c.k]] ?? '').trim() : ''; });
      return o;
    });
    return {header, items, idx};
  },

  download(filename, text){
    const blob = new Blob(['﻿' + text], {type:'text/csv;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  },

  /* 出力の入口。cols と rows を渡すだけで落ちてくる */
  export(filename, cols, rows){
    this.download(filename, this.stringify(cols, rows));
  },

  /* 見本ファイル（ヘッダーだけ、または例を1行入れたもの）。
     「どんな形式で用意すればいいか」を口頭で説明しなくて済むようにする */
  template(filename, cols, sample){
    const rows = sample ? [sample] : [];
    this.download(filename, this.stringify(cols, rows));
  },

  /* Excel から出した CSV は Shift_JIS のことがある。
     まず UTF-8 で読み、文字化け（U+FFFD）が目立つときだけ Shift_JIS で読み直す。 */
  pickFile(cb){
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,text/csv';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if(!f) return;
      const read = (enc, next) => {
        const fr = new FileReader();
        fr.onload  = () => next(String(fr.result));
        fr.onerror = () => cb(null, f.name);
        fr.readAsText(f, enc);
      };
      read('UTF-8', text => {
        if((text.match(/�/g) || []).length > 3) read('Shift_JIS', t2 => cb(t2, f.name));
        else cb(text, f.name);
      });
    };
    inp.click();
  },

  /* 取り込みプレビューの表。issues は行ごとの検証結果 [{level:'error'|'warn', msg}] */
  previewHtml(cols, items, issues, limit){
    const n = limit || 30;
    const head = cols.map(c => `<th>${DL.esc(c.l)}</th>`).join('');
    const body = items.slice(0, n).map((o, i) => {
      const iss = (issues && issues[i]) || null;
      const bg = !iss ? '' : iss.level === 'error' ? 'background:#fdeceb'
               : 'background:#fdf6e3';
      return `<tr style="${bg}">
        <td class="note">${i + 2}</td>
        ${cols.map(c => `<td>${DL.esc(o[c.k])}</td>`).join('')}
        <td class="note">${iss ? DL.esc(iss.msg) : '<span style="color:var(--success)">OK</span>'}</td>
      </tr>`;
    }).join('');
    return `<div class="tw" style="max-height:320px;overflow:auto">
      <table><thead><tr><th>行</th>${head}<th>判定</th></tr></thead>
      <tbody>${body}</tbody></table></div>
      ${items.length > n ? `<p class="note">ほか ${items.length - n} 行（表示は先頭 ${n} 行）</p>` : ''}`;
  }
};

/* ============================================================
   5. 印刷（PDF 化）

   PDF 生成器は入れない。ブラウザの印刷ダイアログで「PDFとして保存」を使う。
   本実装ではサーバー側で同じレイアウトから PDF を作る（基本設計 29-6）。
   ============================================================ */
/* 印刷時に「印刷対象だけを出す」ための CSS。各画面に書かなくて済むよう注入する */
DL.injectPrintCss = function(){
  if(document.getElementById('dl-print-css')) return;
  const st = document.createElement('style');
  st.id = 'dl-print-css';
  st.textContent = `
@media print{
  body.printing > *{display:none !important}
  body.printing .print-target{display:block !important;position:static !important;
    margin:0 !important;border:none !important;box-shadow:none !important;max-width:none !important}
  body.printing .print-target *{visibility:visible}
  body.printing .noprint{display:none !important}
  @page{margin:12mm}
}`;
  document.head.appendChild(st);
};

/* 印刷対象は body 直下でないことが多いので、対象を body 直下へ一時的に持ち上げる */
DL.printNode = function(html, title){
  const holder = document.createElement('div');
  holder.className = 'print-target dl-print-holder';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  const prev = document.title;
  if(title) document.title = title;
  document.body.classList.add('printing');
  const done = () => {
    document.body.classList.remove('printing');
    holder.remove();
    document.title = prev;
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
  setTimeout(done, 1200);
};

global.DL = DL;
DL.injectPrintCss();

})(window);
