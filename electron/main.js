const { app, BrowserWindow, shell, Menu, session } = require('electron');
const path = require('path');

const APP_URL = 'https://romateccrm.com';
const APP_NAME = 'Romatec CRM';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    minWidth: 1024,
    minHeight: 600,
    title: APP_NAME,
    icon: path.join(__dirname, 'build', 'icon.ico'),
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Remove barra de menu padrão
  Menu.setApplicationMenu(null);

  // Carrega o CRM
  mainWindow.loadURL(APP_URL);

  // Mostra janela maximizada quando pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  // Sem internet: mostra página offline
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    // Ignora erros que não são de conectividade
    if (errorCode === -3) return; // ERR_ABORTED (navegação cancelada)
    mainWindow.loadFile(path.join(__dirname, 'offline.html'));
  });

  // Links externos abrem no navegador padrão do sistema
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_URL) && !url.startsWith('file://')) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Instância única — evita abrir duas janelas
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    // Permite cookies e sessão persistente
    session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
      const allowed = ['notifications', 'clipboard-read', 'clipboard-sanitized-write'];
      callback(allowed.includes(permission));
    });

    createWindow();
  });
}

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
