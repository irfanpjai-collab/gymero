'use strict'

const {
  app, Tray, Menu, shell,
  BrowserWindow, ipcMain, nativeImage,
} = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs   = require('fs')
const http = require('http')

// ── Single-instance lock ───────────────────────────────────────────────────────

if (!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

app.on('second-instance', () => {
  shell.openExternal('http://localhost:3000')
})

// ── Config ─────────────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(app.getPath('userData'), 'greenpower-crm.json')

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) } catch { return {} }
}

function saveConfig(data) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2), 'utf8')
}

// ── Paths ──────────────────────────────────────────────────────────────────────

const PACKED  = app.isPackaged
const RES     = PACKED ? process.resourcesPath : __dirname

// CRM: Next.js standalone server
const CRM_DIR    = path.join(RES, 'crm')
const CRM_SERVER = path.join(CRM_DIR, 'server.js')

// No local biometric bridge anymore — the device pushes to the cloud (ADMS)
// directly, so there's nothing local for this app to spawn for that purpose.

// Tray icon
const ICON_PATH = PACKED
  ? path.join(RES, 'icon.png')
  : path.join(__dirname, 'assets', 'icon.png')

// ── State ──────────────────────────────────────────────────────────────────────

let tray        = null
let settingsWin = null
let crmProc     = null
let crmReady    = false

// ── CRM server ─────────────────────────────────────────────────────────────────

function startCRM() {
  if (crmProc || !fs.existsSync(CRM_SERVER)) return

  // ELECTRON_RUN_AS_NODE lets the Electron binary act as plain Node.js,
  // so we don't need a separate node.exe bundled.
  crmProc = spawn(process.execPath, [CRM_SERVER], {
    cwd: CRM_DIR,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT:     '3000',
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
    },
  })

  crmProc.stdout?.on('data', (chunk) => {
    if (/ready|started|listening/i.test(chunk.toString())) {
      crmReady = true
      updateTray()
    }
  })

  crmProc.on('exit', () => {
    crmReady = false
    crmProc = null
    updateTray()
  })
}

// ── Controls ───────────────────────────────────────────────────────────────────

function stopAll() {
  if (crmProc) { crmProc.kill('SIGTERM'); crmProc = null; crmReady = false }
}

function restart() {
  stopAll()
  setTimeout(() => { startCRM() }, 1500)
}

// ── Health polling ─────────────────────────────────────────────────────────────

function ping(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, (res) => {
      res.resume()
      resolve(res.statusCode < 500)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(2000, () => { req.destroy(); resolve(false) })
  })
}

setInterval(async () => {
  const was = crmReady
  crmReady = await ping(3000)
  if (was !== crmReady) updateTray()
}, 15_000)

// ── Tray ───────────────────────────────────────────────────────────────────────

function updateTray() {
  if (!tray) return

  tray.setToolTip(
    'Green Power CRM\n' +
    `CRM: ${crmReady ? '● Running' : '○ Starting…'}`
  )

  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label:   `CRM Server    ${crmReady ? '●' : '○'}  ${crmReady ? 'Running' : 'Starting…'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Open CRM',
      click: () => shell.openExternal('http://localhost:3000'),
    },
    { type: 'separator' },
    { label: 'Restart Services', click: restart },
    { label: 'Settings…',        click: openSettings },
    { type: 'separator' },
    { label: 'Quit', click: () => { stopAll(); app.quit() } },
  ]))
}

// ── Settings window ────────────────────────────────────────────────────────────

function openSettings() {
  if (settingsWin) { settingsWin.focus(); return }

  settingsWin = new BrowserWindow({
    width:  480,
    height: 380,
    resizable: false,
    title:  'Settings — Green Power CRM',
    autoHideMenuBar: true,
    icon:   ICON_PATH,
    webPreferences: {
      nodeIntegration:  true,
      contextIsolation: false,
    },
  })

  settingsWin.loadFile(path.join(__dirname, 'settings.html'))
  settingsWin.on('closed', () => { settingsWin = null })
}

ipcMain.handle('get-config', () => loadConfig())

ipcMain.handle('save-config', (_, data) => {
  saveConfig(data)
  // Apply auto-start preference
  app.setLoginItemSettings({
    openAtLogin: data.autoStart ?? false,
    path:        process.execPath,
    args:        [],
  })
  restart()
  return true
})

// ── Bootstrap ──────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  app.setAppUserModelId('com.greenpowergym.crm')

  // Keep app alive when all windows are closed (lives in tray)
  app.on('window-all-closed', (e) => e.preventDefault())

  // Tray icon
  const img  = nativeImage.createFromPath(ICON_PATH)
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.on('double-click', () => shell.openExternal('http://localhost:3000'))

  updateTray()
  startCRM()

  const cfg = loadConfig()

  // Apply saved auto-start
  app.setLoginItemSettings({
    openAtLogin: cfg.autoStart ?? false,
    path:        process.execPath,
    args:        [],
  })
})

app.on('before-quit', stopAll)
