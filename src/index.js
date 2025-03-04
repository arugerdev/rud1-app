const { app, BrowserWindow, Notification, ipcMain, shell } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const appPath = app.getAppPath();

// RUTAS DEV
// const tailscalePath = path.join(appPath, 'src', 'resources', 'utils', 'tailscale.exe');
// const tailscaledPath = path.join(appPath, 'src', 'resources', 'utils', 'tailscaled.exe');
// RUTAS PROD
const tailscalePath = path.join(appPath, '..', 'utils', 'tailscale.exe');
const tailscaledPath = path.join(appPath, '..', 'utils', 'tailscaled.exe');

let loginWindow; // Declarar la variable global

// Promisify exec for cleaner async handling
const execPromise = util.promisify(exec);

let mainWindow;
const options = {
  name: 'Rud1App',
  icns: '/src/assets/icon.icns'
};

app.on('ready', () => {

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

  mainWindow.webContents.setUserAgent('rud1-electron-app');
  mainWindow.loadURL('https://rud1.vercel.app');
  mainWindow.maximize();
  mainWindow.focus();

  ipcMain.on('connect-vpn', async (event) => {
    exec('net start tailscale', (error) => {
      if (error) {
        console.error('Error al iniciar servicio Tailscale:', error);
      }
    });
    exec(tailscaledPath, (error) => {
      if (error) {
        console.error('Error al iniciar servicio Tailscale:', error);
      }
    });

    try {
      // Start tailscaled without monitor flag (fixing potential issue)
      // await execPromise(`${tailscaledPath}`, {});

      // Connect to Tailscale VPN
      const { stdout, stderr } = await execPromise(`${tailscalePath} up --unattended --timeout 120s --reset`, options);


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
      const { stdout, stderr } = await execPromise(`${tailscalePath} status`);

      const result = parseTailscaleStatus(stdout, stderr);
      event.reply('tailscale-status-reply', result);
    } catch (error) {
      // Check for authentication URL
      const urlRegex = /(https:\/\/login\.tailscale\.com\/.*)/;
      const match = error.stdout.match(urlRegex);

      if (match) {
        console.log('Se necesita iniciar sesión en:', match[1]);

        // Comprobar si la ventana de login ya está abierta
        if (!loginWindow || loginWindow.isDestroyed()) {
          // Si no está abierta o ha sido destruida, abrir una nueva ventana de login
          loginWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: { nodeIntegration: true }
          });

          loginWindow.loadURL(match[1]);

          loginWindow.on('close', () => {
            console.log("Ventana de inicio de sesión cerrada");
            event.reply('vpn-status', 'Autenticación completada');
            loginWindow = null; // Limpiar la referencia cuando se cierre la ventana
          });
        } else {
          console.log('La ventana de login ya está abierta.');
        }
      }

      console.error('Error al obtener estado de Tailscale:', error);
      event.reply('tailscale-status-reply', { status: 'desconocido', ip: null });
    }
  });
  ipcMain.on('tailscale-down', async (event) => {
    stopTailscale(event);
  });

  ipcMain.on('open-config', () => {
    shell.openExternal('https://rud1.vercel.app/config');
  });

  function stopTailscale(event) {
    exec(`${tailscalePath} down`, (error) => {
      if (error) {
        console.error('Error al desconectar VPN:', error);
        if (event) event.reply('tailscale-down-reply', 'Error');
        return;
      }
      console.log('VPN Desconectada');
      if (event) event.reply('tailscale-down-reply', 'Desconectada');
    });
  }

  function startVirtualHere() {
    exec('tasklist | findstr /i "vhserver.exe"', (err, stdout) => {
      if (stdout) {
        exec('taskkill /im vhserver.exe /F', () => {
          launchVHServer();
        });
      } else {
        launchVHServer();
      }
    });
  }

  function launchVHServer() {
    const vhserverPath = path.join(__dirname, 'resources', 'utils', 'vhserver.exe');
    exec(`${vhserverPath} -q ES-AR`, (error) => {
      if (error) {
        console.error('Error al iniciar VirtualHere:', error);
      } else {
        console.log('VirtualHere iniciado');
      }
    });
  }

  app.on("browser-window-created", (e, win) => {
    win.removeMenu();
  });

  app.on('before-quit', () => {
    stopTailscale(null);
    exec('taskkill /im tailscale.exe /F');
    exec('taskkill /im tailscale-ipn.exe /F');
    exec('taskkill /im tailscaled.exe /F');
    exec('taskkill /im vhserver.exe /F');
  });
});

function parseTailscaleStatus(output, error) {
  if (output.includes("stopped") || error.includes("stopped")) {
    return {
      status: 'inactivo',
      ip: null
    };
  }

  const lines = output.split('\n');
  for (let line of lines) {
    if (line.includes('active')) {
      const parts = line.trim().split(/\s+/);
      const ip = parts[0];
      return {
        status: 'activo',
        ip: ip
      };
    }
  }

  return {
    status: 'desconocido',
    ip: null
  };
}
