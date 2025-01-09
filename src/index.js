const { app, BrowserWindow } = require('electron');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const sudo = require('exec-root')
const log = require('electron-log');

const options = {
  name: 'Rud1',
  icns: path.join(__dirname, 'assets', 'icon.icns'),
};

let mainWindow;

console.log = log.log;
Object.assign(console, log.functions);


app.setAppLogsPath(path.join(app.getPath('userData'), 'logs'));

app.on('ready', () => {
  log.initialize();

  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    autoHideMenuBar: true,
    fullscreen: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  mainWindow.maximize();
  mainWindow.loadURL('https://rud1.vercel.app'); // Reemplaza con la URL de tu panel de administración
  mainWindow.show();

  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    console.log('Descargando archivo:', item.getFilename());
    const filePath = path.join(app.getPath('downloads'), item.getFilename());

    item.setSavePath(filePath);

    item.on('done', (event, state) => {

      if (state === 'completed') {
        console.log(`Descarga completada: ${filePath}`);

        connectVPN(filePath);

      } else {
        console.log(`Descarga fallida: ${state}`);
      }
    });
  });

  function connectVPN(configPath) {
    sudo.exec('taskkill /IM wireguard.exe /F', options).finally(() => {

      const wireguardPath = path.join(__dirname, 'resources', 'utils', 'wireguard.exe');

      (async () => {
        const { error, stdout, stderr } = await sudo.exec(`"${wireguardPath}" /installtunnelservice "${configPath}"`, options)
        if (error) {
          console.error(`Error al conectar la VPN: ${error.message}`);
          throw error
        };
        console.log(`VPN conectada: ${stdout}`);

        startVirtualHere();
      })()
    })


  }

  function startVirtualHere() {
    sudo.exec('taskkill /IM vhserver.exe /F', options).finally(() => {

      const vhserverPath = path.join(__dirname, 'resources', 'utils', 'vhserver.exe');
      const serverIP = '10.7.0.1'; // Reemplaza con la IP del servidor

      (async () => {
        const { error, stdout, stderr } = await sudo.exec(`"${vhserverPath}" -q ES-AR`, options)
        if (error) {
          console.error(`Error al iniciar VirtualHere Server: ${error.message}`);

          throw error
        };
        console.log(`VirtualHere Server iniciado: ${stdout}`);

      })()

    }
    )
  }
});

app.on('before-quit', () => {
  sudo.exec('taskkill /IM wireguard.exe /F', options);
  sudo.exec('taskkill /IM vhserver.exe /F', options);

});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});