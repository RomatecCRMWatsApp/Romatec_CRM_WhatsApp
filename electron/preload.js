// Preload script — roda no contexto isolado antes do carregamento da página
// Não expõe APIs do Node para a página (segurança)
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  platform: process.platform,
  version: process.env.npm_package_version || '1.1.1',
});
