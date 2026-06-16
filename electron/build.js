#!/usr/bin/env node
'use strict'

/**
 * Build pipeline for the Green Power CRM desktop app.
 *
 * Steps:
 *   1. npm run build (Next.js → .next/standalone)
 *   2. Assemble CRM bundle  →  electron/build/crm/
 *   3. Copy logo as tray icon
 *   4. Verify bridge (Python or compiled exe)
 *   5. electron-builder --win --x64  →  dist/
 *
 * Run from the project root:
 *   cd electron && npm run build
 */

const { execSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const ROOT      = path.join(__dirname, '..')
const ELEC      = __dirname
const BUILD     = path.join(ELEC, 'build')
const CRM_OUT   = path.join(BUILD, 'crm')
const ASSETS    = path.join(ELEC, 'assets')
const BRIDGE    = path.join(ELEC, 'bridge')

// ── Helpers ────────────────────────────────────────────────────────────────────

function run(cmd, cwd = ROOT) {
  console.log(`\n> ${cmd}`)
  execSync(cmd, { cwd, stdio: 'inherit' })
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  skip (not found): ${path.relative(ROOT, src)}`)
    return
  }
  fs.mkdirSync(dest, { recursive: true })
  fs.cpSync(src, dest, { recursive: true, force: true })
  console.log(`  ✓  ${path.relative(ROOT, src)}  →  ${path.relative(ROOT, dest)}`)
}

function copyFile(src, dest) {
  if (!fs.existsSync(src)) {
    console.warn(`  skip (not found): ${path.relative(ROOT, src)}`)
    return
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
  console.log(`  ✓  ${path.relative(ROOT, src)}  →  ${path.relative(ROOT, dest)}`)
}

// ── 1. Next.js build ───────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log('  Step 1 — Next.js build')
console.log('══════════════════════════════════════════')
run('npm run build')

const STANDALONE = path.join(ROOT, '.next', 'standalone')
if (!fs.existsSync(STANDALONE)) {
  console.error('\nERROR: .next/standalone not found.')
  console.error('Make sure next.config.ts has:  output: "standalone"')
  process.exit(1)
}

// ── 2. Assemble CRM bundle ─────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log('  Step 2 — Assemble CRM bundle')
console.log('══════════════════════════════════════════')
fs.rmSync(CRM_OUT, { recursive: true, force: true })

copyDir(STANDALONE,                            CRM_OUT)
copyDir(path.join(ROOT, '.next', 'static'),    path.join(CRM_OUT, '.next', 'static'))
copyDir(path.join(ROOT, 'public'),             path.join(CRM_OUT, 'public'))

// ── 3. Tray icon ───────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log('  Step 3 — Tray icon')
console.log('══════════════════════════════════════════')
copyFile(path.join(ROOT, 'public', 'logo.png'), path.join(ASSETS, 'icon.png'))

// ── 4. Bridge — compile biometric-bridge/ with PyInstaller ───────────────────

console.log('\n══════════════════════════════════════════')
console.log('  Step 4 — Biometric bridge')
console.log('══════════════════════════════════════════')
fs.mkdirSync(BRIDGE, { recursive: true })

const bridgeExe = path.join(BRIDGE, 'biometric-bridge.exe')
const bridgeSrc = path.join(ROOT, 'biometric-bridge', 'main.py')

if (fs.existsSync(bridgeExe)) {
  console.log('  ✓  biometric-bridge.exe already exists — skipping PyInstaller')
} else if (fs.existsSync(bridgeSrc)) {
  console.log('  Running PyInstaller on biometric-bridge/main.py …')
  try {
    run(
      `pyinstaller biometric-bridge/main.py --onefile --name biometric-bridge` +
      ` --distpath electron/bridge --noconfirm` +
      ` --add-data "biometric-bridge/.env.example;."`,
      ROOT,
    )
    console.log('  ✓  biometric-bridge.exe built')
  } catch {
    console.warn('  ⚠  PyInstaller failed — bridge will run as Python script (requires Python on target PC)')
    copyDir(path.join(ROOT, 'biometric-bridge'), BRIDGE)
  }
} else {
  console.warn('  ⚠  biometric-bridge/ not found in project root')
  console.warn('     Continuing without bridge — biometric will show Offline.')
}

// ── 5. electron-builder ────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════')
console.log('  Step 5 — electron-builder')
console.log('══════════════════════════════════════════')
run('npx electron-builder --win --x64', ELEC)

console.log('\n✅  Done!  Installer is in dist/')
console.log('    GreenPowerCRM Setup.exe  →  install on any Windows PC on the gym network\n')
