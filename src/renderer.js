const connectButton = document.getElementById('connect-vpn');
const configButton = document.getElementById('open-config');
const statusText = document.getElementById('vpn-status');

connectButton.onclick = async () => {
  statusText.textContent = 'Conectando...';
  try {
    const result = await window.electronAPI.connectVPN();
    statusText.textContent = `VPN: ${result}`;
  } catch (error) {
    statusText.textContent = 'VPN: Error';
  }
};

configButton.onclick = () => {
  window.electronAPI.openConfig();
};