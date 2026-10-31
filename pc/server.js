/* 黄果TV PC 版本地服务：抓取 huangguoai.com（站点走系统代理，CDN 直连），
 * 提供 JSON API、封面解密、HLS 下载合并。零窗口：由 wscript 隐藏启动。 */
'use strict';
const http = require('http');
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');

const PORT = 8421;
const FFMPEG_LOCAL = 'H:\\gpt_work_dir\\toolchain\\ffmpeg\\ffmpeg-master-latest-win64-gpl\\bin\\ffmpeg.exe'; // 本机 toolchain，优先使用
const FFMPEG = fs.existsSync(FFMPEG_LOCAL) ? FFMPEG_LOCAL : 'ffmpeg'; // 其他机器退回 PATH 里的 ffmpeg
const DEFAULT_CACHE = path.join(__dirname, 'cache');
const CONFIG = path.join(__dirname, 'config.json');
let CACHE = DEFAULT_CACHE; // 可在界面设置，存于 config.json
try {
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  if (cfg.cacheDir && path.isAbsolute(cfg.cacheDir)) CACHE = cfg.cacheDir;
} catch {}
fs.mkdirSync(CACHE, { recursive: true });
const SITE = 'https://huangguoai.com';
const ENTRY = 'https://hgai5.com'; // 官方发布页（直连可达），用于发现最新镜像域名
const KNOWN_MIRRORS = ['cb74.bg40t53p.cc', 'i8gbw.nt17g20k.cc', 'lpiep.nt17g20k.cc', 'hi9ly.nt17g20k.cc', 'a74c.nt17g20k.cc'];
let siteHost = null; // 当前可用镜像 host（直连），null 表示未找到
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PUB = path.join(__dirname, 'public');

/* ---------- 系统代理探测（HKCU Internet Settings） ---------- */
function detectProxy() {
  try {
    const base = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    const q = (v) => execFileSync('reg', ['query', base, '/v', v], { windowsHide: true, encoding: 'utf8' });
    if (!/ProxyEnable\s+REG_DWORD\s+0x1/i.test(q('ProxyEnable'))) return null;
    const m = q('ProxyServer').match(/ProxyServer\s+REG_SZ\s+(\S+)/i);
    if (!m) return null;
    const s = m[1].replace(/^https?:\/\//i, '').split(/\s|;/)[0];
    const [host, port] = s.split(':');
    if (!host) return null;
    return { host, port: +port || 80 };
  } catch { return null; }
}
const PROXY = detectProxy();
let siteViaProxy = !!PROXY; // 站点域名是否走代理（启动时探测一次）

/* ---------- 原始 HTTP over TLS（可选 CONNECT 代理），支持 3xx 跟随 ---------- */
function rawGet(urlStr, proxy, timeoutMs, redirects = 3) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const send = (sock) => {
      let req = `GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nConnection: close\r\nUser-Agent: ${UA}\r\nAccept: */*\r\nAccept-Language: zh-CN,zh;q=0.9\r\nReferer: ${u.protocol}//${u.host}/\r\n`;
      req += '\r\n';
      const parts = [];
      sock.on('data', (d) => parts.push(d));
      sock.on('end', () => {
        const buf = Buffer.concat(parts);
        const sep = buf.indexOf('\r\n\r\n');
        if (sep < 0) return reject(new Error('响应无头部'));
        const head = buf.slice(0, sep).toString('latin1');
        const status = +(head.split(/\r?\n/)[0].split(' ')[1] || 0);
        if ([301, 302, 303, 307, 308].includes(status) && redirects > 0) {
          const loc = /location:\s*(\S+)/i.exec(head);
          if (loc) {
            const t = new URL(loc[1], urlStr);
            if (!proxy && siteHost && t.host === 'huangguoai.com') t.host = siteHost; // 镜像 302 回主域时改写回镜像
            return resolve(rawGet(t.href, proxy, timeoutMs, redirects - 1));
          }
        }
        resolve({ status, body: buf.slice(sep + 4), finalUrl: urlStr });
      });
      sock.on('error', reject);
      sock.setTimeout(timeoutMs, () => { sock.destroy(); reject(new Error('超时')); });
      sock.write(req);
    };
    if (!proxy) {
      const sock = tls.connect({ host: u.host, port: 443, servername: u.host, ALPNProtocols: ['http/1.1'] }, () => send(sock));
      sock.on('error', reject);
      return;
    }
    const sock = net.connect(proxy.port, proxy.host);
    sock.setTimeout(timeoutMs, () => { sock.destroy(); reject(new Error('代理超时')); });
    let hs = '';
    const onH = (d) => {
      hs += d.toString('latin1');
      const i = hs.indexOf('\r\n\r\n');
      if (i < 0) return;
      sock.removeListener('data', onH);
      if (!/\s200\s/.test(hs.slice(0, i))) { sock.destroy(); return reject(new Error('代理 CONNECT 失败')); }
      const rest = hs.slice(i + 4);
      const t = tls.connect({ socket: sock, servername: u.host, ALPNProtocols: ['http/1.1'] });
      t.on('error', reject);
      if (rest.length) process.nextTick(() => sock.emit('data', rest));
      t.on('secureConnect', () => send(t));
    };
    sock.on('data', onH);
    sock.on('error', reject);
    sock.write(`CONNECT ${u.host}:443 HTTP/1.1\r\nHost: ${u.host}\r\n\r\n`);
  });
}

/* ---------- 镜像发现：主站被 SNI+DNS 封锁，官方发布页列出直连可达的镜像域 ---------- */
async function probeHost(host) {
  try {
    const r = await rawGet(`https://${host}/`, null, 8000);
    return r.status === 200 && r.body.toString('utf8').includes('hg-drama-card');
  } catch { return false; }
}
async function discoverSite() {
  if (siteHost && await probeHost(siteHost)) return siteHost;
  siteHost = null;
  for (const h of KNOWN_MIRRORS) if (await probeHost(h)) { siteHost = h; return h; }
  try {
    const r = await rawGet(`${ENTRY}/`, null, 10000);
    const hosts = [...new Set((r.body.toString('utf8').match(/https:\/\/[a-z0-9.-]+\.(?:cc|com|ai|net|tv)/gi) || []))]
      .map((x) => x.replace(/^https:\/\//i, '').toLowerCase())
      .filter((h) => h !== 'huangguoai.com' && h !== 'hgai5.com' && !/drleao|hzjvlo|googletagmanager|yandex|\.me$|x\.com|youtube|tiktok/.test(h));
    for (const h of hosts) if (await probeHost(h)) { siteHost = h; return h; }
  } catch {}
  return null;
}

/* 站点页面抓取：镜像直连优先，失败回退代理/主站直连 */
async function fetchHtml(url) {
  const u = new URL(url);
  if (u.host === 'huangguoai.com') {
    let host = siteHost || await discoverSite();
    for (let attempt = 0; host && attempt < 2; attempt++) {
      const uu = new URL(url); uu.host = host;
      try {
        const r = await rawGet(uu.href, null, 10000);
        if (r.status === 200) {
          const fh = new URL(r.finalUrl).host; // 镜像轮换：301 到新域则直接采纳
          if (fh !== host && fh !== 'huangguoai.com') siteHost = fh;
          return r;
        }
      } catch {}
      siteHost = null;
      host = await discoverSite();
    }
  }
  if (siteViaProxy && PROXY) {
    try { return await rawGet(url, PROXY, 20000); }
    catch (e) { const r = await rawGet(url, null, 8000); siteViaProxy = false; return r; }
  }
  try { return await rawGet(url, null, 8000); }
  catch (e) {
    if (!PROXY) throw e;
    const r = await rawGet(url, PROXY, 20000);
    siteViaProxy = true;
    return r;
  }
}
/* CDN 抓取：直连优先，失败回退代理 */
async function fetchCdn(url) {
  try { return await rawGet(url, null, 20000); }
  catch (e) { if (!PROXY) throw e; return rawGet(url, PROXY, 25000); }
}

/* ---------- 封面 AES-128-CBC 解密 ---------- */
function decryptImage(buf) {
  if (buf.length > 2 && ((buf[0] === 0xFF && buf[1] === 0xD8) || (buf[0] === 0x89 && buf[1] === 0x50))) return buf;
  let data = buf;
  const s = buf.toString('utf8').trim();
  if (/^[A-Za-z0-9+/\r\n=]+$/.test(s) && s.length > 32) {
    const b = Buffer.from(s.replace(/\s/g, ''), 'base64');
    if (b.length >= 16) data = b;
  }
  const d = crypto.createDecipheriv('aes-128-cbc', Buffer.from('f5d965df75336270', 'utf8'), Buffer.from('97b60394abc2fbe1', 'utf8'));
  d.setAutoPadding(false);
  let out = Buffer.concat([d.update(data), d.final()]);
  const j = out.lastIndexOf(Buffer.from('ffd9', 'hex'));
  if (out[0] === 0xFF && out[1] === 0xD8 && j > 0) return out.slice(0, j + 2);
  const iend = out.indexOf('IEND', 'latin1');
  if (iend > 0) return out.slice(0, iend + 8);
  return out;
}

/* ---------- 页面解析 ---------- */
function stripTags(s) { return s.replace(/<span class="sr-only">[\s\S]*?<\/span>/g, '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim(); }

function parseCards(html) {
  const out = [];
  for (const b of html.split(/<div class="hg-drama-card["\s]/).slice(1)) {
    const id = (b.match(/href="\/video\/(\d+)\//) || [])[1];
    if (!id) continue;
    const pic = (b.match(/data-src="([^"]*)"/) || [])[1] || '';
    const t = (b.match(/hg-drama-card__title"[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '';
    const ep = (b.match(/data-ep-base="([^"]*)"/) || [])[1] || '';
    out.push({ id, title: stripTags(t), pic, remarks: ep });
  }
  return out;
}

function parseRanks(html) {
  const out = [];
  for (const b of html.split('<div class="hg-rank-item"').slice(1)) {
    const id = (b.match(/data-track-id="(\d+)"/) || [])[1];
    if (!id) continue;
    const title = (b.match(/data-track-title="([^"]*)"/) || [])[1] || '';
    const pic = (b.match(/data-src="([^"]*)"/) || [])[1] || '';
    out.push({ id, title, pic, remarks: '' });
  }
  return out;
}

function parseDetail(html, id) {
  const m = html.match(/id="videoInitialData" type="application\/json">([\s\S]*?)<\/script>/);
  let j = null;
  if (m) { try { j = JSON.parse(m[1]); } catch {} }
  const episodes = [];
  for (const a of html.matchAll(/<a class="hg-web-play__ep[^"]*" href="([^"]*)" data-ep-id="(\d+)"[^>]*>/g)) {
    episodes.push({ ep: +a[2], url: a[1].startsWith('http') ? a[1] : SITE + a[1] });
  }
  const playMap = (j && j.epPlaySrcs) || {};
  return {
    id,
    title: (j && j.title) || (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || id,
    pic: (j && j.coverSrc) || '',
    desc: (j && j.description) || '',
    episodes,
    playMap,
  };
}

async function resolvePlay(id, ep) {
  // 先试详情页内嵌 playMap（首页进入时已带），否则抓对应集页面
  const pageUrl = ep === 1 ? `${SITE}/video/${id}/` : `${SITE}/video/${id}/ep-${ep}/`;
  const r = await fetchHtml(pageUrl);
  const d = parseDetail(r.body.toString('utf8'), id);
  const url = d.playMap[String(ep)] || d.playMap[ep] || null;
  if (!url) throw new Error('未找到播放地址');
  return url;
}

/* ---------- HLS 下载：取 m3u8 → 逐片下载 → AES-128 解密 → 合并为 .ts ---------- */
async function downloadEpisode(m3u8Url, onSeg) {
  const r = await fetchCdn(m3u8Url);
  const text = r.body.toString('utf8');
  if (!text.startsWith('#EXTM3U')) throw new Error('非 m3u8 清单');
  const lines = text.split(/\r?\n/);
  let keyBuf = null, iv = null;
  const segs = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('#EXT-X-KEY') && /METHOD=AES-128/.test(l)) {
      const uri = (l.match(/URI="([^"]*)"/) || [])[1];
      const ivm = l.match(/IV=0x([0-9a-fA-F]+)/);
      iv = ivm ? Buffer.from(ivm[1], 'hex') : null;
      if (uri) keyBuf = (await fetchCdn(uri)).body;
    } else if (l && !l.startsWith('#')) {
      segs.push(l.startsWith('http') ? l : new URL(l, m3u8Url).href);
    }
  }
  const chunks = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (onSeg) onSeg(i, segs.length);
    const sb = (await fetchCdn(s)).body;
    if (keyBuf) {
      const useIv = iv || Buffer.alloc(16);
      const d = crypto.createDecipheriv('aes-128-cbc', keyBuf, useIv);
      d.setAutoPadding(false);
      chunks.push(Buffer.concat([d.update(sb), d.final()]));
    } else chunks.push(sb);
  }
  return Buffer.concat(chunks);
}

/* ---------- TS → MP4 转封装（ffmpeg -c copy，缓存到 pc/cache） ---------- */
const building = {};
const mp4Progress = {};
function buildMp4(id, ep) {
  const key = `${id}-${ep}`;
  const mp4 = path.join(CACHE, key + '.mp4');
  if (fs.existsSync(mp4) && fs.statSync(mp4).size > 1024) return Promise.resolve(mp4);
  if (building[key]) return building[key];
  if (!fs.existsSync(FFMPEG)) return Promise.reject(new Error('ffmpeg 未安装'));
  const task = (async () => {
    mp4Progress[key] = { stage: '解析地址', done: 0, total: 0 };
    const m3u8 = await resolvePlay(id, ep);
    mp4Progress[key] = { stage: '下载分片', done: 0, total: 0 };
    const ts = await downloadEpisode(m3u8, (d, t) => { mp4Progress[key] = { stage: '下载分片', done: d, total: t }; });
    const tmp = path.join(CACHE, key + '.ts');
    fs.writeFileSync(tmp, ts);
    mp4Progress[key] = { stage: '转封装MP4', done: 0, total: 0 };
    await new Promise((resolve, reject) => {
      const pr = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-c', 'copy', '-movflags', '+faststart', mp4], { windowsHide: true });
      pr.on('error', reject);
      pr.on('close', (code) => (code === 0 ? resolve() : reject(new Error('ffmpeg 退出码 ' + code))));
    });
    fs.unlink(tmp, () => {});
    mp4Progress[key] = { stage: '完成', done: 1, total: 1 };
    return mp4;
  })();
  building[key] = task.finally(() => { delete building[key]; });
  return building[key];
}

/* ---------- 自动缓存队列：按顺序把指定集转成 MP4（一次一集，不与播放抢带宽） ---------- */
const autoQueues = {}; // id -> { eps, current, failed, running, cancelled }
function cachedEps(id) {
  const out = [];
  const re = new RegExp('^' + id + '-(\\d+)\\.mp4$');
  try {
    for (const f of fs.readdirSync(CACHE)) {
      const m = f.match(re);
      if (m && fs.statSync(path.join(CACHE, f)).size > 1024) out.push(+m[1]);
    }
  } catch {}
  return out.sort((a, b) => a - b);
}
function queueStatus(id) {
  const q = autoQueues[id];
  const cached = cachedEps(id);
  const have = new Set(cached);
  return {
    cached,
    queued: q ? q.eps : [],
    current: q ? q.current : null,
    progress: q && q.current != null ? (mp4Progress[`${id}-${q.current}`] || null) : null,
    failed: q ? Object.fromEntries(Object.entries(q.failed).filter(([ep]) => !have.has(+ep))) : {},
  };
}
async function runAutoQueue(id) {
  const q = autoQueues[id];
  if (!q || q.running) return;
  q.running = true;
  let retried = false;
  while (q.eps.length || (!retried && Object.keys(q.failed).length)) {
    if (q.cancelled) { q.eps = []; break; }
    if (!q.eps.length) { // 失败集自动重试一轮（多为镜像抖动）
      retried = true;
      q.eps = Object.keys(q.failed).map(Number);
      q.failed = {};
    }
    const ep = q.eps[0];
    q.current = ep;
    try { await buildMp4(id, ep); } catch (e) { q.failed[ep] = String(e && e.message || e); }
    q.eps.shift();
  }
  q.current = null;
  q.running = false;
}

/* ---------- HTTP 服务 ---------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  const p = u.pathname;
  const json = (obj, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(obj)); };
  try {
    if (p === '/api/status') return json({ ok: true, proxy: PROXY ? `${PROXY.host}:${PROXY.port}` : null, siteViaProxy, mirror: siteHost });
    if (p.startsWith('/api/category/')) {
      const tid = p.split('/')[3] || 'ai-duanju';
      const page = Math.max(1, +u.searchParams.get('page') || 1);
      if (tid === 'hot') { // 镜像无 /hot/：首页根页卡片 + 热播榜合并去重
        const r = await fetchHtml(`${SITE}/`);
        const list = parseCards(r.body.toString('utf8'));
        try {
          const rr = await fetchHtml(`${SITE}/ranks/hot/`);
          const seen = new Set(list.map(x => x.id));
          for (const x of parseRanks(rr.body.toString('utf8'))) if (!seen.has(x.id)) { seen.add(x.id); list.push(x); }
        } catch {}
        return json({ list });
      }
      const r = await fetchHtml(`${SITE}/${tid}/${page}/`);
      return json({ list: parseCards(r.body.toString('utf8')) });
    }
    if (p.startsWith('/api/ranks/')) {
      const type = p.split('/')[3] || 'hot';
      const r = await fetchHtml(`${SITE}/ranks/${type}/`);
      return json({ list: parseRanks(r.body.toString('utf8')) });
    }
    if (p.startsWith('/api/search/')) {
      const kw = decodeURIComponent(p.split('/').slice(3).join('/'));
      const page = Math.max(1, +u.searchParams.get('page') || 1);
      const r = await fetchHtml(`${SITE}/search/video/${encodeURIComponent(kw)}/${page}/`);
      return json({ list: parseCards(r.body.toString('utf8')) });
    }
    if (p.startsWith('/api/detail/')) {
      const id = p.split('/')[3];
      const r = await fetchHtml(`${SITE}/video/${id}/`);
      return json(parseDetail(r.body.toString('utf8'), id));
    }
    if (p.startsWith('/api/play/')) {
      const [, , , id, epStr] = p.split('/');
      const url = await resolvePlay(id, +epStr || 1);
      return json({ m3u8: url });
    }
    if (p === '/img') {
      const target = u.searchParams.get('url');
      if (!target) return json({ error: '缺 url' }, 400);
      const r = await fetchCdn(target);
      const img = decryptImage(r.body);
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' });
      return res.end(img);
    }
    if (p === '/dl') {
      const id = u.searchParams.get('id'), ep = +u.searchParams.get('ep') || 1;
      const name = (u.searchParams.get('name') || `${id}-${ep}`).replace(/[\\/:*?"<>|]/g, '_');
      const m3u8 = await resolvePlay(id, ep);
      res.writeHead(200, { 'Content-Type': 'video/mp2t', 'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}.ts"` });
      const ts = await downloadEpisode(m3u8);
      return res.end(ts);
    }
    if (p === '/api/cachedir') {
      const dir = u.searchParams.get('dir');
      if (!dir) return json({ dir: CACHE, default: DEFAULT_CACHE });
      const nd = dir.trim();
      if (!path.isAbsolute(nd)) return json({ error: '必须是绝对路径（如 H:\\hg_cache）' }, 400);
      if (path.resolve(nd) === path.resolve(CACHE)) return json({ ok: true, dir: CACHE, moved: 0 });
      if (Object.keys(building).length) return json({ error: '正在转码缓存中，稍后再修改目录' }, 409);
      try { fs.mkdirSync(nd, { recursive: true }); } catch (e) { return json({ error: '无法创建目录：' + e.message }, 400); }
      const probe = path.join(nd, '.hgwrite');
      try { fs.writeFileSync(probe, '1'); fs.unlinkSync(probe); } catch (e) { return json({ error: '目录不可写：' + e.message }, 400); }
      const old = CACHE;
      let moved = 0, failed = 0;
      try {
        for (const f of fs.readdirSync(old)) {
          if (!/\.(mp4|ts)$/.test(f)) continue;
          const src = path.join(old, f), dst = path.join(nd, f);
          try { fs.renameSync(src, dst); moved++; }
          catch { // 跨盘符 rename 失败 → 复制后删除
            try { fs.copyFileSync(src, dst); fs.unlinkSync(src); moved++; } catch { failed++; }
          }
        }
      } catch {}
      CACHE = nd;
      try { fs.writeFileSync(CONFIG, JSON.stringify({ cacheDir: CACHE }, null, 2)); } catch {}
      return json({ ok: true, dir: CACHE, moved, failed, old });
    }
    if (p === '/api/autocache') {
      const id = u.searchParams.get('id');
      if (u.searchParams.get('cancel')) {
        const old = autoQueues[id];
        if (old) { old.eps = []; old.cancelled = true; }
        delete autoQueues[id];
        return json({ ok: true });
      }
      const eps = (u.searchParams.get('eps') || '').split(',').map(Number).filter((n) => n > 0);
      if (eps.length) {
        for (const other of Object.keys(autoQueues)) if (other !== id) delete autoQueues[other]; // 同时只缓存一部剧
        const have = new Set(cachedEps(id));
        let q = autoQueues[id];
        if (!q) q = autoQueues[id] = { eps: [], failed: {}, current: null, running: false, cancelled: false };
        for (const ep of eps) if (!have.has(ep) && !q.eps.includes(ep) && q.current !== ep) q.eps.push(ep);
        runAutoQueue(id);
      }
      return json(queueStatus(id));
    }
    if (p === '/api/mp4status') {
      const id = u.searchParams.get('id'), ep = +u.searchParams.get('ep') || 1;
      const key = `${id}-${ep}`;
      const mp4 = path.join(CACHE, key + '.mp4');
      if (u.searchParams.get('build') && !(fs.existsSync(mp4) && fs.statSync(mp4).size > 1024)) {
        buildMp4(id, ep).catch((e) => { mp4Progress[key] = { stage: '失败', error: String(e && e.message || e), done: 0, total: 0 }; });
      }
      return json({ cached: fs.existsSync(mp4) && fs.statSync(mp4).size > 1024, progress: mp4Progress[key] || null });
    }
    if (p === '/mp4') {
      const id = u.searchParams.get('id'), ep = +u.searchParams.get('ep') || 1;
      const name = (u.searchParams.get('name') || `${id}-${ep}`).replace(/[\\/:*?"<>|]/g, '_');
      const mp4 = await buildMp4(id, ep);
      const size = fs.statSync(mp4).size;
      const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes' };
      if (u.searchParams.get('dl')) headers['Content-Disposition'] = `attachment; filename="${encodeURIComponent(name)}.mp4"`;
      const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
      if (range) {
        let start = range[1] ? +range[1] : 0;
        let end = range[2] ? +range[2] : size - 1;
        if (start >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
        end = Math.min(end, size - 1);
        res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
        return fs.createReadStream(mp4, { start, end }).pipe(res);
      }
      res.writeHead(200, { ...headers, 'Content-Length': size });
      return fs.createReadStream(mp4).pipe(res);
    }
    // 静态文件
    let f = p === '/' ? '/index.html' : p;
    const fp = path.join(PUB, path.normalize(f).replace(/^([.][.][\\/])+/g, ''));
    if (!fp.startsWith(PUB) || !fs.existsSync(fp)) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
    fs.createReadStream(fp).pipe(res);
  } catch (e) {
    json({ error: String(e && e.message || e) }, 500);
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`黄果TV PC 服务已启动: http://127.0.0.1:${PORT}  代理: ${PROXY ? PROXY.host + ':' + PROXY.port : '无'}`);
  discoverSite().then((h) => console.log(h ? `镜像直连可用: ${h}` : '未找到可用镜像，需系统代理'));
});
