const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { exec, spawn } = require('child_process');
const path = require('path');
const sudo = require('exec-root')

const tailscalePath = path.join(__dirname, 'resources', 'utils', 'tailscale.exe');


let mainWindow;
const options = {
  name: 'Rud1App',
  icns: '/src/assets/icon.icns'
};
app.on('ready', () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    autoHideMenuBar: true,
  });

  mainWindow.webContents.setUserAgent('rud1-electron-app');
  mainWindow.loadURL('https://rud1.vercel.app');

  ipcMain.on('connect-vpn', async (event) => {
    console.log("ConnectVPN");
  
    return new Promise(async (resolve, reject) => {
      const child = exec(`"${tailscalePath}" up --unattended --timeout 5s`, options);
  
      let stdoutData = '';
  
      child.stdout.on('data', (data) => {
        stdoutData += data;
        console.log(`VPN Output: ${data}`);
  
        // Detectamos si la salida contiene una URL de autenticación
        const urlRegex = /(https:\/\/login\.tailscale\.com\/.*)/;
        const match = data.match(urlRegex);
  
        if (match) {
          console.log('Se necesita iniciar sesión en:', match[1]);
  
          // Abrimos una nueva ventana para iniciar sesión
          const loginWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
              nodeIntegration: true
            }
          });
  
          loginWindow.loadURL(match[1]);
  
          loginWindow.on('close', () => {
            console.log("Ventana de inicio de sesión cerrada");
            resolve('Autenticación Completada');
          });
        }
      });
  
      child.stderr.on('data', (data) => {
        console.error(`VPN Error: ${data}`);
      });
  
      child.on('close', (code) => {
        console.log(`Proceso finalizado con código: ${code}`);
        if (stdoutData.includes('Success.') || code === 0) {
          console.log('VPN Conectada');
          startVirtualHere();
          resolve('Conectada');
        } else {
          reject('Error');
        }
      });
  
      child.on('error', (error) => {
        console.error('Error al conectar VPN:', error);
        reject('Error');
      });
    });
  });
  

  ipcMain.on('open-config', () => {
    shell.openExternal('https://rud1.vercel.app/config');
  });

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
    exec(`"${vhserverPath}" -q ES-AR`, (error) => {
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
    exec(`"${tailscalePath}" down`, options)

    exec('taskkill /im tailscale.exe /F');
    exec('taskkill /im tailscale-ipn.exe /F');
    exec('taskkill /im tailscaled.exe /F');
    exec('taskkill /im vhserver.exe /F');
  });
});