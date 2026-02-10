# DevRig Security Architecture & Infrastructure Document

**Classification**: Internal -- Engineering
**Version**: 1.0
**Date**: 2026-02-10
**Author**: Security Engineering
**Scope**: Production-grade security model for a commercial Electron desktop application handling developer API keys and automated workflow execution

---

## Table of Contents

1. [Security Architecture Overview](#1-security-architecture-overview)
2. [Electron Hardening](#2-electron-hardening)
3. [Secrets Management Design](#3-secrets-management-design)
4. [Plugin Sandboxing Model](#4-plugin-sandboxing-model)
5. [Code Signing & Distribution Pipeline](#5-code-signing--distribution-pipeline)
6. [Licensing System Design](#6-licensing-system-design)
7. [Data Encryption Approach](#7-data-encryption-approach)
8. [CI/CD Pipeline Architecture](#8-cicd-pipeline-architecture)
9. [Auto-Update Security Model](#9-auto-update-security-model)
10. [Privacy & Compliance](#10-privacy--compliance)
11. [Production Launch Security Checklist](#11-production-launch-security-checklist)

---

## 1. Security Architecture Overview

### 1.1 Threat Model

DevRig is a **high-value target** because it handles:
- Third-party API keys (Linear, GitHub, Claude/Anthropic, OpenAI)
- OAuth tokens with broad repository and project management scopes
- Automated code execution on behalf of users
- Access to local filesystem paths and project directories

**Adversary profiles**:

| Adversary | Capability | Objective |
|-----------|-----------|-----------|
| Remote attacker (XSS/supply chain) | Inject code into renderer process | Exfiltrate API keys, execute arbitrary commands |
| Local attacker (shared machine) | Filesystem read access | Extract secrets from app data directory |
| Malicious plugin author | Runs code within plugin sandbox | Escape sandbox, access host filesystem or credentials |
| Network adversary (MITM) | Intercept unencrypted traffic | Tamper with auto-updates, steal tokens in transit |
| Software pirate | Reverse-engineer binary | Bypass licensing, redistribute without payment |

### 1.2 Defense-in-Depth Architecture

```
+---------------------------------------------------------------------+
|                        OS-Level Protections                          |
|  macOS Gatekeeper / Windows SmartScreen / Code Signing Validation   |
+---------------------------------------------------------------------+
|                     Electron Fuse Configuration                      |
|  runAsNode=OFF  nodeCliInspect=OFF  enableNodeOptions=OFF           |
+---------------------------------------------------------------------+
|                      Main Process (Privileged)                       |
|  IPC Gateway + JSON Schema Validation + Sender Verification         |
|  Secrets Manager (safeStorage) + DB Encryption Key Holder           |
|  License Validator + Auto-Updater + Plugin Host Manager             |
+---------------------------------------------------------------------+
|              Context Bridge (Minimal Typed API Surface)              |
|  No raw ipcRenderer | No fs | No child_process | No eval           |
+---------------------------------------------------------------------+
|                    Renderer Process (Sandboxed)                      |
|  contextIsolation=ON  sandbox=ON  nodeIntegration=OFF               |
|  CSP: script-src 'self'; default-src 'none'                        |
|  React UI (automatic XSS encoding)                                  |
+---------------------------------------------------------------------+
|                  Plugin Sandbox (Isolated VM / Wasm)                 |
|  Separate V8 Isolate | No Node APIs | Capability-gated IPC         |
|  Resource limits (CPU, memory, execution time)                      |
+---------------------------------------------------------------------+
```

### 1.3 Core Security Principles

1. **Zero Trust Between Processes**: Every IPC message is untrusted input. Validate sender identity, validate schema, sanitize values.
2. **Least Privilege**: Renderer has zero Node.js access. Plugins have zero host access. Each component gets only what it needs.
3. **Secrets Never Leave the Main Process**: API keys are stored in OS keychain, decrypted only in main process memory, and never transmitted to renderer or plugin processes.
4. **Signed Everything**: Application binary, ASAR archive, auto-updates, and plugin packages are all cryptographically signed.
5. **Fail Closed**: On validation failure, deny the operation. On sandbox escape detection, terminate the process.

---

## 2. Electron Hardening

### 2.1 BrowserWindow Configuration

Every `BrowserWindow` instance **must** use the following `webPreferences`:

```typescript
// src/main/window.ts
import { BrowserWindow, app } from 'electron';
import path from 'node:path';

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    webPreferences: {
      // CRITICAL: Disable all Node.js access in renderer
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,

      // CRITICAL: Isolate preload context from renderer DOM
      contextIsolation: true,

      // CRITICAL: OS-level sandbox for renderer process
      sandbox: true,

      // CRITICAL: Enforce same-origin policy
      webSecurity: true,

      // Disable dangerous features
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,

      // Safe dialog defaults
      safeDialogs: true,

      // Preload script path (only bridge to main process)
      preload: path.join(app.getAppPath(), 'preload.js'),
    },
  });

  return win;
}
```

**Rationale**: The Bananatron audit of 112 Electron apps found that a majority enable insecure features that automatically escalate common web vulnerabilities into catastrophic exploits. The above configuration addresses every finding.

References:
- [Electron Official Security Documentation](https://www.electronjs.org/docs/latest/tutorial/security)
- [Bananatron Audit Findings](https://muffin.ink/blog/bananatron/)

### 2.2 Electron Fuses (Build-Time Immutable Configuration)

Fuses are binary flags baked into the Electron executable **before code signing**. The OS validates that these bits are not tampered with after signing.

```typescript
// electron-builder or Electron Forge fuse configuration
import { FuseV1Options, FuseVersion } from '@electron/fuses';

const fuseConfig: FuseV1Options = {
  version: FuseVersion.V1,

  // CRITICAL: Prevent ELECTRON_RUN_AS_NODE environment variable abuse
  [FuseV1Options.RunAsNode]: false,

  // CRITICAL: Disable --inspect and --inspect-brk CLI flags
  [FuseV1Options.EnableNodeCliInspectArguments]: false,

  // CRITICAL: Disable NODE_OPTIONS environment variable
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,

  // Enable cookie encryption using OS credential store
  [FuseV1Options.EnableCookieEncryption]: true,

  // CRITICAL: Enable ASAR integrity validation at runtime
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,

  // CRITICAL: Prevent loading app code from outside ASAR
  [FuseV1Options.OnlyLoadAppFromAsar]: true,

  // Grant the app sandbox entitlement on macOS (required for MAS)
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
};
```

**Rationale**: CVE-2025-55305 demonstrated that attackers can backdoor Signal, 1Password, and Slack by modifying V8 heap snapshots when ASAR integrity is not enforced. The `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` fuses close this vector.

References:
- [Electron Fuses Documentation](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Trail of Bits: Subverting Code Integrity Checks](https://blog.trailofbits.com/2025/09/03/subverting-code-integrity-checks-to-locally-backdoor-signal-1password-slack-and-more/)
- [CVE-2025-55305 Advisory](https://github.com/advisories/GHSA-vmqv-hx8q-j7mg)

### 2.3 Content Security Policy (CSP)

Apply CSP via the `session` API to guarantee it cannot be bypassed by renderer-injected meta tags:

```typescript
// src/main/csp.ts
import { session } from 'electron';

function enforceCSP(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'none'; " +
          "script-src 'self'; " +
          "style-src 'self'; " +
          "img-src 'self' data:; " +
          "font-src 'self'; " +
          "connect-src 'self'; " +
          "base-uri 'self'; " +
          "form-action 'none'; " +
          "frame-ancestors 'none'; " +
          "object-src 'none'; " +
          "require-trusted-types-for 'script';"
        ],
      },
    });
  });
}
```

**Key restrictions**:
- No `unsafe-inline` or `unsafe-eval` -- eliminates inline script injection
- `connect-src 'self'` -- renderer cannot make network requests to arbitrary origins
- `form-action 'none'` -- prevents form-based data exfiltration
- `frame-ancestors 'none'` -- prevents embedding in iframes

### 2.4 IPC Security Architecture

The IPC layer is the **primary security boundary** between the untrusted renderer and the privileged main process.

#### 2.4.1 Preload Script (Minimal API Surface)

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

// RULE: Never expose ipcRenderer directly.
// RULE: Never expose callback-based APIs that leak the event object.
// RULE: Every exposed function maps to exactly one validated IPC channel.

const api = {
  // Secrets - read-only accessors, secrets never leave main process
  secrets: {
    listProviders: (): Promise<string[]> =>
      ipcRenderer.invoke('secrets:list-providers'),
    testConnection: (providerId: string): Promise<boolean> =>
      ipcRenderer.invoke('secrets:test-connection', providerId),
    // NOTE: No getSecret() exposed. Secrets are used in main process only.
  },

  // Workflows
  workflows: {
    list: (): Promise<WorkflowSummary[]> =>
      ipcRenderer.invoke('workflows:list'),
    execute: (workflowId: string): Promise<ExecutionResult> =>
      ipcRenderer.invoke('workflows:execute', workflowId),
    cancel: (executionId: string): Promise<void> =>
      ipcRenderer.invoke('workflows:cancel', executionId),
  },

  // Application
  app: {
    getVersion: (): Promise<string> =>
      ipcRenderer.invoke('app:get-version'),
    checkForUpdates: (): Promise<UpdateInfo | null> =>
      ipcRenderer.invoke('app:check-updates'),
    onUpdateAvailable: (callback: (info: UpdateInfo) => void) => {
      const handler = (_event: unknown, info: UpdateInfo) => callback(info);
      ipcRenderer.on('app:update-available', handler);
      return () => ipcRenderer.removeListener('app:update-available', handler);
    },
  },

  // License
  license: {
    getStatus: (): Promise<LicenseStatus> =>
      ipcRenderer.invoke('license:get-status'),
    activate: (key: string): Promise<ActivationResult> =>
      ipcRenderer.invoke('license:activate', key),
  },
} as const;

contextBridge.exposeInMainWorld('devrig', api);
```

#### 2.4.2 Main Process IPC Handler with Validation

```typescript
// src/main/ipc/handler.ts
import { ipcMain, BrowserWindow } from 'electron';
import Ajv, { JSONSchemaType } from 'ajv';

const ajv = new Ajv({ allErrors: true, removeAdditional: true });

// Sender validation: ensure IPC comes from our own window
function validateSender(event: Electron.IpcMainInvokeEvent): boolean {
  const senderUrl = event.senderFrame.url;
  // For custom protocol: app://devrig/
  // For file protocol: file:///path/to/app/
  const allowedOrigins = ['app://devrig', `file://${__dirname}`];
  return allowedOrigins.some(origin => senderUrl.startsWith(origin));
}

// Schema for workflow execution
const executeWorkflowSchema: JSONSchemaType<{ workflowId: string }> = {
  type: 'object',
  properties: {
    workflowId: {
      type: 'string',
      pattern: '^[a-zA-Z0-9_-]{1,64}$', // Strict ID format
    },
  },
  required: ['workflowId'],
  additionalProperties: false,
};

const validateExecuteWorkflow = ajv.compile(executeWorkflowSchema);

ipcMain.handle('workflows:execute', async (event, workflowId: unknown) => {
  // Step 1: Validate sender
  if (!validateSender(event)) {
    throw new Error('Unauthorized IPC sender');
  }

  // Step 2: Validate input schema
  const input = { workflowId };
  if (!validateExecuteWorkflow(input)) {
    throw new Error(`Invalid input: ${ajv.errorsText(validateExecuteWorkflow.errors)}`);
  }

  // Step 3: Execute with validated, typed input
  return workflowEngine.execute(input.workflowId);
});
```

#### 2.4.3 Navigation and Window Creation Lockdown

```typescript
// src/main/security.ts
import { app, shell } from 'electron';

app.on('web-contents-created', (_event, contents) => {
  // Block ALL navigation away from the app
  contents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'app:' && parsed.protocol !== 'file:') {
      event.preventDefault();
    }
  });

  // Block ALL redirects
  contents.on('will-redirect', (event) => {
    event.preventDefault();
  });

  // Block new window creation (popups)
  contents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in the system browser, with validation
    if (url.startsWith('https://')) {
      const allowedDomains = [
        'devrig.dev',
        'github.com',
        'linear.app',
      ];
      const parsed = new URL(url);
      if (allowedDomains.includes(parsed.hostname)) {
        shell.openExternal(url);
      }
    }
    return { action: 'deny' };
  });
});
```

### 2.5 Permission Request Handling

```typescript
// src/main/permissions.ts
import { session } from 'electron';

function configurePermissions(): void {
  // Deny ALL permission requests by default
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => {
      callback(false);
    }
  );

  // Deny permission checks as well
  session.defaultSession.setPermissionCheckHandler(() => false);
}
```

DevRig does not need camera, microphone, geolocation, notifications, or any other web permission. Deny everything.

### 2.6 Custom Protocol (Eliminate file:// Origin)

```typescript
// src/main/protocol.ts
import { protocol, net } from 'electron';
import path from 'node:path';

function registerCustomProtocol(): void {
  protocol.handle('app', (request) => {
    const url = new URL(request.url);

    // Normalize and validate the path
    let filePath = path.normalize(decodeURIComponent(url.pathname));

    // Prevent directory traversal
    const appRoot = path.join(app.getAppPath(), 'dist');
    const resolvedPath = path.resolve(appRoot, filePath.slice(1));

    if (!resolvedPath.startsWith(appRoot)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(`file://${resolvedPath}`);
  });
}
```

**Rationale**: Using `file://` gives the renderer a null origin, which complicates CSP enforcement and enables path traversal attacks. A custom `app://` protocol provides explicit access control.

References:
- [Bishop Fox: Design A Reasonably Secure Electron Framework](https://bishopfox.com/blog/reasonably-secure-electron)
- [Electron Context Isolation Documentation](https://www.electronjs.org/docs/latest/tutorial/context-isolation)
- [Electron Process Sandboxing Documentation](https://www.electronjs.org/docs/latest/tutorial/sandbox)

---

## 3. Secrets Management Design

### 3.1 Architecture

Secrets (API keys, OAuth tokens, encryption keys) are the highest-value assets in DevRig. The design principle is: **secrets exist only in two places -- the OS keychain and main process memory. Never anywhere else.**

```
+-------------------+     +-------------------+     +-------------------+
|   macOS Keychain  |     | Windows DPAPI /   |     | Linux Secret      |
|   (Keychain       |     | Credential Mgr    |     | Service (GNOME    |
|    Access)        |     |                   |     |  Keyring/KWallet) |
+--------+----------+     +--------+----------+     +--------+----------+
         |                         |                          |
         +------------+------------+--------------------------+
                      |
              +-------v--------+
              | Electron       |
              | safeStorage    |
              | API            |
              +-------+--------+
                      |
              +-------v--------+
              | SecretsManager |
              | (Main Process) |
              | In-memory map  |
              +-------+--------+
                      |
              +-------v--------+
              | IPC Gateway    |
              | (No secrets    |
              |  cross bridge) |
              +----------------+
```

### 3.2 Implementation with Electron safeStorage

Electron's `safeStorage` API uses OS-native credential stores:
- **macOS**: Keychain Access (encrypted, per-app isolation)
- **Windows**: DPAPI (Data Protection API, tied to user logon credentials)
- **Linux**: GNOME Keyring, KWallet, or kwallet6 (depends on desktop environment)

```typescript
// src/main/secrets/secrets-manager.ts
import { safeStorage } from 'electron';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

interface SecretEntry {
  providerId: string;
  encryptedValue: Buffer;
  createdAt: string;
  rotatedAt: string;
}

class SecretsManager {
  private secretsFilePath: string;
  private cache: Map<string, string> = new Map(); // Decrypted values in memory

  constructor() {
    const userDataPath = app.getPath('userData');
    const secretsDir = path.join(userDataPath, 'secrets');
    if (!existsSync(secretsDir)) {
      mkdirSync(secretsDir, { recursive: true, mode: 0o700 });
    }
    this.secretsFilePath = path.join(secretsDir, 'vault.enc');
  }

  /**
   * Check if the platform supports encrypted storage.
   * CRITICAL: On Linux with no secret store, safeStorage falls back
   * to a hardcoded key. We MUST detect and warn the user.
   */
  isSecureStorageAvailable(): boolean {
    if (!safeStorage.isEncryptionAvailable()) {
      return false;
    }
    // On Linux, check the backend is not 'basic_text'
    if (process.platform === 'linux') {
      const backend = safeStorage.getSelectedStorageBackend();
      if (backend === 'basic_text') {
        return false;
      }
    }
    return true;
  }

  /**
   * Store a secret (API key, token) encrypted with OS keychain.
   */
  async storeSecret(providerId: string, value: string): Promise<void> {
    if (!this.isSecureStorageAvailable()) {
      throw new Error(
        'Secure storage is not available on this system. ' +
        'Please install gnome-keyring or kwallet.'
      );
    }

    const encrypted = safeStorage.encryptString(value);
    const entries = this.loadEntries();

    entries.set(providerId, {
      providerId,
      encryptedValue: encrypted,
      createdAt: entries.get(providerId)?.createdAt ?? new Date().toISOString(),
      rotatedAt: new Date().toISOString(),
    });

    this.saveEntries(entries);
    this.cache.set(providerId, value);
  }

  /**
   * Retrieve a decrypted secret. ONLY callable from main process.
   * This method is NEVER exposed via IPC to the renderer.
   */
  getSecret(providerId: string): string | null {
    // Check in-memory cache first
    if (this.cache.has(providerId)) {
      return this.cache.get(providerId)!;
    }

    const entries = this.loadEntries();
    const entry = entries.get(providerId);
    if (!entry) return null;

    const decrypted = safeStorage.decryptString(entry.encryptedValue);
    this.cache.set(providerId, decrypted);
    return decrypted;
  }

  /**
   * Delete a secret and clear from memory.
   */
  async deleteSecret(providerId: string): Promise<void> {
    const entries = this.loadEntries();
    entries.delete(providerId);
    this.saveEntries(entries);
    this.cache.delete(providerId);
  }

  /**
   * Clear all decrypted secrets from memory (e.g., on app lock/sleep).
   */
  clearMemoryCache(): void {
    this.cache.clear();
  }

  private loadEntries(): Map<string, SecretEntry> {
    if (!existsSync(this.secretsFilePath)) {
      return new Map();
    }
    const raw = readFileSync(this.secretsFilePath);
    const parsed = JSON.parse(raw.toString());
    const map = new Map<string, SecretEntry>();
    for (const entry of parsed) {
      map.set(entry.providerId, {
        ...entry,
        encryptedValue: Buffer.from(entry.encryptedValue, 'base64'),
      });
    }
    return map;
  }

  private saveEntries(entries: Map<string, SecretEntry>): void {
    const serialized = Array.from(entries.values()).map(e => ({
      ...e,
      encryptedValue: e.encryptedValue.toString('base64'),
    }));
    writeFileSync(
      this.secretsFilePath,
      JSON.stringify(serialized),
      { mode: 0o600 }
    );
  }
}

export const secretsManager = new SecretsManager();
```

### 3.3 Secret Usage Pattern (API Calls from Main Process)

Secrets are consumed **exclusively** in the main process. The renderer requests actions; the main process executes them using stored credentials.

```typescript
// src/main/integrations/linear-client.ts
import { secretsManager } from '../secrets/secrets-manager';

class LinearIntegration {
  async listIssues(teamId: string): Promise<Issue[]> {
    const apiKey = secretsManager.getSecret('linear');
    if (!apiKey) {
      throw new Error('Linear API key not configured');
    }

    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `query { team(id: "${teamId}") { issues { nodes { id title } } } }`,
      }),
    });

    return response.json();
  }
}
```

### 3.4 Secret Lifecycle Management

| Event | Action |
|-------|--------|
| User adds API key | Encrypt via `safeStorage`, store to disk, cache in memory |
| App needs API key | Read from memory cache; if miss, decrypt from disk |
| User rotates key | Overwrite encrypted entry, update cache, log rotation timestamp |
| User removes integration | Delete encrypted entry, clear cache entry, confirm deletion |
| App goes to sleep/lock | Clear memory cache (`clearMemoryCache()`) |
| App wakes/unlocks | Lazy re-decrypt on next access |
| App uninstall | OS-level cleanup (installer script deletes userData directory) |

### 3.5 Platform-Specific Considerations

**Linux Warning**: When `safeStorage.getSelectedStorageBackend()` returns `'basic_text'`, the encryption uses a hardcoded key and provides no real security. DevRig **must** display a prominent warning and recommend installing `gnome-keyring` or `kwallet`.

**macOS**: Keychain Access provides per-application isolation. The first access may trigger a system permission dialog. Ensure the app's bundle identifier is consistent to avoid orphaned keychain entries.

**Windows**: DPAPI ties encryption to the current user's logon credentials. Secrets are inaccessible to other user accounts on the same machine, but are accessible to any process running as the same user.

References:
- [Electron safeStorage API](https://www.electronjs.org/docs/latest/api/safe-storage)
- [Signal Desktop: safeStorage for DB Encryption Key](https://github.com/signalapp/Signal-Desktop/pull/6849)
- [Replacing Keytar with safeStorage](https://freek.dev/2103-replacing-keytar-with-electrons-safestorage-in-ray)

---

## 4. Plugin Sandboxing Model

### 4.1 Threat Assessment

Plugins are the highest-risk component because they execute third-party code within the application. A malicious or compromised plugin could:
- Exfiltrate API keys and tokens
- Execute arbitrary system commands
- Read/write arbitrary files
- Phone home with sensitive data
- Cryptomine using user resources

### 4.2 Sandbox Architecture: Layered Isolation

DevRig uses a **three-tier trust model** with two distinct sandbox technologies:

```
Tier 1: Built-in Plugins (Full Trust)
  - Ship with the application
  - Signed by DevRig
  - Run in main process with direct API access
  - Examples: Core Linear integration, GitHub integration

Tier 2: Verified Plugins (Restricted Trust)
  - Published to DevRig plugin registry
  - Code-reviewed and signed by DevRig
  - Run in isolated-vm V8 Isolate
  - Capability-gated API access

Tier 3: Community Plugins (Zero Trust)
  - User-installed from any source
  - Run in WebAssembly sandbox (WASI)
  - Strictly limited capabilities
  - No network, no filesystem by default
```

### 4.3 Tier 2 Sandbox: isolated-vm

For verified plugins that need JavaScript execution with controlled host access:

```typescript
// src/main/plugins/isolate-sandbox.ts
import ivm from 'isolated-vm';

interface PluginManifest {
  id: string;
  name: string;
  version: string;
  permissions: PluginPermission[];
  entrypoint: string;
}

type PluginPermission =
  | 'network:read'      // Make HTTP GET requests to allowed domains
  | 'network:write'     // Make HTTP POST/PUT/DELETE requests
  | 'fs:read-project'   // Read files in current project directory
  | 'ui:notify'         // Show notifications to user
  | 'workflow:trigger'  // Trigger workflow execution
  | 'linear:read'       // Read Linear issues
  | 'linear:write'      // Create/update Linear issues
  | 'github:read'       // Read GitHub data
  | 'github:write';     // Create PRs, issues, comments

class PluginIsolateSandbox {
  private isolate: ivm.Isolate;
  private context: ivm.Context;
  private manifest: PluginManifest;

  constructor(manifest: PluginManifest) {
    this.manifest = manifest;

    // Create V8 isolate with strict memory limit
    this.isolate = new ivm.Isolate({
      memoryLimit: 128, // 128 MB max
    });

    this.context = this.isolate.createContextSync();
  }

  async initialize(pluginCode: string): Promise<void> {
    const jail = this.context.global;

    // Expose ONLY the capabilities declared in the manifest
    // and approved by the user
    await this.injectCapabilityAPIs(jail);

    // Inject a structured logging API
    await jail.set('console', new ivm.ExternalCopy({
      log: new ivm.Callback((...args: unknown[]) => {
        pluginLogger.info(`[${this.manifest.id}]`, ...args);
      }),
      warn: new ivm.Callback((...args: unknown[]) => {
        pluginLogger.warn(`[${this.manifest.id}]`, ...args);
      }),
      error: new ivm.Callback((...args: unknown[]) => {
        pluginLogger.error(`[${this.manifest.id}]`, ...args);
      }),
    }).copyInto());

    // Compile and run plugin code within the isolate
    const script = await this.isolate.compileScript(pluginCode);
    await script.run(this.context, {
      timeout: 30_000, // 30 second initialization timeout
    });
  }

  async callFunction(name: string, args: unknown[]): Promise<unknown> {
    const fn = await this.context.global.get(name);
    if (!fn) throw new Error(`Plugin function '${name}' not found`);

    return fn.apply(undefined, args.map(a => new ivm.ExternalCopy(a).copyInto()), {
      timeout: 10_000, // 10 second execution timeout per call
    });
  }

  private async injectCapabilityAPIs(jail: ivm.Reference): Promise<void> {
    const permissions = new Set(this.manifest.permissions);

    // Only inject APIs the plugin has declared AND user has approved
    if (permissions.has('network:read')) {
      await jail.set('httpGet', new ivm.Callback(async (url: string) => {
        // Validate URL against allowlist
        this.validateNetworkAccess(url);
        const response = await fetch(url, { method: 'GET' });
        return response.text();
      }), { reference: true });
    }

    if (permissions.has('linear:read')) {
      await jail.set('linearQuery', new ivm.Callback(async (query: string) => {
        // Proxy through our Linear client (which holds the secret)
        return linearIntegration.executeQuery(query);
      }), { reference: true });
    }

    // Capabilities NOT in the manifest are simply not injected.
    // The plugin code cannot access them because they do not exist
    // in its V8 isolate.
  }

  private validateNetworkAccess(url: string): void {
    const parsed = new URL(url);
    const allowedDomains = ['api.linear.app', 'api.github.com'];
    if (!allowedDomains.includes(parsed.hostname)) {
      throw new Error(`Network access to ${parsed.hostname} is not permitted`);
    }
    if (parsed.protocol !== 'https:') {
      throw new Error('Only HTTPS connections are permitted');
    }
  }

  dispose(): void {
    this.isolate.dispose();
  }
}
```

### 4.4 Tier 3 Sandbox: WebAssembly (WASI)

For community plugins with maximum isolation:

```typescript
// src/main/plugins/wasm-sandbox.ts
import { WASI } from 'wasi';
import { readFile } from 'node:fs/promises';

class PluginWasmSandbox {
  private wasi: WASI;

  constructor(manifest: PluginManifest) {
    this.wasi = new WASI({
      version: 'preview1',
      args: [],
      env: {},
      // No filesystem access by default
      // No network access by default
      // Stdout/stderr captured for logging
      stdout: pluginLogger.createStream(manifest.id, 'stdout'),
      stderr: pluginLogger.createStream(manifest.id, 'stderr'),
    });
  }

  async loadAndRun(wasmPath: string): Promise<void> {
    const wasmBuffer = await readFile(wasmPath);
    const wasmModule = await WebAssembly.compile(wasmBuffer);
    const instance = await WebAssembly.instantiate(wasmModule, {
      wasi_snapshot_preview1: this.wasi.wasiImport,
      // Inject ONLY approved host functions
      devrig: this.createHostBindings(),
    });

    this.wasi.start(instance);
  }

  private createHostBindings(): WebAssembly.ModuleImports {
    return {
      // Minimal host API - plugins request capabilities,
      // host grants or denies based on manifest + user approval
      notify: (msgPtr: number, msgLen: number) => {
        // Read string from WASM memory, show notification
      },
    };
  }
}
```

### 4.5 Plugin Permission Model

Users **must explicitly approve** each permission when installing a plugin:

```
+--------------------------------------------------+
| Install Plugin: "Auto-Label Issues"              |
|                                                  |
| This plugin requests the following permissions:  |
|                                                  |
| [x] Read Linear issues                          |
| [x] Write Linear issues (add labels)            |
| [ ] Read project files                           |
| [ ] Make network requests                        |
|                                                  |
| Publisher: Verified (signed by DevRig)        |
| Version: 1.2.0                                   |
| Last audit: 2026-01-15                           |
|                                                  |
| [Cancel]                        [Install]        |
+--------------------------------------------------+
```

### 4.6 Plugin Signing and Verification

```typescript
// src/main/plugins/plugin-verifier.ts
import { verify } from 'node:crypto';

const DEVRIG_PLUGIN_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
...Ed25519 public key...
-----END PUBLIC KEY-----`;

async function verifyPluginSignature(
  pluginPath: string,
  signaturePath: string
): Promise<boolean> {
  const pluginContent = await readFile(pluginPath);
  const signature = await readFile(signaturePath);

  return verify(
    null, // Ed25519 does not use a separate hash algorithm
    pluginContent,
    DEVRIG_PLUGIN_PUBLIC_KEY,
    signature
  );
}
```

References:
- [isolated-vm: Secure JS Environments](https://github.com/laverdet/isolated-vm)
- [WebAssembly Security Model](https://webassembly.org/docs/security/)
- [VS Code Extension Runtime Security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)
- [Figma's WebAssembly Plugin Architecture](https://medium.com/@hashbyt/https-www-hashbyt-com-blog-webassembly-security-saas-plugins-2025-187b2b4e53ba)

---

## 5. Code Signing & Distribution Pipeline

### 5.1 macOS Code Signing and Notarization

**Requirements**:
- Apple Developer Program membership ($99/year)
- Developer ID Application certificate (for distribution outside the Mac App Store)
- Developer ID Installer certificate (for `.pkg` installers)
- Hardened Runtime entitlements

**Signing flow**:

```
Source Code
    |
    v
electron-builder / Electron Forge
    |
    v
codesign --deep --force --options runtime \
  --sign "Developer ID Application: DevRig Inc (TEAM_ID)" \
  --entitlements entitlements.plist \
  DevRig.app
    |
    v
xcrun notarytool submit DevRig.zip \
  --apple-id "$APPLE_ID" \
  --team-id "$TEAM_ID" \
  --password "$APP_SPECIFIC_PASSWORD" \
  --wait
    |
    v
xcrun stapler staple DevRig.app
    |
    v
Signed + Notarized + Stapled .dmg/.pkg
```

**Entitlements** (`entitlements.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <false/>
    <key>com.apple.security.automation.apple-events</key>
    <false/>
</dict>
</plist>
```

**Hardened Runtime**: Required for notarization. The `allow-jit` and `allow-unsigned-executable-memory` entitlements are necessary for Electron's V8 engine but should be the **only** exceptions granted.

### 5.2 Windows Code Signing

**Requirements since June 2023**: Microsoft requires Extended Validation (EV) certificates stored on FIPS 140 Level 2 compliant hardware for SmartScreen reputation.

**Recommended approach**: Azure Trusted Signing (cloud-based, no physical HSM required).

**Alternative**: DigiCert KeyLocker, SSL.com eSigner, or physical USB token with EV certificate.

```yaml
# electron-builder config for Windows signing
win:
  target:
    - target: nsis
      arch:
        - x64
        - arm64
  sign: ./scripts/sign-windows.js
  signingHashAlgorithms:
    - sha256
  verifyUpdateCodeSignature: true
```

**Custom signing script** (for Azure Trusted Signing or cloud HSM):

```javascript
// scripts/sign-windows.js
exports.default = async function sign(configuration) {
  const { path: filePath } = configuration;

  // Azure Trusted Signing via SignTool
  const { execSync } = require('child_process');
  execSync(
    `signtool sign /v /fd SHA256 /tr http://timestamp.acs.microsoft.com ` +
    `/td SHA256 /dlib Azure.CodeSigning.Dlib.dll ` +
    `/dmdf metadata.json "${filePath}"`,
    { stdio: 'inherit' }
  );
};
```

### 5.3 Linux Code Signing

Linux does not have a centralized code signing verification like macOS Gatekeeper or Windows SmartScreen. Instead:
- GPG-sign the AppImage or `.deb`/`.rpm` packages
- Publish the GPG public key on the website and in a keyserver
- Provide SHA-256 checksums for all artifacts
- For Flatpak/Snap: use the store's built-in signing

### 5.4 Distribution Channels

| Channel | Platform | Signing Required | Auto-Update |
|---------|----------|-----------------|-------------|
| Direct download (DMG) | macOS | Developer ID + Notarization | Yes (Squirrel/electron-updater) |
| Direct download (NSIS) | Windows | EV/Azure Trusted Signing | Yes (electron-updater) |
| Direct download (AppImage) | Linux | GPG + checksums | Yes (electron-updater) |
| Mac App Store | macOS | MAS certificate + sandbox | Yes (App Store) |
| Microsoft Store | Windows | MSIX signing | Yes (Store) |
| Snap Store | Linux | Snap signing | Yes (Snap) |
| Homebrew Cask | macOS | Must be notarized | Via cask update |

**Phase 1 (Launch)**: Direct download with code signing on all platforms.
**Phase 2 (Growth)**: Add Mac App Store and Microsoft Store.
**Phase 3 (Scale)**: Add Homebrew Cask, Snap Store, Winget.

References:
- [Electron Code Signing Documentation](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [electron-builder macOS Signing](https://www.electron.build/code-signing-mac.html)
- [Electron Forge: Signing a macOS App](https://www.electronforge.io/guides/code-signing/code-signing-macos)
- [Electron Forge: Signing a Windows App](https://www.electronforge.io/guides/code-signing/code-signing-windows)
- [electron/windows-sign](https://github.com/electron/windows-sign)

---

## 6. Licensing System Design

### 6.1 Architecture Decision

**Chosen provider**: Keygen.sh (self-hostable, supports offline validation, Ed25519 cryptographic proofs, machine fingerprinting, and Electron-specific SDKs).

**Alternative for payments**: LemonSqueezy for checkout/billing, integrated with Keygen for license enforcement.

### 6.2 License Flow

```
Purchase Flow:
  User visits devrig.dev
    -> LemonSqueezy checkout
    -> Webhook to Keygen API
    -> License key generated (Ed25519 signed)
    -> Emailed to user

Activation Flow:
  User enters license key in DevRig
    -> App sends key + machine fingerprint to Keygen API
    -> Keygen validates key, registers machine
    -> Returns signed license file (Ed25519 certificate)
    -> App stores license file locally (encrypted with safeStorage)

Validation Flow (Online):
  App startup -> POST /licenses/validate to Keygen
    -> Keygen returns validation result
    -> App caches result with TTL

Validation Flow (Offline):
  App startup -> No network available
    -> Read cached license file from disk
    -> Verify Ed25519 signature against embedded public key
    -> Check expiration date in certificate
    -> Check machine fingerprint matches current device
    -> Allow operation within grace period
```

### 6.3 Offline License Validation (Cryptographic)

```typescript
// src/main/licensing/license-validator.ts
import { verify, createHash } from 'node:crypto';
import { machineIdSync } from 'node-machine-id';
import { safeStorage } from 'electron';

// Embedded in the binary. This is a PUBLIC key -- safe to include.
const KEYGEN_VERIFY_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA...base64...
-----END PUBLIC KEY-----`;

interface LicenseCertificate {
  enc: string;      // 'base64'
  sig: string;      // Ed25519 signature
  alg: string;      // 'ed25519'
  data: string;     // Base64-encoded JSON payload
}

interface LicensePayload {
  license: {
    id: string;
    key: string;
    expiry: string | null;
    status: string;
  };
  machine: {
    fingerprint: string;
  };
  meta: {
    issued: string;
    expiry: string;
    ttl: number;  // Seconds the certificate is valid offline
  };
}

class LicenseValidator {
  private cachedStatus: LicenseStatus | null = null;

  /**
   * Generate a stable, anonymous machine fingerprint.
   * Uses SHA-256 of the system's native machine ID.
   */
  getMachineFingerprint(): string {
    const rawId = machineIdSync({ original: true });
    return createHash('sha256').update(rawId).digest('hex');
  }

  /**
   * Validate a license certificate offline using Ed25519 signature
   * verification. No network call required.
   */
  validateOffline(certificateData: string): LicenseStatus {
    try {
      const cert: LicenseCertificate = JSON.parse(certificateData);

      // Step 1: Verify the Ed25519 signature
      const signatureValid = verify(
        null,
        Buffer.from(cert.data, 'base64'),
        KEYGEN_VERIFY_KEY,
        Buffer.from(cert.sig, 'base64')
      );

      if (!signatureValid) {
        return { valid: false, reason: 'Invalid signature' };
      }

      // Step 2: Parse the signed payload
      const payload: LicensePayload = JSON.parse(
        Buffer.from(cert.data, 'base64').toString('utf-8')
      );

      // Step 3: Check machine fingerprint
      const currentFingerprint = this.getMachineFingerprint();
      if (payload.machine.fingerprint !== currentFingerprint) {
        return { valid: false, reason: 'Machine mismatch' };
      }

      // Step 4: Check certificate expiry (offline TTL)
      const certExpiry = new Date(payload.meta.expiry);
      if (certExpiry < new Date()) {
        return {
          valid: false,
          reason: 'Offline certificate expired. Please connect to the internet.',
        };
      }

      // Step 5: Check license expiry (subscription end)
      if (payload.license.expiry) {
        const licenseExpiry = new Date(payload.license.expiry);
        const gracePeriod = 5 * 24 * 60 * 60 * 1000; // 5 days
        if (new Date() > new Date(licenseExpiry.getTime() + gracePeriod)) {
          return { valid: false, reason: 'License expired' };
        }
      }

      return {
        valid: true,
        tier: payload.license.status === 'ACTIVE' ? 'pro' : 'trial',
        expiresAt: payload.license.expiry,
        offlineUntil: payload.meta.expiry,
      };
    } catch (err) {
      return { valid: false, reason: 'Failed to parse license certificate' };
    }
  }

  /**
   * Online validation with Keygen API.
   * Falls back to offline validation on network failure.
   */
  async validate(licenseKey: string): Promise<LicenseStatus> {
    try {
      const fingerprint = this.getMachineFingerprint();
      const response = await fetch(
        'https://api.keygen.sh/v1/accounts/YOUR_ACCOUNT/licenses/actions/validate-key',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            meta: {
              key: licenseKey,
              scope: { fingerprint },
            },
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        // Cache the license certificate for offline use
        if (result.meta?.certificate) {
          await this.cacheCertificate(result.meta.certificate);
        }
        return this.parseOnlineResult(result);
      }
    } catch {
      // Network failure: fall back to offline validation
    }

    // Offline fallback
    const cached = await this.loadCachedCertificate();
    if (cached) {
      return this.validateOffline(cached);
    }

    return { valid: false, reason: 'No cached license and no network' };
  }

  private async cacheCertificate(certificate: string): Promise<void> {
    const encrypted = safeStorage.encryptString(certificate);
    // Store encrypted certificate to disk
    writeFileSync(this.certPath, encrypted);
  }

  private async loadCachedCertificate(): Promise<string | null> {
    if (!existsSync(this.certPath)) return null;
    const encrypted = readFileSync(this.certPath);
    return safeStorage.decryptString(encrypted);
  }
}
```

### 6.4 Anti-Piracy Strategy

DevRig adopts a **reasonable, user-respecting** anti-piracy stance:

| Measure | Implementation | User Impact |
|---------|---------------|-------------|
| Ed25519 signed licenses | Tamper-proof license certificates | None (transparent) |
| Machine fingerprinting | SHA-256 of machine ID, max 3 activations | Minimal (supports multiple devices) |
| Offline grace period | 5 days after certificate TTL expiry | Low (periodic internet check) |
| Heartbeat check | Weekly license validation when online | None (background) |
| Subscription binding | License tied to active subscription | Standard SaaS model |

**What we deliberately avoid**:
- No kernel-level DRM or anti-tamper
- No always-online requirement
- No hardware dongles
- No aggressive obfuscation that breaks debugging
- No punitive measures for expired licenses (app degrades gracefully to free tier)

**Graceful degradation**: When a license expires or cannot be validated, the app continues to function with free-tier features. No data loss, no lockout.

References:
- [Keygen: How to License and Distribute an Electron App](https://keygen.sh/blog/how-to-license-and-distribute-an-electron-app/)
- [Keygen: Offline Licensing Documentation](https://keygen.sh/docs/api/cryptography/)
- [Keygen: Cryptographic Verification Example](https://github.com/keygen-sh/example-cryptographic-verification)
- [secure-electron-license-keys](https://github.com/reZach/secure-electron-license-keys)

---

## 7. Data Encryption Approach

### 7.1 Database Encryption with SQLCipher

DevRig stores workflow definitions, execution history, user preferences, and cached data in a local SQLite database. This database **must** be encrypted at rest.

**Chosen library**: `better-sqlite3-multiple-ciphers` (drop-in replacement for `better-sqlite3` with SQLCipher support, prebuilt binaries for Electron).

```typescript
// src/main/database/encrypted-db.ts
import Database from 'better-sqlite3-multiple-ciphers';
import { safeStorage } from 'electron';
import { randomBytes, createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

class EncryptedDatabase {
  private db: Database.Database | null = null;

  /**
   * Open (or create) the encrypted database.
   * The encryption key is stored in the OS keychain via safeStorage.
   */
  async open(): Promise<void> {
    const dbPath = path.join(app.getPath('userData'), 'devrig.db');
    const keyPath = path.join(app.getPath('userData'), 'db.key');

    let dbKey: string;

    if (existsSync(keyPath)) {
      // Decrypt the stored key
      const encryptedKey = readFileSync(keyPath);
      dbKey = safeStorage.decryptString(encryptedKey);
    } else {
      // First run: generate a random 256-bit key
      dbKey = randomBytes(32).toString('hex');
      const encryptedKey = safeStorage.encryptString(dbKey);
      writeFileSync(keyPath, encryptedKey, { mode: 0o600 });
    }

    this.db = new Database(dbPath);

    // Configure SQLCipher
    this.db.pragma(`cipher = 'sqlcipher'`);
    this.db.pragma(`legacy = 4`);                  // SQLCipher v4 format
    this.db.pragma(`key = '${dbKey}'`);
    this.db.pragma(`kdf_iter = 256000`);            // PBKDF2 iterations
    this.db.pragma(`cipher_page_size = 4096`);
    this.db.pragma(`cipher_hmac_algorithm = HMAC_SHA512`);
    this.db.pragma(`cipher_kdf_algorithm = PBKDF2_HMAC_SHA512`);

    // Verify the database is accessible (will throw if key is wrong)
    this.db.pragma('user_version');

    // Enable WAL mode for performance
    this.db.pragma('journal_mode = WAL');

    // Run migrations
    await this.migrate();
  }

  /**
   * Securely close the database and zero out the key from memory.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  private async migrate(): Promise<void> {
    // Run schema migrations
    // Implementation depends on migration framework
  }
}
```

### 7.2 Key Hierarchy

```
OS Keychain (macOS Keychain / Windows DPAPI / Linux Secret Service)
    |
    +---> Database Encryption Key (AES-256-GCM via SQLCipher)
    |       stored as: safeStorage.encryptString(randomBytes(32))
    |
    +---> API Key Vault Encryption
    |       stored as: safeStorage.encryptString(apiKey) per provider
    |
    +---> License Certificate Encryption
            stored as: safeStorage.encryptString(certificate)
```

**Key rotation for database**: The database key is generated once and never changes. To rotate, the app would need to:
1. Open database with old key
2. Create a new database with new key
3. Copy all data
4. Delete old database
5. Store new key

This is intentionally not automated -- it is an emergency procedure for compromised keys.

### 7.3 Secure Data Deletion

```typescript
// src/main/database/secure-delete.ts

/**
 * When users remove integrations or delete workflows,
 * ensure the data is actually removed, not just marked deleted.
 */
function enableSecureDelete(db: Database.Database): void {
  // SQLCipher secure_delete overwrites deleted content with zeros
  db.pragma('secure_delete = ON');
}

/**
 * Full data export before account deletion (GDPR Article 20).
 */
async function exportUserData(): Promise<Buffer> {
  const data = {
    workflows: db.prepare('SELECT * FROM workflows').all(),
    executions: db.prepare('SELECT * FROM executions').all(),
    preferences: db.prepare('SELECT * FROM preferences').all(),
    // NOTE: API keys are NOT included in export
  };
  return Buffer.from(JSON.stringify(data, null, 2));
}

/**
 * Complete data destruction (GDPR Article 17 - Right to Erasure).
 */
async function destroyAllData(): Promise<void> {
  db.close();

  const userDataPath = app.getPath('userData');
  // Remove database file
  unlinkSync(path.join(userDataPath, 'devrig.db'));
  unlinkSync(path.join(userDataPath, 'devrig.db-wal'));
  unlinkSync(path.join(userDataPath, 'devrig.db-shm'));
  // Remove encryption key
  unlinkSync(path.join(userDataPath, 'db.key'));
  // Remove secrets vault
  unlinkSync(path.join(userDataPath, 'secrets', 'vault.enc'));
  // Remove license cache
  unlinkSync(path.join(userDataPath, 'license.cert'));
}
```

### 7.4 Data at Rest Summary

| Data Type | Storage | Encryption | Key Source |
|-----------|---------|-----------|------------|
| API keys / tokens | `vault.enc` file | safeStorage (OS keychain) | OS credential store |
| Database (workflows, history) | `devrig.db` | SQLCipher AES-256 + HMAC-SHA512 | Random key in OS keychain |
| License certificate | `license.cert` | safeStorage (OS keychain) | OS credential store |
| Application preferences | Database | SQLCipher (same DB) | Same DB key |
| Temporary files | Memory / OS temp | Not persisted | N/A (ephemeral) |
| Log files | `logs/` directory | **Not encrypted** (no secrets in logs) | N/A |

References:
- [better-sqlite3-multiple-ciphers](https://github.com/m4heshd/better-sqlite3-multiple-ciphers)
- [SQLCipher AES-256 Configuration](https://utelle.github.io/SQLite3MultipleCiphers/docs/ciphers/cipher_sqlcipher/)
- [SQLite Data Encryption with SQLCipher](https://blog.stackademic.com/sqlite-data-encryption-in-your-node-electron-application-using-sqlcipher-a5bd6977cb9b)

---

## 8. CI/CD Pipeline Architecture

### 8.1 Pipeline Overview

```
GitHub Repository
    |
    v
Pull Request -> CI Checks (lint, test, security scan)
    |
    v
Merge to main -> Build Pipeline (matrix: macOS, Windows, Linux)
    |
    +---> macOS Runner (macos-14 ARM + macos-13 Intel)
    |       Build -> Sign -> Notarize -> Staple -> Upload
    |
    +---> Windows Runner (windows-2022)
    |       Build -> Azure Trusted Sign -> Upload
    |
    +---> Linux Runner (ubuntu-22.04)
            Build -> GPG Sign -> Upload
    |
    v
GitHub Release (draft) -> Manual approval -> Publish
    |
    v
Auto-update server receives new release metadata
```

### 8.2 GitHub Actions Workflow

```yaml
# .github/workflows/build-release.yml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write  # For creating releases

jobs:
  # --------------------------------------------------
  # Security Checks (runs on every push)
  # --------------------------------------------------
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install dependencies
        run: npm ci

      - name: Run npm audit
        run: npm audit --audit-level=high

      - name: Generate SBOM
        run: npx @cyclonedx/cyclonedx-npm --output-file sbom.json

      - name: Upload SBOM
        uses: actions/upload-artifact@v4
        with:
          name: sbom
          path: sbom.json

      - name: Run ESLint security rules
        run: npx eslint --config .eslintrc.security.js src/

      - name: Check for known vulnerable Electron version
        run: |
          ELECTRON_VERSION=$(node -e "console.log(require('./package.json').devDependencies.electron)")
          echo "Electron version: $ELECTRON_VERSION"
          # Check against known CVE database

  # --------------------------------------------------
  # Tests
  # --------------------------------------------------
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
      - run: npm run test:e2e

  # --------------------------------------------------
  # Build Matrix
  # --------------------------------------------------
  build:
    needs: [security, test]
    strategy:
      matrix:
        include:
          - os: macos-14
            platform: mac
            arch: arm64
          - os: macos-13
            platform: mac
            arch: x64
          - os: windows-2022
            platform: win
            arch: x64
          - os: ubuntu-22.04
            platform: linux
            arch: x64

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      # macOS: Code sign + notarize
      - name: Sign and Notarize (macOS)
        if: matrix.platform == 'mac'
        env:
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          CSC_LINK: ${{ secrets.MAC_CERTIFICATE_P12_BASE64 }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CERTIFICATE_PASSWORD }}
        run: npx electron-builder --${{ matrix.platform }} --${{ matrix.arch }} --publish never

      # Windows: Azure Trusted Signing
      - name: Sign (Windows)
        if: matrix.platform == 'win'
        env:
          AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
          AZURE_CLIENT_ID: ${{ secrets.AZURE_CLIENT_ID }}
          AZURE_CLIENT_SECRET: ${{ secrets.AZURE_CLIENT_SECRET }}
        run: npx electron-builder --win --${{ matrix.arch }} --publish never

      # Linux: Build + GPG sign
      - name: Build (Linux)
        if: matrix.platform == 'linux'
        run: npx electron-builder --linux --${{ matrix.arch }} --publish never

      - name: GPG Sign (Linux)
        if: matrix.platform == 'linux'
        env:
          GPG_PRIVATE_KEY: ${{ secrets.GPG_PRIVATE_KEY }}
        run: |
          echo "$GPG_PRIVATE_KEY" | gpg --import
          for f in dist/*.AppImage dist/*.deb dist/*.rpm; do
            gpg --detach-sign --armor "$f"
          done

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.platform }}-${{ matrix.arch }}
          path: dist/

  # --------------------------------------------------
  # Release
  # --------------------------------------------------
  release:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Download all artifacts
        uses: actions/download-artifact@v4

      - name: Generate checksums
        run: |
          find . -name '*.dmg' -o -name '*.exe' -o -name '*.AppImage' \
            -o -name '*.deb' -o -name '*.rpm' -o -name '*.zip' | \
          while read f; do
            sha256sum "$f" >> SHA256SUMS.txt
          done

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          draft: true  # Manual approval before publishing
          generate_release_notes: true
          files: |
            build-*/*
            SHA256SUMS.txt
            sbom/sbom.json
```

### 8.3 Supply Chain Security

| Control | Tool | Integration Point |
|---------|------|-------------------|
| Dependency audit | `npm audit` | Every CI run |
| SBOM generation | CycloneDX | Every release build |
| Lock file integrity | `npm ci` (strict) | Every CI run |
| Vulnerable dependency alert | GitHub Dependabot | Continuous |
| License compliance | `license-checker` | Release gate |
| Electron version check | Custom script | Release gate |
| Secret scanning | GitHub Secret Scanning | Continuous on push |
| Code scanning | CodeQL / Semgrep | Pull request gate |

**Lock file enforcement**: The CI pipeline uses `npm ci` (not `npm install`) to ensure reproducible builds from the lockfile. Any lockfile drift fails the build.

References:
- [Electron Builder Action (GitHub Marketplace)](https://github.com/marketplace/actions/electron-builder-action)
- [electron-builder CI/CD Documentation](https://deepwiki.com/electron-userland/electron-builder/6.2-cicd-pipeline)
- [npm Supply Chain Security Best Practices](https://github.com/bodadotsh/npm-security-best-practices)

---

## 9. Auto-Update Security Model

### 9.1 Architecture

```
DevRig App (installed)
    |
    v
electron-updater checks for update
    |
    v
HTTPS request to update server (GitHub Releases or S3)
    |
    v
Download latest-mac.yml / latest.yml / latest-linux.yml
    |
    v
Verify update metadata signature
    |
    v
Download differential update (.blockmap) or full update
    |
    v
Verify code signature of downloaded binary
    |  macOS: codesign verification
    |  Windows: Authenticode verification
    |  Linux: GPG signature verification
    |
    v
Prompt user to install (no silent forced updates)
    |
    v
Install and restart
```

### 9.2 Security Controls

```typescript
// src/main/updater/secure-updater.ts
import { autoUpdater, UpdateInfo } from 'electron-updater';
import { app, dialog } from 'electron';

class SecureUpdater {
  constructor() {
    // CRITICAL: Verify code signature of downloaded updates
    autoUpdater.verifyUpdateCodeSignature = true;

    // Use HTTPS only
    autoUpdater.channel = 'latest';

    // Do NOT auto-download. Check first, then ask user.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    autoUpdater.on('update-available', async (info: UpdateInfo) => {
      // Notify renderer via IPC (never auto-install)
      mainWindow?.webContents.send('app:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
      });
    });

    autoUpdater.on('update-downloaded', async (info: UpdateInfo) => {
      // Show native dialog (not in-app, to prevent UI spoofing)
      const result = await dialog.showMessageBox(mainWindow!, {
        type: 'info',
        title: 'Update Ready',
        message: `DevRig ${info.version} is ready to install.`,
        detail: 'The update will be installed when you restart the app.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });

      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });

    autoUpdater.on('error', (error) => {
      // Log error but do NOT fall back to insecure update methods
      logger.error('Auto-update error:', error);
    });
  }

  async checkForUpdates(): Promise<void> {
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      logger.warn('Update check failed:', error);
    }
  }

  async downloadUpdate(): Promise<void> {
    await autoUpdater.downloadUpdate();
  }
}
```

### 9.3 Known Vulnerabilities and Mitigations

**CVE: electron-updater Signature Verification Bypass** (Doyensec, 2020)

The original vulnerability allowed bypassing signature verification because it used string comparison of `publisherName` against the certificate's Common Name. Mitigation:

1. Always use the latest version of `electron-updater` (v6.x+)
2. Set `verifyUpdateCodeSignature: true` in electron-builder configuration
3. Pin the expected certificate thumbprint in configuration
4. Use differential updates with `.blockmap` files for integrity

**Update server compromise mitigation**:
- Updates are signed by the developer's code signing certificate (not the server)
- Even if the update server is compromised, unsigned updates will be rejected by the client
- macOS: Gatekeeper performs additional verification
- Windows: SmartScreen checks reputation

### 9.4 Update Server Options

| Option | Security | Cost | Complexity |
|--------|----------|------|------------|
| GitHub Releases | High (HTTPS, immutable releases) | Free (public repos) | Low |
| S3 + CloudFront | High (signed URLs, HTTPS) | Low | Medium |
| Keygen Releases | High (signed, machine-bound) | Included with Keygen | Low |
| Self-hosted | Variable | Server cost | High |

**Recommendation**: GitHub Releases for initial launch (simplest, free, immutable). Migrate to Keygen Releases if machine-bound update entitlements are needed.

References:
- [electron-builder Auto Update Documentation](https://www.electron.build/auto-update.html)
- [electron-updater Signature Bypass (Doyensec)](https://blog.doyensec.com/2020/02/24/electron-updater-update-signature-bypass.html)
- [Electron Official autoUpdater Documentation](https://www.electronjs.org/docs/latest/api/auto-updater)

---

## 10. Privacy & Compliance

### 10.1 GDPR Compliance

DevRig is a **local-first** application. This is a significant privacy advantage because user data (workflows, execution history, preferences) stays on the user's machine by default.

| GDPR Article | DevRig Implementation |
|--------------|--------------------------|
| Art. 5 - Data Minimization | Collect only what is needed. No tracking by default. |
| Art. 6 - Lawful Basis | License validation: contract performance. Analytics: explicit consent. |
| Art. 7 - Consent | Opt-in analytics with granular controls. |
| Art. 12-14 - Transparency | Clear privacy policy. In-app data usage explanation. |
| Art. 15 - Right of Access | Data export feature (JSON format). |
| Art. 17 - Right to Erasure | "Delete All Data" feature with secure deletion. |
| Art. 20 - Data Portability | Export workflows, history, preferences as JSON. |
| Art. 25 - Privacy by Design | Local-first. Encryption at rest. Minimal data collection. |
| Art. 32 - Security | SQLCipher, OS keychain, code signing, sandboxing. |
| Art. 33/34 - Breach Notification | Incident response plan (see below). |

### 10.2 Crash Reporting (Sentry)

```typescript
// src/main/telemetry/crash-reporting.ts
import * as Sentry from '@sentry/electron/main';

function initCrashReporting(userConsent: boolean): void {
  if (!userConsent) {
    // User has not opted in. Do not initialize Sentry.
    return;
  }

  Sentry.init({
    dsn: 'https://...@sentry.io/...',

    // Privacy controls
    beforeSend(event) {
      // Strip PII from crash reports
      delete event.user?.email;
      delete event.user?.ip_address;

      // Strip file paths that may contain usernames
      if (event.exception?.values) {
        for (const exception of event.exception.values) {
          if (exception.stacktrace?.frames) {
            for (const frame of exception.stacktrace.frames) {
              if (frame.filename) {
                // Replace /Users/john.doe/ with /Users/[redacted]/
                frame.filename = frame.filename.replace(
                  /\/Users\/[^/]+\//g,
                  '/Users/[redacted]/'
                );
                frame.filename = frame.filename.replace(
                  /C:\\Users\\[^\\]+\\/gi,
                  'C:\\Users\\[redacted]\\'
                );
              }
            }
          }
        }
      }

      return event;
    },

    // Do not send breadcrumbs that may contain sensitive data
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'console') {
        return null; // Drop console logs
      }
      return breadcrumb;
    },
  });
}
```

### 10.3 Analytics (Opt-In Only)

**Chosen approach**: Self-hosted PostHog instance OR privacy-respecting Plausible analytics.

**Data collected (only with explicit opt-in)**:
- Feature usage counts (anonymized, no PII)
- App version and platform
- Error rates (aggregated)

**Data NOT collected, ever**:
- Workflow contents
- API keys or tokens
- File contents or paths
- Personally identifiable information
- IP addresses (stripped at ingestion)

```typescript
// src/main/telemetry/analytics.ts
class Analytics {
  private enabled: boolean = false;

  async initialize(): Promise<void> {
    // Check stored preference -- default is OFF
    this.enabled = await preferences.get('analytics.enabled', false);
  }

  track(event: string, properties?: Record<string, string | number>): void {
    if (!this.enabled) return;

    // Validate that no PII is in the properties
    for (const [key, value] of Object.entries(properties ?? {})) {
      if (typeof value === 'string' && this.looksLikePII(value)) {
        delete properties![key];
      }
    }

    posthog.capture(event, {
      ...properties,
      // Explicitly set anonymous ID (no user identification)
      $set: undefined,
      $set_once: undefined,
    });
  }

  private looksLikePII(value: string): boolean {
    // Email pattern
    if (/[^@]+@[^@]+\.[^@]+/.test(value)) return true;
    // Looks like a file path with username
    if (/\/Users\/|C:\\Users\\/i.test(value)) return true;
    // Looks like an API key
    if (/^(sk-|ghp_|lin_api_|xoxb-)/.test(value)) return true;
    return false;
  }
}
```

### 10.4 First-Run Privacy Dialog

```
+--------------------------------------------------+
| Welcome to DevRig                             |
|                                                  |
| DevRig is a local-first application.          |
| Your data stays on your machine.                 |
|                                                  |
| Optional data sharing:                           |
|                                                  |
| [ ] Send anonymous crash reports                 |
|     Helps us fix bugs faster.                    |
|     No personal data is collected.               |
|                                                  |
| [ ] Send anonymous usage analytics               |
|     Helps us improve features.                   |
|     Only aggregated counts, no content.           |
|                                                  |
| You can change these settings anytime in          |
| Settings > Privacy.                              |
|                                                  |
| [Privacy Policy]              [Continue]         |
+--------------------------------------------------+
```

Both checkboxes are **unchecked by default**. This is opt-in, not opt-out.

### 10.5 Log Security

```typescript
// RULE: Never log secrets, tokens, or API keys.
// RULE: Sanitize file paths to remove usernames.
// RULE: Log rotation: keep 7 days, max 50 MB.

class SecureLogger {
  private sanitize(message: string): string {
    return message
      // Redact API keys
      .replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-[REDACTED]')
      .replace(/ghp_[a-zA-Z0-9]{36}/g, 'ghp_[REDACTED]')
      .replace(/lin_api_[a-zA-Z0-9]+/g, 'lin_api_[REDACTED]')
      .replace(/xoxb-[a-zA-Z0-9-]+/g, 'xoxb-[REDACTED]')
      // Redact bearer tokens
      .replace(/Bearer [a-zA-Z0-9._-]+/gi, 'Bearer [REDACTED]')
      // Redact email addresses
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]');
  }
}
```

References:
- [GDPR Compliance for Apps: 2025 Guide](https://gdprlocal.com/gdpr-compliance-for-apps/)
- [Privacy by Design (GDPR) Implementation Guide](https://secureprivacy.ai/blog/privacy-by-design-gdpr-2025)
- [Sentry for Electron](https://docs.sentry.io/platforms/javascript/guides/electron/)
- [Sentry Data Privacy Documentation](https://docs.sentry.io/security-legal-pii/security/mobile-privacy/)
- [PostHog Self-Hosted Analytics](https://medium.com/@coders.stop/setting-up-self-hosted-analytics-posthog-plausible-umami-comparison-ac4e7e826486)

---

## 11. Production Launch Security Checklist

### 11.1 Electron Configuration

- [ ] `nodeIntegration: false` on ALL BrowserWindow instances
- [ ] `contextIsolation: true` on ALL BrowserWindow instances
- [ ] `sandbox: true` on ALL BrowserWindow instances
- [ ] `webSecurity: true` (never disabled)
- [ ] `webviewTag: false` (WebView disabled)
- [ ] `allowRunningInsecureContent: false`
- [ ] `experimentalFeatures: false`
- [ ] No use of `enableRemoteModule`
- [ ] No use of `nodeIntegrationInWorker` or `nodeIntegrationInSubFrames`
- [ ] Content Security Policy applied via session headers (not meta tags)
- [ ] CSP does not include `unsafe-eval` or `unsafe-inline` for scripts
- [ ] Custom protocol registered (no `file://` in production)
- [ ] Navigation restricted to app origin only
- [ ] Window creation handler denies all popup windows
- [ ] All web permissions denied by default via `setPermissionRequestHandler`
- [ ] `shell.openExternal()` validates URLs against an allowlist
- [ ] Electron version is latest stable (check for known CVEs)

### 11.2 Electron Fuses

- [ ] `RunAsNode` fuse: **disabled**
- [ ] `EnableNodeCliInspectArguments` fuse: **disabled**
- [ ] `EnableNodeOptionsEnvironmentVariable` fuse: **disabled**
- [ ] `EnableCookieEncryption` fuse: **enabled**
- [ ] `EnableEmbeddedAsarIntegrityValidation` fuse: **enabled**
- [ ] `OnlyLoadAppFromAsar` fuse: **enabled**
- [ ] `GrantFileProtocolExtraPrivileges` fuse: **disabled**

### 11.3 IPC Security

- [ ] Preload script exposes ONLY high-level, parameterized functions via `contextBridge`
- [ ] No raw `ipcRenderer` exposed to renderer
- [ ] No `ipcRenderer.on` with full event object exposed
- [ ] All `ipcMain.handle` handlers validate `event.senderFrame.url`
- [ ] All IPC inputs validated with JSON Schema (ajv or similar)
- [ ] File paths received via IPC are normalized with `path.basename()` / `path.resolve()`
- [ ] No `eval()`, `new Function()`, or `child_process` accessible from renderer

### 11.4 Secrets Management

- [ ] `safeStorage.isEncryptionAvailable()` checked before storing secrets
- [ ] Linux: `safeStorage.getSelectedStorageBackend()` checked for `'basic_text'` warning
- [ ] API keys never transmitted to renderer process
- [ ] API keys never logged (log sanitization in place)
- [ ] API keys never included in crash reports
- [ ] Memory cache cleared on app sleep/lock
- [ ] Secrets vault file has restrictive permissions (`0o600`)

### 11.5 Database Security

- [ ] SQLCipher encryption enabled with AES-256
- [ ] Database encryption key stored via `safeStorage` (not hardcoded)
- [ ] PBKDF2 iterations set to 256,000 or higher
- [ ] `secure_delete` pragma enabled
- [ ] Database file permissions set to `0o600`
- [ ] No SQL query concatenation (use parameterized queries only)

### 11.6 Code Signing & Distribution

- [ ] macOS: Developer ID Application certificate valid and not expired
- [ ] macOS: Hardened Runtime enabled
- [ ] macOS: Notarization completed successfully
- [ ] macOS: Notarization ticket stapled to DMG/PKG
- [ ] Windows: EV certificate or Azure Trusted Signing configured
- [ ] Windows: Dual-signed (SHA-256) with timestamp
- [ ] Windows: SmartScreen reputation established (no warnings)
- [ ] Linux: GPG signatures generated for all packages
- [ ] Linux: SHA-256 checksums published
- [ ] All platforms: ASAR integrity validation enabled

### 11.7 Auto-Update

- [ ] `verifyUpdateCodeSignature: true` in electron-builder config
- [ ] Updates served over HTTPS only
- [ ] Update metadata signed
- [ ] User prompted before installing (no silent forced updates)
- [ ] `autoDownload: false` (user must initiate)
- [ ] electron-updater version is latest (check for known bypass CVEs)
- [ ] Differential updates enabled with `.blockmap`

### 11.8 Plugin Security

- [ ] Tier 2 plugins run in `isolated-vm` V8 Isolate
- [ ] Tier 3 plugins run in WebAssembly sandbox
- [ ] Plugin manifest declares required permissions
- [ ] User must explicitly approve each permission
- [ ] Plugin code signature verified before loading
- [ ] Memory limits enforced per plugin (128 MB max)
- [ ] Execution timeouts enforced per plugin call (10 seconds)
- [ ] Network access restricted to declared domains
- [ ] No `eval()` or `new Function()` in plugin sandbox
- [ ] Plugin errors are isolated (cannot crash host)

### 11.9 Licensing

- [ ] Ed25519 public key embedded in binary (not fetched at runtime)
- [ ] Offline validation uses cryptographic signature verification
- [ ] Machine fingerprint is anonymized (SHA-256 of machine ID)
- [ ] License certificate stored encrypted via `safeStorage`
- [ ] Graceful degradation to free tier (no data lockout on expiry)
- [ ] Grace period of 5 days for offline certificate expiry

### 11.10 Privacy & Compliance

- [ ] Crash reporting is opt-in (disabled by default)
- [ ] Analytics is opt-in (disabled by default)
- [ ] PII scrubbed from crash reports (file paths, emails)
- [ ] No IP address collection
- [ ] Data export feature implemented (GDPR Art. 20)
- [ ] Data deletion feature implemented (GDPR Art. 17)
- [ ] Privacy policy published and accessible from app
- [ ] First-run privacy dialog presented with unchecked defaults
- [ ] Log files sanitize secrets and PII

### 11.11 Supply Chain Security

- [ ] `npm ci` used in CI (not `npm install`)
- [ ] `npm audit` passes with no high/critical vulnerabilities
- [ ] SBOM generated and attached to every release
- [ ] Dependabot or similar enabled for dependency alerts
- [ ] Lock file committed and integrity verified
- [ ] No pre/post-install scripts in dependencies (or reviewed if present)
- [ ] GitHub secret scanning enabled
- [ ] CodeQL or Semgrep scanning on pull requests

### 11.12 Infrastructure

- [ ] CI secrets stored in GitHub Secrets (not in code)
- [ ] Code signing certificates rotated before expiry
- [ ] Update server uses HTTPS with valid TLS certificate
- [ ] Sentry DSN is for a dedicated project (not shared)
- [ ] Release artifacts are immutable (no overwriting published versions)
- [ ] Draft releases require manual approval before publishing

---

## Appendix A: Security Testing Recommendations

### Pre-Launch Security Assessment

1. **Automated Scanning**:
   - Run [ElectroNG](https://get-electrong.com/docs/) scanner against the built application
   - Run npm audit and Snyk for dependency vulnerabilities
   - Run CodeQL for custom security rules

2. **Manual Penetration Testing** (recommended: engage a firm like Doyensec, Bishop Fox, or Trail of Bits):
   - IPC message fuzzing
   - Context isolation bypass attempts
   - Preload script privilege escalation
   - Plugin sandbox escape testing
   - Auto-update MITM testing
   - License bypass testing
   - Local data extraction testing

3. **Ongoing Security**:
   - Monitor Electron CVE announcements
   - Subscribe to `@electron/security` GitHub advisory feed
   - Update Electron within 2 weeks of security releases
   - Re-run ElectroNG after every major dependency update

### References for Security Auditors

- [Doyensec: Awesome Electron.js Hacking](https://github.com/doyensec/awesome-electronjs-hacking)
- [Deepstrike: Penetration Testing of Electron-based Applications](https://deepstrike.io/blog/penetration-testing-of-electron-based-applications)
- [ElectroNG: Security Scanner for Electron Apps](https://get-electrong.com/docs/)
- [Cobalt: Hunting Common Misconfigurations in Electron Apps](https://www.cobalt.io/blog/common-misconfigurations-electron-apps-part-1)

---

## Appendix B: Incident Response Plan (Secrets Compromise)

If a user reports or DevRig detects that API keys may have been compromised:

1. **Immediate**: Notify the user via in-app alert with instructions to rotate affected keys
2. **Within 1 hour**: Publish a security advisory on the DevRig website
3. **Within 24 hours**: Release a patched version if the compromise was caused by an app vulnerability
4. **Within 72 hours**: GDPR breach notification to relevant Data Protection Authority (if applicable)
5. **Post-incident**: Root cause analysis published to engineering blog

---

## Appendix C: Dependency Allowlist

The following categories of npm dependencies are approved for use in DevRig. Dependencies outside these categories require security review.

| Category | Approved Packages | Notes |
|----------|-------------------|-------|
| Database | `better-sqlite3-multiple-ciphers` | SQLCipher encryption |
| Validation | `ajv`, `zod` | JSON Schema / TypeScript validation |
| Crypto | Node.js `crypto` module | No external crypto libraries |
| HTTP | Node.js `fetch` (built-in) | No axios/node-fetch in main process |
| IPC Types | Custom TypeScript interfaces | No third-party IPC wrappers |
| UI Framework | `react`, `react-dom` | Renderer only |
| Build | `electron-builder` or `@electron-forge/*` | Build tooling only |
| Plugin Sandbox | `isolated-vm` | V8 Isolate sandbox |
| Licensing | `node-machine-id` | Machine fingerprinting |
| Crash Reporting | `@sentry/electron` | Opt-in only |
| Analytics | `posthog-node` | Opt-in only, self-hosted |

---

*This document should be reviewed and updated quarterly, or immediately after any security incident or significant dependency update. All code examples are reference implementations and must be adapted to the actual DevRig codebase.*
