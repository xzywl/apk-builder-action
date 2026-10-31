/* 黄果TV 桌面版：Electron 窗口 + 内嵌 pc/server.js 本地服务。
 * 若 8421 端口已有服务在跑（如 PC 版启动器拉起的），直接复用，不再重复启动。 */
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');
const http = require('http');

const PORT = 8421;
const HOME = `http://127.0.0.1:${PORT}/`;

function serverAlive() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/status', timeout: 1500 }, (r) => {
      r.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    title: '黄果TV',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: { spellcheck: false },
  });
  Menu.setApplicationMenu(null);
  // 从后台进程（快捷方式/计划任务）启动时窗口可能默认不显示，就绪后强制显示并聚焦
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });
  win.on('closed', () => { win = null; });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadURL(HOME);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.huangguo.tv.desktop');
    if (!(await serverAlive())) require(path.join(__dirname, '..', 'pc', 'server.js'));
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
