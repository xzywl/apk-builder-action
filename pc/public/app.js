/* 黄果TV PC 版前端逻辑 */
'use strict';
const $ = (s) => document.querySelector(s);
const TABS = [
  ['hot', '首页'], ['ai-duanju', 'AI短剧'], ['ai-manju', 'AI漫剧'],
  ['ai-huanlian', 'AI幻恋'], ['ai-mogai', 'AI魔改'], ['ranks', '热播榜'], ['fav', '收藏'],
];
let cur = 'hot', page = 1, loading = false, done = false, kw = '';
let favs = JSON.parse(localStorage.getItem('hg_favs') || '[]');
let resume = JSON.parse(localStorage.getItem('hg_resume') || '{}');
let detail = null, curEp = 1, hls = null;

const img = (pic) => pic ? `/img?url=${encodeURIComponent(pic)}` : '';

/* ---------- 标签 ---------- */
const tabsEl = $('#tabs');
TABS.forEach(([id, name]) => {
  const b = document.createElement('button');
  b.textContent = name; b.dataset.id = id;
  b.onclick = () => switchTab(id);
  tabsEl.appendChild(b);
});
function switchTab(id) {
  cur = id; kw = ''; $('#kw').value = '';
  [...tabsEl.children].forEach(b => b.classList.toggle('on', b.dataset.id === id));
  reset(); load();
}

/* ---------- 列表 ---------- */
function reset() { $('#grid').innerHTML = ''; page = 1; done = false; }
async function load() {
  if (loading || done) return;
  loading = true; $('#status').textContent = '加载中…';
  try {
    let url;
    if (cur === 'fav') {
      const list = favs.map(f => f);
      render(list); done = true; $('#status').textContent = list.length ? `收藏 ${list.length} 部` : '还没有收藏，点详情页的 ☆ 收藏';
      loading = false; return;
    }
    if (cur === 'ranks') url = `/api/ranks/hot`;
    else if (kw) url = `/api/search/${encodeURIComponent(kw)}?page=${page}`;
    else url = `/api/category/${cur}?page=${page}`;
    const r = await (await fetch(url)).json();
    if (r.error) { $('#status').textContent = '加载失败：' + r.error; loading = false; return; }
    render(r.list);
    if (!r.list.length) done = true; else page++;
    $('#status').textContent = '';
  } catch (e) { $('#status').textContent = '加载失败：' + e.message; }
  loading = false;
}
function render(list) {
  const g = $('#grid');
  for (const v of list) {
    const c = document.createElement('div');
    c.className = 'card';
    c.innerHTML = `<img loading="lazy" src="${img(v.pic)}" onerror="this.style.opacity=.15"><div class="t" title="${v.title}">${v.title}</div><div class="r">${v.remarks || ''}</div>`;
    c.onclick = () => openDetail(v.id);
    g.appendChild(c);
  }
}
window.addEventListener('scroll', () => {
  if (cur === 'fav') return;
  if (window.innerHeight + window.scrollY > document.body.offsetHeight - 600) load();
});
$('#go').onclick = doSearch;
$('#kw').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
function doSearch() {
  kw = $('#kw').value.trim();
  if (!kw) return;
  [...tabsEl.children].forEach(b => b.classList.remove('on'));
  reset(); load();
}

/* ---------- 详情 ---------- */
async function openDetail(id) {
  $('#status').textContent = '加载详情…';
  const r = await (await fetch(`/api/detail/${id}`)).json();
  $('#status').textContent = '';
  if (r.error) { alert(r.error); return; }
  detail = r;
  const rs = resume[id];
  curEp = rs ? rs.ep : 1;
  $('#d-pic').src = img(r.pic);
  $('#d-title').textContent = r.title;
  $('#d-desc').textContent = r.desc || '';
  $('#d-fav').textContent = favs.some(f => f.id === id) ? '★ 已收藏' : '☆ 收藏';
  $('#d-play').textContent = rs ? `▶ 继续 第${rs.ep}集` : '▶ 播放';
  const eps = $('#d-eps');
  eps.innerHTML = '';
  for (const e of r.episodes) {
    const b = document.createElement('button');
    b.textContent = e.ep;
    b.className = e.ep === curEp ? 'cur' : '';
    b.onclick = () => { curEp = e.ep; [...eps.children].forEach(x => x.classList.toggle('cur', +x.textContent === e.ep)); };
    eps.appendChild(b);
  }
  $('#detail').classList.remove('hidden');
}
$('#dclose').onclick = () => $('#detail').classList.add('hidden');
$('#d-fav').onclick = () => {
  const i = favs.findIndex(f => f.id === detail.id);
  if (i >= 0) { favs.splice(i, 1); $('#d-fav').textContent = '☆ 收藏'; }
  else { favs.push({ id: detail.id, title: detail.title, pic: detail.pic, remarks: '' }); $('#d-fav').textContent = '★ 已收藏'; }
  localStorage.setItem('hg_favs', JSON.stringify(favs));
};
$('#d-play').onclick = () => { $('#detail').classList.add('hidden'); openPlayer(); };
$('#d-dl').onclick = () => {
  const name = `${detail.title} 第${curEp}集`;
  window.location = `/mp4?id=${detail.id}&ep=${curEp}&dl=1&name=${encodeURIComponent(name)}`;
};

/* ---------- 播放器 ---------- */
function epList() { return detail.episodes.map(e => e.ep).sort((a, b) => a - b); }
let autoNext = localStorage.getItem('hg_auto') !== '0';
let cdTimer = null;
/* 自动缓存：打开播放器后把当前集起最近10集依次转 MP4；已缓存的集直接离线播本地文件 */
let autoCache = localStorage.getItem('hg_cache') !== '0';
let cacheTimer = null;
function markCached(list) {
  const s = new Set(list);
  [...$('#p-eps').children].forEach(b => b.classList.toggle('cached', s.has(+b.textContent)));
}
function stopCachePoll() { if (cacheTimer) { clearInterval(cacheTimer); cacheTimer = null; } }
function applyCacheStatus(st) {
  if (!detail) return;
  markCached(st.cached || []);
  const info = $('#p-cache-info');
  if (st.current != null) {
    const pr = st.progress;
    const sub = pr ? (pr.stage === '下载分片' && pr.total ? `下载 ${pr.done}/${pr.total}` : pr.stage) : '准备中…';
    info.textContent = `缓存 第${st.current}集 · ${sub}`;
  } else if (st.queued && st.queued.length) {
    info.textContent = `缓存排队 ${st.queued.length} 集`;
  } else {
    info.textContent = (st.cached && st.cached.length) ? `已缓存 ${st.cached.length} 集 · 离线可播` : '';
    stopCachePoll();
  }
}
function fetchCacheOnce() {
  if (!detail) return;
  fetch(`/api/autocache?id=${detail.id}`).then(r => r.json()).then(applyCacheStatus).catch(() => {});
}
async function loadCacheDir() {
  try {
    const s = await (await fetch('/api/cachedir')).json();
    const sp = $('#p-cdir-path');
    sp.textContent = s.dir; sp.title = s.dir;
  } catch {}
}
$('#p-cdir').onclick = async () => {
  const cur = await (await fetch('/api/cachedir')).json();
  const nd = prompt('缓存目录（绝对路径，切换后旧缓存会自动移过去）：', cur.dir);
  if (nd === null) return;
  const t = nd.trim();
  if (!t || t === cur.dir) return;
  $('#p-cdir').disabled = true;
  let r;
  try { r = await (await fetch(`/api/cachedir?dir=${encodeURIComponent(t)}`)).json(); } catch (e) { r = { error: e.message }; }
  $('#p-cdir').disabled = false;
  if (r.error) { alert('设置失败：' + r.error); return; }
  alert(r.moved ? `已切换缓存目录，自动移动了 ${r.moved} 个缓存文件${r.failed ? `（${r.failed} 个失败）` : ''}` : '已切换缓存目录');
  loadCacheDir();
  fetchCacheOnce();
};
function queueCache() {
  if (!autoCache || !detail) return;
  const list = epList();
  const i = list.indexOf(curEp);
  const eps = list.slice(i, i + 10);
  fetch(`/api/autocache?id=${detail.id}&eps=${eps.join(',')}`).then(r => r.json()).then(applyCacheStatus).catch(() => {});
  startCachePoll();
}
function startCachePoll() {
  if (cacheTimer) return;
  cacheTimer = setInterval(() => {
    if (!detail) return stopCachePoll();
    fetch(`/api/autocache?id=${detail.id}`).then(r => r.json()).then(applyCacheStatus).catch(() => {});
  }, 2000);
}
$('#a-cache').onchange = (e) => {
  autoCache = e.target.checked;
  localStorage.setItem('hg_cache', autoCache ? '1' : '0');
  if (!detail) return;
  if (autoCache) queueCache();
  else {
    stopCachePoll();
    $('#p-cache-info').textContent = '';
    [...$('#p-eps').children].forEach(b => b.classList.remove('cached'));
    fetch(`/api/autocache?id=${detail.id}&cancel=1`).catch(() => {});
  }
};
function openPlayer() {
  $('#a-auto').checked = autoNext;
  $('#a-cache').checked = autoCache;
  $('#p-side-title').textContent = `${detail.title}选集`;
  const list = epList();
  $('#p-side-count').textContent = `共${list.length}集`;
  const pe = $('#p-eps');
  pe.innerHTML = '';
  for (const n of list) {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = n === curEp ? 'cur' : '';
    b.onclick = () => { saveResume(); cancelCountdown(); curEp = n; play(); };
    pe.appendChild(b);
    if (n === curEp) queueMicrotask(() => b.scrollIntoView({ block: 'nearest' }));
  }
  $('#player').classList.remove('hidden');
  loadCacheDir();
  if (autoCache) queueCache(); else fetchCacheOnce();
  play();
}
function setTitle() {
  $('#p-title').textContent = detail.title;
  $('#p-ep').textContent = `第${curEp}集`;
  [...$('#p-eps').children].forEach(b => b.classList.toggle('cur', +b.textContent === curEp));
}
let mp4Mode = false;
function playMp4(seekPos) {
  const v = $('#video');
  if (hls) { hls.destroy(); hls = null; }
  mp4Mode = true;
  $('#p-mp4').textContent = 'MP4 ✓';
  v.src = `/mp4?id=${detail.id}&ep=${curEp}`;
  v.onloadedmetadata = () => { if (seekPos > 5) v.currentTime = seekPos; applySpeed(); v.play(); };
  v.onended = onEnded;
}
async function play() {
  resetSpeed();
  setTitle();
  if (autoCache) queueCache();
  const v = $('#video');
  v.onloadedmetadata = null;
  const st = await (await fetch(`/api/mp4status?id=${detail.id}&ep=${curEp}`)).json();
  if (st.cached) {
    const rs = resume[detail.id];
    playMp4(rs && rs.ep === curEp ? rs.pos : 0);
    return;
  }
  mp4Mode = false; $('#p-mp4').textContent = '转MP4'; $('#p-mp4').disabled = false;
  const r = await (await fetch(`/api/play/${detail.id}/${curEp}`)).json();
  if (r.error) { alert('解析失败：' + r.error); return; }
  if (hls) { hls.destroy(); hls = null; }
  if (Hls.isSupported()) {
    hls = new Hls({ maxBufferLength: 30 });
    hls.loadSource(r.m3u8);
    hls.attachMedia(v);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      const rs = resume[detail.id];
      if (rs && rs.ep === curEp && rs.pos > 5) v.currentTime = rs.pos;
      v.play();
    });
    hls.on(Hls.Events.ERROR, (ev, d) => {
      if (d.fatal) {
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setStatus('播放出错：' + d.details);
      }
    });
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = r.m3u8; v.play();
  }
  v.onended = onEnded;
}
$('#p-mp4').onclick = async () => {
  if (mp4Mode) return;
  const v = $('#video'); const pos = v.currentTime; const btn = $('#p-mp4');
  btn.disabled = true;
  for (;;) {
    const st = await (await fetch(`/api/mp4status?id=${detail.id}&ep=${curEp}&build=1`)).json();
    if (st.cached) break;
    if (st.progress && st.progress.stage === '失败') { alert('转MP4失败：' + st.progress.error); btn.disabled = false; btn.textContent = '转MP4'; return; }
    btn.textContent = st.progress ? (st.progress.stage === '下载分片' && st.progress.total ? `下载 ${st.progress.done}/${st.progress.total}` : st.progress.stage) : '准备中…';
    await new Promise(r => setTimeout(r, 1500));
  }
  btn.disabled = false;
  playMp4(pos);
};
/* 自动联播：播完弹 5 秒倒计时，可取消/立即播放 */
function onEnded() {
  if (!autoNext) return;
  const list = epList();
  const i = list.indexOf(curEp);
  if (i < 0 || i >= list.length - 1) { setStatus('已播完全部剧集'); return; }
  const nx = list[i + 1];
  $('#pn-text').textContent = `即将播放 第${nx}集`;
  $('#p-next').classList.add('show');
  let n = 5;
  $('#pn-cd').textContent = n;
  cdTimer = setInterval(() => {
    n--;
    if (n <= 0) { cancelCountdown(); nextEp(); return; }
    $('#pn-cd').textContent = n;
  }, 1000);
}
function cancelCountdown() {
  if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
  $('#p-next').classList.remove('show');
}
$('#pn-go').onclick = () => { cancelCountdown(); nextEp(); };
$('#pn-cancel').onclick = cancelCountdown;
$('#a-auto').onchange = (e) => { autoNext = e.target.checked; localStorage.setItem('hg_auto', autoNext ? '1' : '0'); };
$('#a-next').onclick = () => { cancelCountdown(); saveResume(); const l = epList(); const i = l.indexOf(curEp); if (i < l.length - 1) { curEp = l[i + 1]; play(); } };
$('#a-prev').onclick = () => { cancelCountdown(); saveResume(); const l = epList(); const i = l.indexOf(curEp); if (i > 0) { curEp = l[i - 1]; play(); } };
$('#a-dl').onclick = () => {
  const name = `${detail.title} 第${curEp}集`;
  window.location = `/mp4?id=${detail.id}&ep=${curEp}&dl=1&name=${encodeURIComponent(name)}`;
};
function nextEp() {
  saveResume();
  const list = epList();
  const i = list.indexOf(curEp);
  if (i >= 0 && i < list.length - 1) { curEp = list[i + 1]; play(); }
  else setStatus('已播完全部剧集');
}
function saveResume() {
  const v = $('#video');
  if (detail && v.currentTime > 3) resume[detail.id] = { ep: curEp, pos: v.currentTime };
  localStorage.setItem('hg_resume', JSON.stringify(resume));
}
$('#pclose').onclick = () => { saveResume(); cancelCountdown(); stopCachePoll(); resetSpeed(); if (hls) { hls.destroy(); hls = null; } const v = $('#video'); v.pause(); v.removeAttribute('src'); v.load(); $('#player').classList.add('hidden'); $('#p-speed').classList.remove('show'); $('#p-osd').classList.remove('show'); };
function setStatus(t) { $('#p-ep').textContent = t; }

/* ---------- 方向键：→ 按住/连点倍速快进(2..6) 松开恢复 ← 按住连续后退10秒 ↑ 上一集 ↓ 下一集 ---------- */
const SPEED_MAX = 6;
let speedLevel = 1; /* 1 = 正常速度 */
let osdTimer = null;
let revertTimer = null;   /* 停止按键后恢复原速 */
let lastBumpAt = 0;       /* 连点/按住升级窗口 */
let lastRewindAt = 0;
function osdAutoHide(delay) {
  if (osdTimer) clearTimeout(osdTimer);
  osdTimer = setTimeout(() => $('#p-osd').classList.remove('show'), delay);
}
function showOsd(text, small) {
  const o = $('#p-osd');
  o.textContent = text;
  o.classList.toggle('small', !!small);
  o.classList.add('show');
  osdAutoHide(1100);
}
function showSpeedOsd(level) {
  const o = $('#p-osd');
  o.classList.remove('small');
  o.innerHTML = `<span class="big">${level}倍</span><span class="sub">快进中</span>`;
  o.classList.add('show');
  osdAutoHide(5000); /* 按住期间持续显示，恢复/松开时随倍速一起淡出 */
}
function applySpeed() {
  $('#video').playbackRate = speedLevel;
  const b = $('#p-speed');
  if (speedLevel > 1) { b.textContent = `▶▶ ${speedLevel}倍速`; b.classList.add('show'); }
  else b.classList.remove('show');
}
function resetSpeed() {
  clearTimeout(revertTimer);
  lastBumpAt = 0;
  if (osdTimer) clearTimeout(osdTimer);
  $('#p-osd').classList.remove('show');
  if (speedLevel !== 1) { speedLevel = 1; applySpeed(); }
  else $('#video').playbackRate = 1;
}
function armRevert(ms) {
  clearTimeout(revertTimer);
  revertTimer = setTimeout(() => {
    speedLevel = 1; lastBumpAt = 0; applySpeed();
    if (osdTimer) clearTimeout(osdTimer);
    $('#p-osd').classList.remove('show');
  }, ms);
}
function bumpSpeed() {
  const now = Date.now();
  speedLevel = (now - lastBumpAt <= 600 && speedLevel >= 2) ? Math.min(speedLevel + 1, SPEED_MAX) : 2;
  lastBumpAt = now;
  applySpeed();
  showSpeedOsd(speedLevel);
  armRevert(900);
}
function rewind10s() {
  const v = $('#video');
  v.currentTime = Math.max(0, v.currentTime - 10);
  showOsd('≪ 后退10秒', true);
}
function keyPrevEp() {
  const l = epList(); const i = l.indexOf(curEp);
  if (i > 0) { cancelCountdown(); saveResume(); curEp = l[i - 1]; play(); }
  else showOsd('已是第一集', true);
}
function keyNextEp() {
  const l = epList(); const i = l.indexOf(curEp);
  if (i < l.length - 1) { cancelCountdown(); saveResume(); curEp = l[i + 1]; play(); }
  else showOsd('已是最后一集', true);
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  const t = e.target;
  if (t && t.closest && t.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (!detail || $('#player').classList.contains('hidden')) return;
  if (e.key === 'ArrowRight') {
    e.preventDefault();
    if (!e.repeat) bumpSpeed();
    else if (Date.now() - lastBumpAt >= 380) bumpSpeed(); /* 按住：节流逐级升 */
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    if (!e.repeat) { rewind10s(); lastRewindAt = Date.now(); }
    else if (Date.now() - lastRewindAt >= 300) { rewind10s(); lastRewindAt = Date.now(); }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!e.repeat) keyPrevEp();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (!e.repeat) keyNextEp();
  }
});
document.addEventListener('keyup', (e) => {
  /* 松开 → 后很快恢复原速（保留短暂连点窗口） */
  if (e.key === 'ArrowRight' && speedLevel > 1) armRevert(450);
});

/* 状态提示 */
fetch('/api/status').then(r => r.json()).then(s => {
  if (!s.proxy && !s.mirror) $('#status').textContent = '⚠ 镜像与代理均不可用：站点无法访问（请开启 VPN 后刷新）';
});
switchTab('hot');
