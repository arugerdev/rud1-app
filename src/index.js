const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);
const appPath = app.getAppPath();
const platform = process.platform; // 'win32', 'darwin', 'linux'

// Detectar sistema operativo
const isWindows = platform === 'win32';
const isMac = platform === 'darwin';
const isLinux = platform === 'linux';

let mainWindow;

// Rutas de los ejecutables
const tailscalePath = isWindows ? path.join(appPath, '..', 'utils', 'tailscale.exe') : 'tailscale';
const vhserverPath = isWindows ? path.join(appPath, '..', 'utils', 'vhserver.exe') : 'vhserver';

const options = {
  name: 'Rud1App',
  icns: '/src/assets/icon.icns'
};

async function installDependencies() {
  const execPromise = (cmd) => new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error ejecutando comando: ${cmd}`, error);
        reject(stderr);
      } else {
        console.log(`Comando ejecutado: ${cmd}`, stdout);
        resolve(stdout);
      }
    });
  });

  try {
    if (isLinux) {
      console.log('Instalando dependencias en Linux...');
      await execPromise('sudo apt-get update');
      await execPromise('sudo apt-get install -y tailscale');
      console.log('Tailscale instalado correctamente');
      await execPromise('sudo wget https://www.virtualhere.com/sites/default/files/usbserver/vhusbdarm -O /usr/bin/vhserver');
      await execPromise('sudo chmod +x /usr/bin/vhserver');
      console.log('VirtualHere instalado correctamente y disponible como comando vhserver');
    } else if (isMac) {
      console.log('Instalando dependencias en macOS...');
      await execPromise('brew install tailscale');
      console.log('Tailscale instalado correctamente');
      await execPromise('curl -o /usr/local/bin/vhserver https://www.virtualhere.com/sites/default/files/usbserver/vhusbdarml64');
      await execPromise('chmod +x /usr/local/bin/vhserver');
      await execPromise('sudo spctl --add --label "vhserver" /usr/local/bin/vhserver');
      await execPromise('sudo spctl --enable --label "vhserver"');
      await execPromise('sudo spctl --master-disable');
      console.log('VirtualHere instalado correctamente y disponible como comando vhserver con Gatekeeper desactivado');
    } else {
      console.log('Sistema operativo no soportado para la instalación automática');
    }
  } catch (error) {
    console.error('Error durante la instalación de dependencias:', error);
  }
}

app.on('ready', () => {
  installDependencies();

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL('https://rud1.vercel.app');
  mainWindow.maximize();
  mainWindow.focus();

  ipcMain.on('connect-vpn', async (event) => {
    try {
      if (isWindows) {
        await execPromise('net start tailscale');
      } else if (isLinux || isMac) {
        await execPromise('sudo systemctl start tailscaled');
      }

      const { stdout } = await execPromise(`${tailscalePath} up --unattended --timeout 120s --reset`, options);
      if (stdout.includes('Success.')) {
        console.log('VPN Conectada');
        startVirtualHere();
        event.reply('vpn-status', 'Conectada');
      } else {
        event.reply('vpn-status', 'Error');
      }
    } catch (error) {
      console.error('Error al conectar VPN:', error);
      event.reply('vpn-status', 'Error');
    }
  });

  ipcMain.on('tailscale-status', async (event) => {
    try {
      const { stdout } = await execPromise(`${tailscalePath} status`);
      const result = parseTailscaleStatus(stdout);
      event.reply('tailscale-status-reply', result);
    } catch (error) {
      console.error('Error al obtener estado:', error);
      event.reply('tailscale-status-reply', { status: 'desconocido', ip: null });
    }
  });

  ipcMain.on('tailscale-down', async (event) => {
    try {
      await execPromise(`${tailscalePath} down`);
      console.log('VPN Desconectada');
      event.reply('tailscale-down-reply', 'Desconectada');
    } catch (error) {
      console.error('Error al desconectar:', error);
      event.reply('tailscale-down-reply', 'Error');
    }
  });

  function startVirtualHere() {
    exec(`${vhserverPath} -q ES-AR`, (error) => {
      if (error) {
        console.error('Error al iniciar VirtualHere:', error);
      } else {
        console.log('VirtualHere iniciado');
      }
    });
  }

  app.on('before-quit', () => {
    exec(`${tailscalePath} down`);
    if (isWindows) {
      exec('taskkill /im vhserver.exe /F');
    } else {
      exec('pkill vhserver');
    }
  });
});

function parseTailscaleStatus(output) {
  if (output.includes('stopped')) {
    return { status: 'inactivo', ip: null };
  }

  const match = output.match(/([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)/);
  if (match) {
    return { status: 'activo', ip: match[1] };
  }

  return { status: 'desconocido', ip: null };
}
