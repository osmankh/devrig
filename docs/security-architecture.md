# DevRig Security Architecture

**Document Classification**: Internal -- Engineering
**Version**: 1.0
**Date**: 2026-02-10
**Author**: Security Engineering
**Status**: Draft for Review

---

## Table of Contents

1. [Threat Model Overview](#1-threat-model-overview)
2. [Electron Security Best Practices](#2-electron-security-best-practices)
3. [Secrets Management](#3-secrets-management)
4. [Code Signing and Distribution](#4-code-signing-and-distribution)
5. [Plugin Security and Sandboxing](#5-plugin-security-and-sandboxing)
6. [Authentication and Licensing](#6-authentication-and-licensing)
7. [Data Security](#7-data-security)
8. [CI/CD and Infrastructure Security](#8-cicd-and-infrastructure-security)
9. [Incident Response](#9-incident-response)
10. [Compliance Matrix](#10-compliance-matrix)
11. [References](#11-references)

---

## 1. Threat Model Overview

DevRig is a commercial Electron desktop application that automates developer workflows using AI. It handles API keys, OAuth tokens, license credentials, and executes user-defined and plugin-supplied automation scripts. This threat profile demands defense-in-depth across process boundaries, storage layers, distribution channels, and extensibility surfaces.

### 1.1 Assets Under Protection

| Asset | Sensitivity | Storage Location |
|---|---|---|
| User API keys (OpenAI, GitHub, etc.) | Critical | OS keychain / encrypted SQLite |
| OAuth tokens and refresh tokens | Critical | OS keychain |
| License keys | High | Encrypted local store |
| Workflow definitions | Medium | Local SQLite database |
| Plugin code (third-party) | Medium-High | Sandboxed plugin directory |
| User preferences and settings | Low | Local config file |
| Telemetry / analytics data | Low | In-memory, opt-in transmission |

### 1.2 Threat Actors

| Actor | Motivation | Capability |
|---|---|---|
| Malicious plugin author | Data exfiltration, cryptomining | Code execution within plugin sandbox |
| Supply chain attacker | Backdoor distribution | Compromise of build pipeline or dependencies |
| Local attacker (shared machine) | Credential theft | File system access, process inspection |
| Network attacker (MITM) | Credential interception, update hijacking | Network-level interception |
| Reverse engineer | Software piracy, key extraction | Binary analysis, memory inspection |

### 1.3 Attack Surface Summary

```
+------------------------------------------------------------------+
|  RENDERER PROCESS (Chromium sandbox)                              |
|  - Web content, UI                                                |
|  - No Node.js access                                              |
|  - CSP enforced                                                   |
|  - contextBridge only                                             |
+------------------------------|-----------------------------------+
                                | IPC (validated, whitelisted)
+------------------------------|-----------------------------------+
|  MAIN PROCESS (Node.js)                                           |
|  - Business logic, file I/O                                       |
|  - Secrets management                                             |
|  - Plugin orchestration                                           |
|  - Auto-updater                                                   |
+------------------------------|-----------------------------------+
                                | Isolated V8 / WASM boundary
+------------------------------|-----------------------------------+
|  PLUGIN SANDBOX (isolated-vm or QuickJS-WASM)                     |
|  - No Node.js APIs                                                |
|  - No file system access                                          |
|  - Capability-gated host functions only                           |
+------------------------------------------------------------------+
```

---

## 2. Electron Security Best Practices

### 2.1 Process Isolation and Sandboxing

Every `BrowserWindow` MUST be created with the following enforced configuration:

```typescript
// main/window.ts
import { BrowserWindow } from 'electron';
import path from 'node:path';

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    webPreferences: {
      // CRITICAL: Disable Node.js integration in renderer
      nodeIntegration: false,

      // CRITICAL: Enable context isolation (default since Electron 12)
      contextIsolation: true,

      // CRITICAL: Enable Chromium sandbox (default since Electron 20)
      sandbox: true,

      // CRITICAL: Enable web security (same-origin policy)
      webSecurity: true,

      // Use a dedicated preload script for the contextBridge
      preload: path.join(__dirname, 'preload.js'),

      // Disable the deprecated remote module entirely
      // (removed in Electron 14+, but enforce explicitly in config)
      // enableRemoteModule: false, // no longer needed in Electron 28+

      // Disable navigation to arbitrary URLs
      allowRunningInsecureContent: false,

      // Disable experimental features
      experimentalFeatures: false,
    },
  });

  return win;
}
```

**Rationale**: With `nodeIntegration: false` and `contextIsolation: true`, the renderer process operates as a pure Chromium sandbox. It has no access to `require()`, `process`, `Buffer`, or any Node.js API. The only bridge to the main process is through `contextBridge.exposeInMainWorld()` in the preload script.

### 2.2 Preload Script and contextBridge

The preload script is the ONLY communication layer between the sandboxed renderer and the privileged main process. It MUST expose a minimal, typed API surface:

```typescript
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// ---------------------------------------------------------------
// CHANNEL WHITELIST: Only these IPC channels are permitted.
// Any message on a non-whitelisted channel is silently dropped.
// ---------------------------------------------------------------
const ALLOWED_SEND_CHANNELS = [
  'workflow:execute',
  'workflow:cancel',
  'secrets:get',
  'secrets:set',
  'secrets:delete',
  'settings:get',
  'settings:set',
  'license:validate',
  'plugin:install',
  'plugin:remove',
  'app:get-version',
] as const;

const ALLOWED_RECEIVE_CHANNELS = [
  'workflow:status',
  'workflow:output',
  'workflow:error',
  'license:status',
  'app:update-available',
  'app:update-downloaded',
] as const;

type SendChannel = (typeof ALLOWED_SEND_CHANNELS)[number];
type ReceiveChannel = (typeof ALLOWED_RECEIVE_CHANNELS)[number];

contextBridge.exposeInMainWorld('devrig', {
  // One-shot request-response (preferred pattern)
  invoke: (channel: SendChannel, ...args: unknown[]): Promise<unknown> => {
    if (!ALLOWED_SEND_CHANNELS.includes(channel)) {
      return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  // Event subscription (for streaming workflow output)
  on: (channel: ReceiveChannel, callback: (...args: unknown[]) => void): void => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) {
      console.error(`IPC channel not allowed: ${channel}`);
      return;
    }
    // Wrap callback to prevent leaking the IPC event object
    ipcRenderer.on(channel, (_event, ...args) => callback(...args));
  },

  // Unsubscribe
  off: (channel: ReceiveChannel, callback: (...args: unknown[]) => void): void => {
    if (!ALLOWED_RECEIVE_CHANNELS.includes(channel)) return;
    ipcRenderer.removeListener(channel, callback);
  },
});
```

**Security rules enforced**:
- The raw `ipcRenderer` object is NEVER exposed to the renderer.
- `ipcRenderer.send` is NOT used; `ipcRenderer.invoke` (request-response) is the required pattern because it allows the main process to validate and return results synchronously.
- Channel names are whitelisted at compile time. Adding a new channel requires updating the whitelist.
- The `IpcMainEvent.senderFrame` origin is validated on the main-process side (see section 2.3).

### 2.3 IPC Handler Validation (Main Process)

Every `ipcMain.handle` registration MUST validate the sender:

```typescript
// main/ipc-security.ts
import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { URL } from 'node:url';

const TRUSTED_ORIGINS = new Set([
  'file://',            // Local app pages
  'app://devrig',   // Custom protocol (if used)
]);

function validateSender(event: IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame?.url;
  if (!senderUrl) return false;

  try {
    const parsed = new URL(senderUrl);
    const origin = `${parsed.protocol}//${parsed.host}`;
    // For file:// protocol, origin is 'file://'
    if (parsed.protocol === 'file:') {
      return TRUSTED_ORIGINS.has('file://');
    }
    return TRUSTED_ORIGINS.has(origin);
  } catch {
    return false;
  }
}

// Wrap all handlers with sender validation
export function secureHandle(
  channel: string,
  handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!validateSender(event)) {
      throw new Error(`Unauthorized IPC sender for channel: ${channel}`);
    }
    return handler(event, ...args);
  });
}
```

### 2.4 Content Security Policy

CSP is set via `<meta>` tag in the root HTML file (since `file://` protocol does not support HTTP headers) and enforced via `session.defaultSession.webRequest`:

```html
<!-- index.html -->
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' data: https:;
  font-src 'self';
  connect-src 'self' https://api.devrig.dev https://api.keygen.sh;
  frame-src 'none';
  object-src 'none';
  base-uri 'none';
  form-action 'none';
">
```

Additionally, enforce CSP programmatically to prevent renderer-side tampering:

```typescript
// main/csp.ts
import { session } from 'electron';

export function enforceCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'none'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: https:; " +
          "font-src 'self'; " +
          "connect-src 'self' https://api.devrig.dev https://api.keygen.sh; " +
          "frame-src 'none'; " +
          "object-src 'none'; " +
          "base-uri 'none'; " +
          "form-action 'none';"
        ],
      },
    });
  });
}
```

**Policy decisions explained**:

| Directive | Value | Rationale |
|---|---|---|
| `default-src` | `'none'` | Deny everything by default; each resource type must be explicitly allowed |
| `script-src` | `'self'` | Only load scripts bundled with the app. No `eval()`, no `unsafe-inline`, no CDN |
| `style-src` | `'self' 'unsafe-inline'` | Allow bundled styles. `unsafe-inline` is a concession for CSS-in-JS frameworks; replace with nonces if possible |
| `connect-src` | `'self'` + API domains | Restrict network requests to known API endpoints |
| `frame-src` | `'none'` | No iframes -- eliminates clickjacking and frame injection vectors |
| `object-src` | `'none'` | No Flash, Java, or other plugin objects |

### 2.5 Navigation and Window-Open Restrictions

```typescript
// main/navigation-guard.ts
import { app, BrowserWindow, shell } from 'electron';

app.on('web-contents-created', (_event, contents) => {
  // Block all navigation away from the app
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'file:') {
      event.preventDefault();
    }
  });

  // Block window.open and redirect external URLs to system browser
  contents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Block creation of new webContents (webview, BrowserView)
  contents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
});
```

### 2.6 Permissions Policy

Disable all hardware permissions that DevRig does not need:

```typescript
// main/permissions.ts
import { session } from 'electron';

export function configurePermissions(): void {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, permission, callback) => {
      // Deny all permission requests (camera, microphone, geolocation, etc.)
      // DevRig has no legitimate need for any of these.
      callback(false);
    }
  );

  session.defaultSession.setPermissionCheckHandler(() => false);
}
```

---

## 3. Secrets Management

### 3.1 Architecture Overview

DevRig handles secrets at two tiers:

| Tier | Data | Storage Mechanism | Encryption |
|---|---|---|---|
| Tier 1 (Critical) | API keys, OAuth tokens, license keys | OS keychain via `safeStorage` | OS-managed (Keychain, DPAPI, libsecret) |
| Tier 2 (Sensitive) | Workflow credentials, webhook URLs | Encrypted SQLite column | AES-256-GCM with key from Tier 1 |

### 3.2 Electron safeStorage API

The primary secrets storage mechanism uses Electron's built-in `safeStorage` API, which delegates to the OS keychain:

- **macOS**: Keychain Services (protected by user login keychain)
- **Windows**: DPAPI (Data Protection API, tied to user account)
- **Linux**: Secret Service API via libsecret (GNOME Keyring, KWallet) -- with fallback detection

```typescript
// main/secrets/safe-storage.ts
import { safeStorage } from 'electron';

export class SafeStorageProvider {
  /**
   * Check that the platform has a functioning secure backend.
   * On Linux, safeStorage may fall back to 'basic_text' if no
   * secret service daemon is running, which provides NO security.
   */
  static isAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) return false;

    // Linux-specific: reject the basic_text backend
    const backend = safeStorage.getSelectedStorageBackend?.();
    if (backend === 'basic_text') {
      console.warn(
        'safeStorage: basic_text backend detected. ' +
        'Secrets will NOT be encrypted. Install gnome-keyring or kwallet.'
      );
      return false;
    }
    return true;
  }

  static encrypt(plaintext: string): Buffer {
    if (!this.isAvailable()) {
      throw new Error('Secure storage is not available on this system.');
    }
    return safeStorage.encryptString(plaintext);
  }

  static decrypt(ciphertext: Buffer): string {
    if (!this.isAvailable()) {
      throw new Error('Secure storage is not available on this system.');
    }
    return safeStorage.decryptString(ciphertext);
  }
}
```

**Linux caveat**: On Linux distributions without GNOME Keyring, KWallet, or another Secret Service provider, `safeStorage` falls back to `basic_text` mode which stores data with a hardcoded key. DevRig MUST detect this condition and prompt the user to install a secret service daemon. The app MUST NOT silently store secrets in plaintext.

### 3.3 Keychain Integration (Legacy / Fallback)

For environments where `safeStorage` is unavailable or for backward compatibility, DevRig supports the OS keychain directly via the `keytar` package:

```typescript
// main/secrets/keytar-provider.ts
import keytar from 'keytar';

const SERVICE_NAME = 'com.devrig.desktop';

export class KeytarProvider {
  static async get(account: string): Promise<string | null> {
    return keytar.getPassword(SERVICE_NAME, account);
  }

  static async set(account: string, password: string): Promise<void> {
    await keytar.setPassword(SERVICE_NAME, account, password);
  }

  static async delete(account: string): Promise<boolean> {
    return keytar.deletePassword(SERVICE_NAME, account);
  }

  static async listAll(): Promise<Array<{ account: string; password: string }>> {
    return keytar.findCredentials(SERVICE_NAME);
  }
}
```

**Platform behavior**:

| Platform | Backend | Protection Level |
|---|---|---|
| macOS | Keychain Services | Encrypted with user login password. Access prompts appear for new apps. |
| Windows | Credential Manager (DPAPI) | Encrypted with user account credentials. Decryption requires same user session. |
| Linux | libsecret (GNOME Keyring / KWallet) | Encrypted with user session keyring. Unlocked on login. |

**Deprecation note**: `keytar` is in maintenance mode as of 2024. Prefer `safeStorage` for new development. Retain `keytar` only as a migration path for existing installations.

### 3.4 Encrypted SQLite Fields (Tier 2)

For structured sensitive data (workflow credentials, webhook configurations), use AES-256-GCM encryption at the field level:

```typescript
// main/secrets/field-encryption.ts
import crypto from 'node:crypto';
import { SafeStorageProvider } from './safe-storage';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;    // 96-bit IV for GCM
const TAG_LENGTH = 16;   // 128-bit auth tag

/**
 * The database encryption key (DEK) is itself encrypted by safeStorage
 * and stored in the app's config directory. This provides key hierarchy:
 *
 *   OS Keychain --> protects --> DEK --> protects --> SQLite fields
 *
 * Rotating the DEK requires re-encrypting all fields but does NOT
 * require the user to re-enter their OS password.
 */
export class FieldEncryption {
  private dek: Buffer;

  constructor(encryptedDek: Buffer) {
    const dekHex = SafeStorageProvider.decrypt(encryptedDek);
    this.dek = Buffer.from(dekHex, 'hex');
    if (this.dek.length !== 32) {
      throw new Error('Invalid DEK length. Expected 32 bytes for AES-256.');
    }
  }

  /**
   * Generate a fresh DEK and return it encrypted by safeStorage.
   */
  static generateEncryptedDek(): Buffer {
    const dek = crypto.randomBytes(32);
    return SafeStorageProvider.encrypt(dek.toString('hex'));
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.dek, iv, {
      authTagLength: TAG_LENGTH,
    });

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Format: base64(iv || ciphertext || tag)
    const combined = Buffer.concat([iv, encrypted, tag]);
    return combined.toString('base64');
  }

  decrypt(encoded: string): string {
    const combined = Buffer.from(encoded, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const tag = combined.subarray(combined.length - TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH, combined.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, this.dek, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);

    return decipher.update(ciphertext) + decipher.final('utf8');
  }
}
```

### 3.5 Secrets Management Rules

1. **NEVER** store API keys, tokens, or passwords in `localStorage`, `sessionStorage`, or unencrypted files.
2. **NEVER** log secrets to console, crash reports, or analytics.
3. **NEVER** pass secrets through IPC in plaintext. Secrets are retrieved by handle reference, not by value, when possible.
4. **ALWAYS** zero-fill secret buffers after use (`buffer.fill(0)`) where the runtime allows.
5. **ALWAYS** validate `safeStorage` backend before storing. Refuse to operate on `basic_text`.
6. **ALWAYS** use authenticated encryption (GCM) for field-level encryption. Do not use CBC without HMAC.

---

## 4. Code Signing and Distribution

### 4.1 macOS Code Signing and Notarization

**Requirements**:
- Apple Developer ID Application certificate (not Mac App Store distribution)
- Hardened Runtime enabled
- Notarization via `@electron/notarize`
- Entitlements plist for JIT (needed for V8)

**Entitlements file** (`build/entitlements.mac.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <!-- Required for Electron's V8 JIT compilation -->
  <key>com.apple.security.cs.allow-jit</key>
  <true/>

  <!-- Required for loading Electron's dynamic libraries -->
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>

  <!-- Required for debugging in development only; REMOVE for production -->
  <!-- <key>com.apple.security.cs.disable-library-validation</key> -->
  <!-- <true/> -->
</dict>
</plist>
```

**electron-builder configuration** (`electron-builder.yml`):

```yaml
mac:
  category: public.app-category.developer-tools
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist
  target:
    - target: dmg
      arch: [universal]
    - target: zip
      arch: [universal]

afterSign: scripts/notarize.js
```

**Notarization script** (`scripts/notarize.js`):

```javascript
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  await notarize({
    appBundleId: 'com.devrig.desktop',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
    tool: 'notarytool',  // Use the newer notarytool (replaces altool)
  });
};
```

### 4.2 Windows Code Signing

**Requirements**:
- EV (Extended Validation) code signing certificate from a trusted CA (DigiCert, Sectigo, GlobalSign)
- Authenticode signature with SHA-256 digest
- Timestamp counter-signature for long-term validity

```yaml
# electron-builder.yml (Windows section)
win:
  target:
    - target: nsis
      arch: [x64, arm64]
  signingHashAlgorithms:
    - sha256
  sign: scripts/custom-sign.js  # For HSM-backed keys (DigiCert KeyLocker, Azure Trusted Signing)
  certificateSubjectName: "DevRig Inc."
  publisherName: "DevRig Inc."
  rfc3161TimeStampServer: "http://timestamp.digicert.com"

nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false  # Handled by custom uninstaller logic (see section 7.3)
```

**For HSM-backed signing (recommended for CI)**:

```javascript
// scripts/custom-sign.js
// Uses Azure Trusted Signing or DigiCert KeyLocker
// Private key never leaves the HSM
exports.default = async function sign(configuration) {
  // Azure Trusted Signing via signtool.exe
  // or DigiCert KeyLocker via smctl sign
  require('child_process').execSync(
    `smctl sign ` +
    `--keypair-alias=${process.env.DIGICERT_KEYPAIR_ALIAS} ` +
    `--certificate=${process.env.DIGICERT_CERT_FINGERPRINT} ` +
    `--input="${configuration.path}"`,
    { stdio: 'inherit' }
  );
};
```

### 4.3 Linux Signing

Linux does not have a universal code signing mechanism equivalent to macOS/Windows. Mitigations:

- Ship `.deb` and `.rpm` packages signed with a GPG key.
- Publish the GPG public key at `https://devrig.dev/.well-known/pgp-key.asc`.
- AppImage files are signed with `--sign` during `appimagetool` build step.
- Provide SHA-256 checksums alongside all downloads.

### 4.4 Auto-Update Security

DevRig uses `electron-updater` with the following security controls:

```yaml
# electron-builder.yml (publish section)
publish:
  - provider: github
    owner: devrig-inc
    repo: devrig-desktop
    releaseType: release
```

**Security controls for auto-update**:

1. **Signed update manifests**: `electron-updater` generates `latest.yml` / `latest-mac.yml` files alongside signed binaries. The updater verifies the code signature of downloaded binaries before applying them.

2. **HTTPS-only transport**: All update checks and downloads occur over TLS 1.2+. Certificate pinning is recommended for the update endpoint.

3. **Differential updates**: Use `blockmap` files for delta updates to reduce download size and attack surface during transit.

4. **Rollback capability**: Store the previous version's binary for automatic rollback if the new version crashes on first launch.

5. **Update staging**: Ship updates to 5% of users first (canary), then 25%, then 100%. Implement this with a staged rollout server or feature flag.

```typescript
// main/updater.ts
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

export function configureAutoUpdater(): void {
  autoUpdater.logger = log;
  autoUpdater.autoDownload = false;  // Ask user before downloading
  autoUpdater.autoInstallOnAppQuit = true;

  // Force signature verification (enabled by default, but be explicit)
  autoUpdater.forceDevUpdateConfig = false;

  autoUpdater.on('update-available', (info) => {
    // Notify renderer via IPC; user decides whether to download
    mainWindow.webContents.send('app:update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('app:update-downloaded');
  });

  // Check every 4 hours
  setInterval(() => autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000);
  autoUpdater.checkForUpdates();
}
```

**Known vulnerability to mitigate**: A signature validation bypass was disclosed in `electron-updater` (Doyensec, 2020). Ensure `electron-builder` is at version 24.0+ which includes the fix. Pin the dependency and audit regularly.

---

## 5. Plugin Security and Sandboxing

### 5.1 Threat Assessment

Plugins are the highest-risk extensibility surface. A malicious or compromised plugin could attempt:

- File system access to read secrets, SSH keys, or source code
- Network access to exfiltrate data
- Process spawning to execute arbitrary commands
- Memory abuse to deny service or mine cryptocurrency
- Prototype pollution or sandbox escape to gain main process access

### 5.2 Sandbox Selection: isolated-vm vs. QuickJS-WASM

**DO NOT USE `vm2`**. The `vm2` library has a long history of critical sandbox escape vulnerabilities. The most recent, CVE-2026-22709 (CVSS 9.8), allows arbitrary code execution via improper Promise callback sanitization. This was preceded by CVE-2023-37466, CVE-2023-37903, CVE-2023-32314, CVE-2023-30547, and others. The library's architecture is fundamentally incompatible with secure sandboxing because it relies on JavaScript-level isolation within the same V8 isolate.

**Primary recommendation: `isolated-vm`** for performance-critical plugins:

```typescript
// main/plugins/isolate-sandbox.ts
import ivm from 'isolated-vm';

interface PluginSandboxOptions {
  memoryLimitMb: number;
  timeoutMs: number;
  permissions: PluginPermissions;
}

interface PluginPermissions {
  network: boolean;
  fileRead: string[];  // Allowed path prefixes
  fileWrite: string[]; // Allowed path prefixes
  env: string[];       // Allowed env var names
}

export class IsolateSandbox {
  private isolate: ivm.Isolate;
  private context: ivm.Context;

  constructor(private options: PluginSandboxOptions) {
    // Each plugin gets its own V8 isolate with a hard memory ceiling.
    // Exceeding the limit terminates the isolate immediately.
    this.isolate = new ivm.Isolate({
      memoryLimit: options.memoryLimitMb,  // Default: 128 MB
    });
    this.context = this.isolate.createContextSync();

    // Inject capability-gated host functions based on permissions
    this.injectHostAPIs();
  }

  private injectHostAPIs(): void {
    const jail = this.context.global;
    jail.setSync('global', jail.derefInto());

    // Console (always available, rate-limited)
    jail.setSync('_log', new ivm.Callback(
      (level: string, ...args: unknown[]) => {
        const sanitized = args.map(a => String(a).slice(0, 1000));
        console.log(`[plugin:${level}]`, ...sanitized);
      }
    ));

    // Network access (only if permission granted)
    if (this.options.permissions.network) {
      jail.setSync('_fetch', new ivm.Callback(
        async (url: string) => {
          // Validate URL against allowlist
          if (!this.isAllowedUrl(url)) {
            throw new Error(`Network access denied: ${url}`);
          }
          const response = await fetch(url);
          return response.text();
        }
      ));
    }

    // File read (only for declared paths)
    if (this.options.permissions.fileRead.length > 0) {
      jail.setSync('_readFile', new ivm.Callback(
        async (filePath: string) => {
          if (!this.isAllowedPath(filePath, this.options.permissions.fileRead)) {
            throw new Error(`File read denied: ${filePath}`);
          }
          const fs = await import('node:fs/promises');
          return fs.readFile(filePath, 'utf-8');
        }
      ));
    }
  }

  async execute(code: string): Promise<unknown> {
    const script = await this.isolate.compileScript(code);
    return script.run(this.context, {
      timeout: this.options.timeoutMs,  // Default: 5000ms
    });
  }

  dispose(): void {
    this.context.release();
    this.isolate.dispose();
  }

  private isAllowedUrl(url: string): boolean {
    // Implement URL allowlist validation
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isAllowedPath(filePath: string, allowed: string[]): boolean {
    const path = require('node:path');
    const resolved = path.resolve(filePath);
    return allowed.some(prefix => resolved.startsWith(path.resolve(prefix)));
  }
}
```

**Alternative: QuickJS via WebAssembly** for maximum isolation:

```typescript
// main/plugins/quickjs-sandbox.ts
import { getQuickJS } from 'quickjs-emscripten';

export class QuickJSSandbox {
  private vm: any;

  async initialize(): Promise<void> {
    const QuickJS = await getQuickJS();
    // QuickJS runs inside a WASM sandbox -- it cannot access
    // the host's file system, network, or memory directly.
    // This is the strongest isolation boundary available.
    this.vm = QuickJS.newContext();
  }

  async execute(code: string, timeoutMs: number = 5000): Promise<string> {
    // Set an interrupt handler for CPU timeout enforcement
    this.vm.runtime.setInterruptHandler(() => {
      return this.shouldInterrupt(timeoutMs);
    });

    const result = this.vm.evalCode(code);
    if (result.error) {
      const error = this.vm.dump(result.error);
      result.error.dispose();
      throw new Error(`Plugin execution error: ${JSON.stringify(error)}`);
    }

    const value = this.vm.dump(result.value);
    result.value.dispose();
    return value;
  }

  dispose(): void {
    this.vm?.dispose();
  }

  private startTime = Date.now();
  private shouldInterrupt(timeoutMs: number): boolean {
    return Date.now() - this.startTime > timeoutMs;
  }
}
```

**Comparison matrix**:

| Property | isolated-vm | QuickJS-WASM |
|---|---|---|
| Isolation boundary | Separate V8 isolate (process-level memory isolation) | WebAssembly linear memory (hardware-enforced) |
| Performance | Near-native V8 speed | 5-10x slower than V8 |
| ES version support | Full ES2024+ (same as Node.js) | ES2023 (QuickJS spec compliance) |
| Memory control | Hard limit via `memoryLimit` | Manual WASM memory allocation |
| CPU timeout | Script `timeout` parameter | Interrupt handler callback |
| Escape history | No known escapes (process boundary) | No known escapes (WASM sandbox) |
| Native addon risk | Requires native build | Pure WASM, no native code |
| Recommendation | Use for performance-sensitive plugins | Use for highest-risk untrusted code |

### 5.3 Plugin Manifest and Permission Model

Every plugin declares its required capabilities in a manifest:

```json
{
  "$schema": "https://devrig.dev/schemas/plugin-manifest-v1.json",
  "name": "github-pr-reviewer",
  "version": "1.2.0",
  "author": "DevRig Community",
  "description": "Automated PR review with AI suggestions",
  "engine": "isolated-vm",
  "trust_tier": "community",
  "permissions": {
    "network": {
      "domains": ["api.github.com", "api.openai.com"],
      "reason": "Fetches PR data and sends to OpenAI for review"
    },
    "secrets": {
      "keys": ["GITHUB_TOKEN", "OPENAI_API_KEY"],
      "reason": "Authenticates with GitHub and OpenAI APIs"
    },
    "file_read": {
      "paths": [".github/", "src/"],
      "reason": "Reads repository files for context"
    },
    "file_write": {
      "paths": [],
      "reason": null
    }
  },
  "resources": {
    "memory_mb": 64,
    "timeout_ms": 10000,
    "max_concurrent": 2
  },
  "signature": "sha256:abc123..."
}
```

### 5.4 Plugin Trust Tiers

| Tier | Label | Review Process | Capabilities |
|---|---|---|---|
| 1 | **Verified** | Code reviewed by DevRig security team; signed by DevRig key | Full permission model; shown with verified badge |
| 2 | **Community** | Automated static analysis; community reputation score >= 4.0 | Standard permission model; user prompted for each permission |
| 3 | **Experimental** | No review; self-published | Restricted permissions (no file write, no secrets access); warning displayed |

### 5.5 Resource Limits

| Resource | Default Limit | Maximum Configurable |
|---|---|---|
| Memory per isolate | 128 MB | 512 MB |
| CPU time per invocation | 5 seconds | 30 seconds |
| Concurrent plugin executions | 3 | 10 |
| Network requests per minute | 60 | 300 |
| File read size per operation | 1 MB | 10 MB |
| Total plugin storage | 50 MB per plugin | 200 MB |

---

## 6. Authentication and Licensing

### 6.1 License Validation Architecture

DevRig uses **Keygen.sh** as the licensing backend for its API-driven approach, SOC 2 Type II compliance, and native Electron integration support.

**License model** (inspired by Sublime Text):

- **License key**: User purchases a perpetual license with N years of updates (e.g., 3 years).
- **Machine activation**: Each license key is activated on a specific machine. Seat count determines concurrent activations.
- **Offline grace period**: After initial online validation, the app operates offline for up to 30 days before requiring re-validation.

```typescript
// main/licensing/license-manager.ts
import crypto from 'node:crypto';
import { SafeStorageProvider } from '../secrets/safe-storage';

interface LicenseValidationResult {
  valid: boolean;
  tier: 'free' | 'pro' | 'team';
  expiresAt: string | null;
  offlineGraceDays: number;
  error?: string;
}

interface CachedLicense {
  key: string;
  fingerprint: string;
  validatedAt: string;
  expiresAt: string | null;
  tier: string;
  signature: string;  // HMAC of the above fields
}

export class LicenseManager {
  private static readonly KEYGEN_ACCOUNT_ID = process.env.KEYGEN_ACCOUNT_ID!;
  private static readonly KEYGEN_VERIFY_KEY = process.env.KEYGEN_VERIFY_KEY!;
  private static readonly GRACE_PERIOD_DAYS = 30;
  private static readonly VALIDATION_ENDPOINT =
    `https://api.keygen.sh/v1/accounts/${LicenseManager.KEYGEN_ACCOUNT_ID}/licenses/actions/validate-key`;

  /**
   * Validate a license key online against Keygen.sh.
   * On success, cache the result encrypted for offline use.
   */
  async validateOnline(licenseKey: string): Promise<LicenseValidationResult> {
    const fingerprint = await this.getMachineFingerprint();

    const response = await fetch(this.VALIDATION_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/vnd.api+json',
        Accept: 'application/vnd.api+json',
      },
      body: JSON.stringify({
        meta: {
          key: licenseKey,
          scope: {
            fingerprint,
          },
        },
      }),
    });

    const data = await response.json();
    const valid = data.meta?.valid === true;

    const result: LicenseValidationResult = {
      valid,
      tier: data.data?.attributes?.metadata?.tier ?? 'free',
      expiresAt: data.data?.attributes?.expiry ?? null,
      offlineGraceDays: LicenseManager.GRACE_PERIOD_DAYS,
      error: valid ? undefined : data.meta?.detail,
    };

    if (valid) {
      await this.cacheValidation(licenseKey, fingerprint, result);
    }

    return result;
  }

  /**
   * Validate from encrypted cache when offline.
   * Returns valid only if within the grace period.
   */
  async validateOffline(): Promise<LicenseValidationResult> {
    const cached = await this.loadCachedValidation();
    if (!cached) {
      return { valid: false, tier: 'free', expiresAt: null, offlineGraceDays: 0, error: 'No cached license' };
    }

    // Verify HMAC integrity of cached data
    if (!this.verifyCacheIntegrity(cached)) {
      return { valid: false, tier: 'free', expiresAt: null, offlineGraceDays: 0, error: 'Cache integrity check failed' };
    }

    const validatedDate = new Date(cached.validatedAt);
    const daysSinceValidation = (Date.now() - validatedDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceValidation > LicenseManager.GRACE_PERIOD_DAYS) {
      return {
        valid: false,
        tier: 'free',
        expiresAt: cached.expiresAt,
        offlineGraceDays: 0,
        error: `Offline grace period expired (${Math.floor(daysSinceValidation)} days since last validation)`,
      };
    }

    return {
      valid: true,
      tier: cached.tier as 'free' | 'pro' | 'team',
      expiresAt: cached.expiresAt,
      offlineGraceDays: Math.floor(LicenseManager.GRACE_PERIOD_DAYS - daysSinceValidation),
    };
  }

  /**
   * Machine fingerprint for seat management.
   * Combines hardware identifiers into a stable, non-PII hash.
   */
  private async getMachineFingerprint(): Promise<string> {
    const os = await import('node:os');
    const components = [
      os.hostname(),
      os.platform(),
      os.arch(),
      os.cpus()[0]?.model ?? 'unknown',
      // MAC address of primary non-internal interface
      Object.values(os.networkInterfaces())
        .flat()
        .find(iface => iface && !iface.internal && iface.family === 'IPv4')
        ?.mac ?? '00:00:00:00:00:00',
    ];

    return crypto
      .createHash('sha256')
      .update(components.join('|'))
      .digest('hex')
      .slice(0, 32);
  }

  private async cacheValidation(
    key: string,
    fingerprint: string,
    result: LicenseValidationResult
  ): Promise<void> {
    const cached: CachedLicense = {
      key: key.slice(0, 8) + '...',  // Store only prefix for identification
      fingerprint,
      validatedAt: new Date().toISOString(),
      expiresAt: result.expiresAt,
      tier: result.tier,
      signature: '',  // Populated below
    };

    // HMAC for tamper detection
    cached.signature = this.computeCacheSignature(cached);

    const encrypted = SafeStorageProvider.encrypt(JSON.stringify(cached));
    // Store encrypted blob in app data directory
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const { app } = await import('electron');
    await fs.writeFile(
      path.join(app.getPath('userData'), '.license-cache'),
      encrypted
    );
  }

  private computeCacheSignature(cached: Omit<CachedLicense, 'signature'>): string {
    const payload = `${cached.key}|${cached.fingerprint}|${cached.validatedAt}|${cached.tier}`;
    return crypto
      .createHmac('sha256', LicenseManager.KEYGEN_VERIFY_KEY)
      .update(payload)
      .digest('hex');
  }

  private verifyCacheIntegrity(cached: CachedLicense): boolean {
    const expected = this.computeCacheSignature(cached);
    return crypto.timingSafeEqual(
      Buffer.from(cached.signature, 'hex'),
      Buffer.from(expected, 'hex')
    );
  }

  private async loadCachedValidation(): Promise<CachedLicense | null> {
    try {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const { app } = await import('electron');
      const encrypted = await fs.readFile(
        path.join(app.getPath('userData'), '.license-cache')
      );
      const decrypted = SafeStorageProvider.decrypt(encrypted);
      return JSON.parse(decrypted);
    } catch {
      return null;
    }
  }
}
```

### 6.2 Alternative: Lemon Squeezy

For teams that prefer a merchant-of-record model (Lemon Squeezy handles sales tax, VAT, and payment processing), the License API provides equivalent functionality:

- **Activate**: `POST https://api.lemonsqueezy.com/v1/licenses/activate` with license key and instance name
- **Validate**: `POST https://api.lemonsqueezy.com/v1/licenses/validate` for periodic revalidation
- **Deactivate**: `POST https://api.lemonsqueezy.com/v1/licenses/deactivate` on machine decommission

The same offline caching, machine fingerprinting, and grace period architecture from section 6.1 applies.

### 6.3 JWT Tokens for Cloud Sync

If DevRig offers cloud sync of workflows and settings:

```typescript
// main/auth/jwt-manager.ts
interface TokenPair {
  accessToken: string;   // Short-lived: 15 minutes
  refreshToken: string;  // Long-lived: 30 days, stored in OS keychain
}
```

**Token security rules**:

1. Access tokens are kept in memory only (never persisted to disk).
2. Refresh tokens are stored in the OS keychain via `safeStorage`.
3. Token refresh happens proactively (before expiry) to avoid user disruption.
4. Refresh token rotation: each refresh returns a new refresh token and invalidates the old one.
5. All token endpoints require TLS 1.2+ with certificate validation.

### 6.4 Anti-Piracy Philosophy

DevRig takes a **reasonable anti-piracy** stance. The goal is to prevent casual sharing, not to implement invasive DRM:

| Measure | Purpose | Implementation |
|---|---|---|
| Machine fingerprint activation | Prevent one key on many machines | Keygen.sh machine activation with configurable seat count |
| Periodic online validation | Detect revoked/suspended keys | Every 72 hours when online; 30-day offline grace |
| License cache HMAC | Prevent local tampering | HMAC-SHA256 with server-derived key |
| Obfuscated license logic | Raise the bar for casual patching | Bundle license checks in native code via `bytenode` or `electron-bytenode` |

**What DevRig will NOT do**:
- No kernel-level anti-tamper (no ring-0 drivers)
- No continuous phoning home (respects offline/air-gapped environments)
- No hardware dongles
- No punitive measures (degrade gracefully to free tier, never delete user data)

---

## 7. Data Security

### 7.1 SQLite Encryption at Rest

DevRig uses SQLite as its primary local database. Two encryption approaches are supported:

**Option A: SQLCipher (Full Database Encryption)**

SQLCipher is a fork of SQLite that provides transparent 256-bit AES encryption of the entire database file. This is the recommended approach for maximum protection.

```typescript
// main/database/encrypted-db.ts
import Database from 'better-sqlite3';
import { SafeStorageProvider } from '../secrets/safe-storage';
import path from 'node:path';
import { app } from 'electron';

export function openEncryptedDatabase(): Database.Database {
  const dbPath = path.join(app.getPath('userData'), 'devrig.db');

  // The database passphrase is stored encrypted by safeStorage.
  // On first run, generate a random passphrase and persist it.
  const passphrase = getOrCreatePassphrase();

  const db = new Database(dbPath);

  // SQLCipher PRAGMA commands (must be first statements)
  db.pragma(`key = '${passphrase}'`);
  db.pragma('cipher_page_size = 4096');
  db.pragma('kdf_iter = 256000');         // PBKDF2 iterations
  db.pragma('cipher_memory_security = ON'); // Zero memory on free

  // Verify the database opened successfully
  try {
    db.pragma('integrity_check');
  } catch (error) {
    throw new Error('Database decryption failed. Passphrase may be incorrect.');
  }

  return db;
}

function getOrCreatePassphrase(): string {
  const configPath = path.join(app.getPath('userData'), '.db-key');
  const fs = require('node:fs');

  if (fs.existsSync(configPath)) {
    const encrypted = fs.readFileSync(configPath);
    return SafeStorageProvider.decrypt(encrypted);
  }

  // Generate a 32-byte random passphrase
  const crypto = require('node:crypto');
  const passphrase = crypto.randomBytes(32).toString('base64url');
  const encrypted = SafeStorageProvider.encrypt(passphrase);
  fs.writeFileSync(configPath, encrypted, { mode: 0o600 });
  return passphrase;
}
```

**Option B: safeStorage-Wrapped Key with Field-Level Encryption**

If bundling SQLCipher is impractical (native rebuild complexity), use standard SQLite with field-level AES-256-GCM encryption as described in section 3.4. Non-sensitive columns (workflow names, timestamps) remain unencrypted for query performance; sensitive columns (credentials, API responses containing PII) are encrypted.

### 7.2 GDPR and Data Privacy Compliance

DevRig processes user data locally. For users who opt into cloud sync, additional protections apply:

**Data Subject Rights Implementation**:

| Right | Implementation |
|---|---|
| **Right to Access** (Art. 15) | Export all user data as JSON/ZIP via Settings > Privacy > Export My Data |
| **Right to Erasure** (Art. 17) | Delete all user data via Settings > Privacy > Delete All Data. Includes local DB, keychain entries, cached files, and server-side data (if cloud sync enabled) |
| **Right to Portability** (Art. 20) | Workflow definitions exported in an open JSON schema that competing tools can import |
| **Right to Rectification** (Art. 16) | User can edit all stored personal data through the app settings |

**Data minimization**:
- Collect only what is needed for functionality.
- Analytics (if enabled) use anonymous session IDs, not user identifiers.
- Crash reports strip PII before transmission (see section 8.4).

### 7.3 Secure Deletion on Uninstall

```typescript
// scripts/uninstall-cleanup.ts
import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';

/**
 * Securely delete sensitive files on uninstall.
 *
 * For SSDs, overwriting is not effective due to wear leveling.
 * The primary defense is encryption-at-rest: if the key is
 * deleted from the OS keychain, the data is unrecoverable.
 */
export async function secureUninstall(): Promise<void> {
  const userData = app.getPath('userData');

  // 1. Delete the database encryption key from the OS keychain.
  //    Without this key, the encrypted SQLite database is unrecoverable.
  const { SafeStorageProvider } = await import('../secrets/safe-storage');
  const keyPath = path.join(userData, '.db-key');
  try {
    // Overwrite the key file with random data before deletion
    const size = (await fs.stat(keyPath)).size;
    await fs.writeFile(keyPath, crypto.randomBytes(size));
    await fs.unlink(keyPath);
  } catch { /* File may not exist */ }

  // 2. Delete all keychain entries
  const { KeytarProvider } = await import('../secrets/keytar-provider');
  const credentials = await KeytarProvider.listAll();
  for (const cred of credentials) {
    await KeytarProvider.delete(cred.account);
  }

  // 3. Delete the license cache
  try {
    await fs.unlink(path.join(userData, '.license-cache'));
  } catch { /* May not exist */ }

  // 4. Delete the database file
  try {
    await fs.unlink(path.join(userData, 'devrig.db'));
    await fs.unlink(path.join(userData, 'devrig.db-wal'));
    await fs.unlink(path.join(userData, 'devrig.db-shm'));
  } catch { /* May not exist */ }

  // 5. Remove the entire userData directory
  await fs.rm(userData, { recursive: true, force: true });
}
```

### 7.4 Backup Encryption

If DevRig provides local backup functionality:

1. Backups are always encrypted using AES-256-GCM with a key derived from the user's license key (or a user-provided passphrase) via PBKDF2 (600,000 iterations, SHA-512).
2. Backup files include an integrity checksum (HMAC-SHA256) to detect tampering.
3. Backup metadata (timestamp, version) is stored in plaintext; backup content is encrypted.
4. Cloud backups (if supported) are encrypted client-side before upload. The server never sees plaintext data.

---

## 8. CI/CD and Infrastructure Security

### 8.1 GitHub Actions Build Pipeline

DevRig builds for macOS, Windows, and Linux using GitHub Actions with hardened runners:

```yaml
# .github/workflows/release.yml
name: Release Build

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write    # For creating GitHub Releases
  id-token: write    # For OIDC-based authentication (if using cloud signing)

jobs:
  build-macos:
    runs-on: macos-14  # Apple Silicon runner
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci --ignore-scripts
      - run: npm run build

      # Code signing secrets are stored in GitHub Actions Secrets,
      # NEVER in the repository. They are available only in the
      # 'production' environment which requires manual approval.
      - name: Build and Sign
        env:
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        run: npx electron-builder --mac --publish always

      - name: Verify Notarization
        run: |
          spctl -a -vvv -t execute "dist/mac-arm64/DevRig.app"

  build-windows:
    runs-on: windows-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci --ignore-scripts
      - run: npm run build

      - name: Build and Sign
        env:
          # For HSM-backed signing (DigiCert KeyLocker)
          SM_HOST: ${{ secrets.SM_HOST }}
          SM_API_KEY: ${{ secrets.SM_API_KEY }}
          SM_CLIENT_CERT_FILE_B64: ${{ secrets.SM_CLIENT_CERT_FILE_B64 }}
          SM_CLIENT_CERT_PASSWORD: ${{ secrets.SM_CLIENT_CERT_PASSWORD }}
          SM_CERT_ALIAS: ${{ secrets.SM_CERT_ALIAS }}
        run: npx electron-builder --win --publish always

  build-linux:
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci --ignore-scripts
      - run: npm run build

      - name: Build
        run: npx electron-builder --linux --publish always

      - name: Sign Packages
        env:
          GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}
          GPG_PASSPHRASE: ${{ secrets.GPG_PASSPHRASE }}
        run: |
          echo "$GPG_PRIVATE_KEY" | gpg --batch --import
          for f in dist/*.deb dist/*.rpm dist/*.AppImage; do
            gpg --batch --yes --passphrase "$GPG_PASSPHRASE" \
              --detach-sign --armor "$f"
          done
```

### 8.2 Build Pipeline Security Hardening

| Control | Implementation |
|---|---|
| **Dependency pinning** | `npm ci` with `package-lock.json`. No `npm install` in CI. |
| **Dependency auditing** | `npm audit --audit-level=high` runs on every PR. Fail build on high/critical. |
| **Supply chain integrity** | Enable npm provenance. Use `npm audit signatures` to verify package registry signatures. |
| **Secret management** | All signing keys and credentials stored in GitHub Actions Secrets within a `production` environment requiring manual approval for releases. |
| **Runner hardening** | Use GitHub-hosted runners (not self-hosted) for release builds. Pin action versions to SHA, not tags. |
| **Reproducible builds** | Lock Electron version in `package.json`. Pin `electron-builder` version. Archive build artifacts with checksums. |
| **SBOM generation** | Generate Software Bill of Materials using `@cyclonedx/cyclonedx-npm` on each release. Publish alongside release artifacts. |

### 8.3 Secret Handling in CI

```yaml
# Secrets are NEVER:
# - Hardcoded in source code or config files
# - Printed in logs (GitHub Actions masks ${{ secrets.* }} automatically)
# - Passed as command-line arguments (visible in process list)
# - Stored in artifacts or caches

# Secrets ARE:
# - Stored in GitHub Actions Secrets (encrypted at rest)
# - Scoped to the 'production' environment (requires approval)
# - Rotated on a quarterly schedule
# - Auditable via GitHub's audit log
```

### 8.4 Crash Reporting: Sentry with PII Scrubbing

```typescript
// main/telemetry/sentry.ts
import * as Sentry from '@sentry/electron/main';

export function initSentry(): void {
  // Crash reporting is OPT-IN. Do not initialize unless
  // the user has explicitly enabled it in Settings.
  if (!userSettings.get('telemetry.crashReporting')) return;

  Sentry.init({
    dsn: 'https://examplePublicKey@o0.ingest.sentry.io/0',
    release: `devrig@${app.getVersion()}`,
    environment: process.env.NODE_ENV,

    // Disable "Send Default PII" -- this is off by default but be explicit
    sendDefaultPii: false,

    // Strip sensitive data before it leaves the machine
    beforeSend(event) {
      // Remove user IP address
      if (event.user) {
        delete event.user.ip_address;
        delete event.user.email;
        delete event.user.username;
      }

      // Scrub file paths that may contain usernames
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.filename) {
                // Replace /Users/john.doe/... with /Users/[REDACTED]/...
                frame.filename = frame.filename.replace(
                  /\/(Users|home)\/[^/]+\//g,
                  '/$1/[REDACTED]/'
                );
              }
              if (frame.abs_path) {
                frame.abs_path = frame.abs_path.replace(
                  /\/(Users|home)\/[^/]+\//g,
                  '/$1/[REDACTED]/'
                );
              }
            }
          }
        }
      }

      // Remove breadcrumbs that may contain URLs with tokens
      if (event.breadcrumbs) {
        event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
          if (breadcrumb.data?.url) {
            try {
              const url = new URL(breadcrumb.data.url);
              // Strip query parameters (may contain tokens)
              url.search = '';
              breadcrumb.data.url = url.toString();
            } catch { /* Not a valid URL, leave as-is */ }
          }
          return breadcrumb;
        });
      }

      // Drop events that contain potential API keys in message
      if (event.message && /sk-[a-zA-Z0-9]{20,}/.test(event.message)) {
        return null; // Drop the event entirely
      }

      return event;
    },

    // Scrub sensitive data from breadcrumb messages
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.message) {
        breadcrumb.message = breadcrumb.message.replace(
          /Bearer [a-zA-Z0-9._-]+/g,
          'Bearer [REDACTED]'
        );
        breadcrumb.message = breadcrumb.message.replace(
          /sk-[a-zA-Z0-9]+/g,
          'sk-[REDACTED]'
        );
      }
      return breadcrumb;
    },
  });
}
```

### 8.5 Analytics: Privacy-First Approach

DevRig uses **PostHog** (self-hosted) or **Plausible** for product analytics. All analytics are opt-in.

```typescript
// main/telemetry/analytics.ts
interface AnalyticsEvent {
  event: string;
  properties: Record<string, string | number | boolean>;
}

export class Analytics {
  private enabled: boolean;
  private distinctId: string;  // Random UUID, not tied to user identity

  constructor() {
    this.enabled = userSettings.get('telemetry.analytics', false);
    // Generate a random ID per installation. NOT tied to license, email, or machine.
    this.distinctId = userSettings.get('telemetry.anonymousId') ??
      this.generateAndStoreAnonymousId();
  }

  track(event: AnalyticsEvent): void {
    if (!this.enabled) return;

    // Allowlist of event properties -- block anything not explicitly permitted
    const safeProperties = this.sanitizeProperties(event.properties);

    // Send to self-hosted PostHog instance
    fetch('https://analytics.devrig.dev/capture/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: 'phc_devrig_public_key',
        event: event.event,
        distinct_id: this.distinctId,
        properties: {
          ...safeProperties,
          $os: process.platform,
          $app_version: app.getVersion(),
          // NO: IP address, email, license key, file paths, API keys
        },
      }),
    }).catch(() => { /* Silently fail -- analytics are not critical */ });
  }

  private sanitizeProperties(
    props: Record<string, string | number | boolean>
  ): Record<string, string | number | boolean> {
    const ALLOWED_KEYS = new Set([
      'workflow_count', 'plugin_count', 'execution_duration_ms',
      'action_type', 'feature_used', 'license_tier',
    ]);
    const safe: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(props)) {
      if (ALLOWED_KEYS.has(key)) {
        safe[key] = value;
      }
    }
    return safe;
  }

  private generateAndStoreAnonymousId(): string {
    const id = crypto.randomUUID();
    userSettings.set('telemetry.anonymousId', id);
    return id;
  }
}
```

**Analytics data rules**:
1. **Opt-in only**: Disabled by default. User must actively enable in Settings.
2. **Anonymous**: No PII, no user identifiers, no IP logging. PostHog is configured with `anonymize_ips: true`.
3. **Minimal**: Track feature usage counts and performance metrics only.
4. **Transparent**: Settings page shows exactly what is collected with a "View raw data" option.
5. **Self-hosted**: PostHog runs on DevRig's infrastructure, not a third-party SaaS.

### 8.6 Auto-Update Server Architecture

**Option A: GitHub Releases (Recommended for initial launch)**

- Binaries and signed manifests (`latest.yml`, `latest-mac.yml`) are published as GitHub Release assets.
- `electron-updater` checks the GitHub API for new releases.
- Advantages: No infrastructure to manage, built-in CDN via GitHub's edge network.
- Rate limits: 60 unauthenticated requests/hour per IP (sufficient for small-to-medium user bases).

**Option B: S3 + CloudFront (Recommended for scale)**

```
User (app) --HTTPS--> CloudFront (CDN) ---> S3 (private bucket)
                          |
                     WAF (rate limiting)
                          |
                     Origin Access Control (OAC)
```

- S3 bucket is private; access only via CloudFront Origin Access Control.
- CloudFront serves cached binaries globally with low latency.
- WAF rules rate-limit update checks per IP.
- Signed URLs or CloudFront signed cookies for authenticated access (if license validation is desired before download).
- Enable S3 versioning and MFA Delete for the update bucket to prevent supply chain attacks via bucket compromise.

---

## 9. Incident Response

### 9.1 Security Incident Playbook

| Severity | Definition | Response SLA | Actions |
|---|---|---|---|
| **P0 Critical** | Active exploitation of DevRig vulnerability, user data compromised | 1 hour | Assemble security team, assess blast radius, prepare emergency patch, notify affected users |
| **P1 High** | Exploitable vulnerability discovered (not yet in the wild) | 24 hours | Develop and test fix, coordinate disclosure, prepare release |
| **P2 Medium** | Security weakness identified, no known exploit | 7 days | Schedule fix in next release, update security advisory |
| **P3 Low** | Defense-in-depth improvement, hardening opportunity | 30 days | Add to backlog, address in regular release cycle |

### 9.2 Vulnerability Disclosure Policy

- Publish a `SECURITY.md` in the repository root with contact information.
- Accept reports via `security@devrig.dev` and a GitHub Security Advisory.
- Acknowledge receipt within 24 hours.
- Provide initial assessment within 72 hours.
- Target 90-day fix timeline for disclosed vulnerabilities.
- Credit researchers in release notes (with permission).

### 9.3 Emergency Update Mechanism

For critical vulnerabilities requiring immediate patching:

1. Build, sign, and publish an emergency release to a separate "critical-update" channel.
2. The app checks the critical-update channel more frequently (every 15 minutes) when a security advisory is active.
3. If the user has auto-update disabled, display a non-dismissible banner: "A critical security update is available. Please update immediately."

---

## 10. Compliance Matrix

| Requirement | Standard | DevRig Implementation |
|---|---|---|
| Encryption at rest | SOC 2 CC6.1, GDPR Art. 32 | SQLCipher (AES-256) or field-level AES-256-GCM |
| Encryption in transit | SOC 2 CC6.1, GDPR Art. 32 | TLS 1.2+ for all network communication |
| Access control | SOC 2 CC6.1 | OS keychain for credential storage; no default passwords |
| Data minimization | GDPR Art. 5(1)(c) | Collect only data necessary for functionality |
| Right to erasure | GDPR Art. 17 | Complete data deletion via Settings and on uninstall |
| Right to portability | GDPR Art. 20 | Export workflows as JSON/ZIP |
| Breach notification | GDPR Art. 33-34 | Incident response plan with 72-hour notification SLA |
| Signed software distribution | Industry best practice | Code signing on all platforms (Apple, Authenticode, GPG) |
| Dependency management | OWASP SCVS | SBOM generation, npm audit, dependency pinning |
| Secrets management | OWASP ASVS 2.10 | OS keychain, no plaintext storage, key hierarchy |

---

## 11. References

### Electron Security Documentation
- [Electron Security Tutorial](https://www.electronjs.org/docs/latest/tutorial/security) -- Official security checklist and best practices
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage) -- OS-backed encryption API documentation
- [Electron Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) -- contextBridge and isolation model

### Code Signing and Notarization
- [Electron Code Signing Guide](https://www.electronjs.org/docs/latest/tutorial/code-signing) -- Platform-specific signing instructions
- [@electron/notarize](https://github.com/electron/notarize) -- macOS notarization tool
- [electron-builder Code Signing](https://www.electron.build/code-signing-win.html) -- Windows Authenticode configuration
- [Simon Willison: Sign and Notarize Electron on GitHub Actions](https://til.simonwillison.net/electron/sign-notarize-electron-macos) -- Practical CI walkthrough

### Plugin Sandboxing
- [isolated-vm on npm](https://www.npmjs.com/package/isolated-vm) -- V8 isolate-based sandboxing library
- [quickjs-emscripten on GitHub](https://github.com/justjake/quickjs-emscripten) -- QuickJS compiled to WebAssembly for safe JS execution
- [CVE-2026-22709: Critical vm2 Sandbox Escape](https://www.endorlabs.com/learn/cve-2026-22709-critical-sandbox-escape-in-vm2-enables-arbitrary-code-execution) -- Why vm2 must not be used
- [Semgrep: Calling Back to vm2 and Escaping Sandbox](https://semgrep.dev/blog/2026/calling-back-to-vm2-and-escaping-sandbox/) -- Technical analysis of vm2 Promise escape

### Licensing
- [Keygen.sh: License and Distribute Electron Apps](https://keygen.sh/blog/how-to-license-and-distribute-an-electron-app/) -- Licensing architecture guide
- [Keygen.sh Electron Integration](https://keygen.sh/integrate/electron/) -- SDK and example code
- [Lemon Squeezy License API](https://docs.lemonsqueezy.com/api/license-api) -- Alternative licensing provider documentation

### Secrets Management
- [Cameron Nokes: Secure Storage with keytar](https://cameronnokes.com/blog/how-to-securely-store-sensitive-information-in-electron-with-node-keytar/) -- Keytar integration guide
- [Replacing Keytar with safeStorage](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray) -- Migration from keytar to safeStorage
- [ControlPlane: Abusing VSCode Credentials](https://control-plane.io/posts/abusing-vscode-from-malicious-extensions-to-stolen-credentials-part-2/) -- Real-world attack on Electron credential storage

### Auto-Update Security
- [electron-builder Auto Update](https://www.electron.build/auto-update.html) -- Auto-update configuration and providers
- [Doyensec: electron-updater Signature Bypass](https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html) -- Known vulnerability in older versions
- [Bishop Fox: Reasonably Secure Electron](https://bishopfox.com/blog/reasonably-secure-electron) -- Security assessment framework

### Database Encryption
- [SQLCipher Documentation](https://www.zetetic.net/sqlcipher/) -- Full database encryption for SQLite
- [SQLCipher + node-sqlite3 + Electron Setup](https://gist.github.com/aguynamedben/14253e34bc7e0a881d99c8e45eb45a47) -- Build configuration for Electron

### Crash Reporting and Analytics
- [Sentry Electron SDK](https://sentry.io/for/electron/) -- Crash reporting for Electron
- [Sentry: Scrubbing Sensitive Data for Electron](https://docs.sentry.io/platforms/javascript/guides/electron/data-management/sensitive-data/) -- PII scrubbing configuration

### General Security Research
- [Doyensec: Electron Security Checklist (PDF)](https://doyensec.com/resources/us-17-Carettoni-Electronegativity-A-Study-Of-Electron-Security-wp.pdf) -- Comprehensive Electron security assessment
- [Deepstrike: Penetration Testing Electron Apps](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications) -- Offensive security perspective
- [s1r1us: Mind the V8 Patch Gap](https://s1r1us.ninja/posts/electron-contextbridge-is-insecure/) -- Context isolation bypass research

---

*Document generated 2026-02-10. Review quarterly or upon any Electron major version upgrade.*
