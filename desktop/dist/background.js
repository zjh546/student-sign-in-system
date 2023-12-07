var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));

// src/desktop/background.ts
var import_path = __toESM(require("path"));
var import_electron = require("electron");
function createWindow() {
  const win = new import_electron.BrowserWindow({
    width: 1200,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    frame: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: true,
      webSecurity: false,
      preload: import_path.default.resolve(__dirname, "./preload.js")
    }
  });
  import_electron.Menu.setApplicationMenu(null);
  import_electron.ipcMain.on("HeaderMin" /* HeaderMin */, () => {
    win.minimize();
  });
  import_electron.ipcMain.on("HeaderMax" /* HeaderMax */, () => {
    win.isMaximized() ? win.restore() : win.maximize();
  });
  import_electron.ipcMain.on("HeaderClose" /* HeaderClose */, () => {
    win.close();
  });
  import_electron.ipcMain.handle("DownloadImage", (event, downloadImgPath, downloadImg) => {
    return new Promise((resolve, reject) => {
      win.webContents.downloadURL(downloadImgPath);
      win.webContents.session.once("will-download", (event2, item, webContents) => {
        item.once("done", (event3, state) => {
          if (state === "completed") {
            resolve("ok");
          } else {
            reject("error");
          }
        });
      });
    });
  });
  if (process.argv[2]) {
    win.loadURL(process.argv[2]);
    win.webContents.openDevTools();
  } else {
    win.loadFile("index.html");
  }
}
import_electron.app.whenReady().then(createWindow);
import_electron.app.on("window-all-closed", function() {
  if (process.platform !== "darwin")
    import_electron.app.quit();
});
