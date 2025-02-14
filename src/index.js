const { app, BrowserWindow, BrowserView, ipcMain } = require('electron');
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
let controlView;

console.log = log.log;
Object.assign(console, log.functions);


app.setAppLogsPath(path.join(app.getPath('userData'), 'logs'));

ipcMain.on("toggle-vpn", (event) => {
  console.log("Click recibido")

  exec("wg-quick up wg0", (error, stdout) => {
    if (error) {
      console.error("Error al conectar VPN:", error);
      event.reply("vpn-status", "Error");
    } else {
      console.log("VPN conectada:", stdout);
      event.reply("vpn-status", "Conectada");
    }
  });
});

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

  controlView = new BrowserView({
    webPreferences: {
      nodeIntegration: true, // Permite ejecutar código Node en la barra de control
    },
  });

  mainWindow.maximize();
  mainWindow.loadURL('https://rud1.vercel.app'); // Reemplaza con la URL de tu panel de administración

  mainWindow.setBrowserView(controlView);
  controlView.setBounds({ x: 0, y: 0, width: 1920, height: 50 }); // Tamaño de la barra
  controlView.webContents.loadURL(`file://${__dirname}/index.html`);

  mainWindow.show();

  setInterval(() => {
    checkVPNStatus();
    // isWireGuardRunning();
  }, 500);

  mainWindow.webContents.session.on('will-download', (event, item, webContents) => {
    console.log('Descargando archivo:', item.getFilename());
    const filePath = path.join(app.getPath('downloads'), 'wg0.conf');

    item.setSavePath(filePath);

    item.on('done', (event, state) => {

      if (state === 'completed') {
        console.log(`Descarga completada: ${filePath}`);

        mainWindow.webContents.once('dom-ready', () => {
          mainWindow.webContents.executeJavaScript("toast.sucess('test');")
        })

        connectVPN(filePath);

      } else {
        console.log(`Descarga fallida: ${state}`);

        mainWindow.webContents.once('dom-ready', () => {
          mainWindow.webContents.executeJavaScript("toast.error('test');")
        })
      }
    });
  });

  function checkVPNStatus() {
    exec('wg show interfaces', (error, stdout) => {
      const isConnected = stdout.includes('wg0');
      console.log(mainWindow.webContents)
      mainWindow.webContents.send('vpn-status', isConnected);
    });
  }

  function connectVPN(configPath) {

    sudo.exec('tasklist | find /i "wireguard.exe" && taskkill /im wireguard.exe /F', options).finally(() => {

      const wireguardPath = path.join(__dirname, 'resources', 'utils', 'wireguard.exe');

      (async () => {
        const { error, stdout, stderr } = await sudo.exec(`"${wireguardPath}" /installtunnelservice "${configPath}"`, options)
        if (error) {
          console.error(`Error al conectar la VPN: ${error.message}`);

          mainWindow.webContents.once('dom-ready', () => {
            mainWindow.webContents.executeJavaScript("toast.error('test');")
          })

          throw error
        };
        console.log(`VPN conectada: ${stdout}`);

        mainWindow.webContents.once('dom-ready', () => {
          mainWindow.webContents.executeJavaScript("toast.sucess('test');")
        })

        startVirtualHere();
      })()
    })


  }

  function startVirtualHere() {
    sudo.exec('tasklist | find /i "vhserver.exe" && taskkill /im vhserver.exe /F', options).finally(() => {

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
  sudo.exec('tasklist | find /i "wireguard.exe" && taskkill /im wireguard.exe /F', options);
  sudo.exec('tasklist | find /i "vhserver.exe" && taskkill /im vhserver.exe /F', options);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
