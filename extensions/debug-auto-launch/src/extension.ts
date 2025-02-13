/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { promises as fs } from 'fs';
import { createServer, Server } from 'net';
import { dirname } from 'path';
import * as vscode from 'vscode';
const enum State {
    Disabled = 'disabled',
    OnlyWithFlag = 'onlyWithFlag',
    Smart = 'smart',
    Always = 'always'
}
const TEXT_TOGGLE_WORKSPACE = vscode.l10n.t('Toggle auto attach in this workspace');
const TEXT_TOGGLE_GLOBAL = vscode.l10n.t('Toggle auto attach on this machine');
const TOGGLE_COMMAND = 'extension.node-debug.toggleAutoAttach';
const STORAGE_IPC = 'jsDebugIpcState';
const SETTING_SECTION = 'debug.javascript';
const SETTING_STATE = 'autoAttachFilter';
/**
 * settings that, when changed, should cause us to refresh the state vars
 */
const SETTINGS_CAUSE_REFRESH = new Set(['autoAttachSmartPattern', SETTING_STATE].map(s => `${SETTING_SECTION}.${s}`));
let currentState: Promise<{
    context: vscode.ExtensionContext;
    state: State | null;
}>;
let statusItem: vscode.StatusBarItem | undefined; // and there is no status bar item
let server: Promise<Server | undefined> | undefined; // auto attach server
let isTemporarilyDisabled = false; // whether the auto attach server is disabled temporarily, reset whenever the state changes
export function activate(context: vscode.ExtensionContext): void {
    currentState = Promise.resolve({ context, state: null });
    context.subscriptions.push(vscode.commands.registerCommand(TOGGLE_COMMAND, toggleAutoAttachSetting.bind(null, context)));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(e => {
        // Whenever a setting is changed, disable auto attach, and re-enable
        // it (if necessary) to refresh variables.
        if (e.affectsConfiguration(`${SETTING_SECTION}.${SETTING_STATE}`) ||
            [...SETTINGS_CAUSE_REFRESH].some(setting => e.affectsConfiguration(setting))) {
            (() => {
                updateAutoAttach(State.Disabled);
                updateAutoAttach(((): State => {
                    return vscode.workspace.getConfiguration(SETTING_SECTION).get<State>(SETTING_STATE) ?? State.Disabled;
                })());
            })();
        }
    }));
    updateAutoAttach(((): State => {
        return vscode.workspace.getConfiguration(SETTING_SECTION).get<State>(SETTING_STATE) ?? State.Disabled;
    })());
}
export async function deactivate(): Promise<void> {
    await destroyAttachServer();
}
type PickResult = {
    state: State;
} | {
    setTempDisabled: boolean;
} | {
    scope: vscode.ConfigurationTarget;
} | undefined;
type PickItem = vscode.QuickPickItem & ({
    state: State;
} | {
    setTempDisabled: boolean;
});
/**
 * Turns auto attach on, and returns the server auto attach is listening on
 * if it's successful.
 */
async function createAttachServer(context: vscode.ExtensionContext) {
    const ipcAddress = await getIpcAddress(context);
    if (!ipcAddress) {
        return undefined;
    }
    server = createServerInner(ipcAddress).catch(async (err) => {
        console.error('[debug-auto-launch] Error creating auto attach server: ', err);
        if (process.platform !== 'win32') {
            // On macOS, and perhaps some Linux distros, the temporary directory can
            // sometimes change. If it looks like that's the cause of a listener
            // error, automatically refresh the auto attach vars.
            try {
                await fs.access(dirname(ipcAddress));
            }
            catch {
                console.error('[debug-auto-launch] Refreshing variables from error');
                (() => {
                    updateAutoAttach(State.Disabled);
                    updateAutoAttach(((): State => {
                        return vscode.workspace.getConfiguration(SETTING_SECTION).get<State>(SETTING_STATE) ?? State.Disabled;
                    })());
                })();
                return undefined;
            }
        }
        return undefined;
    });
    return await server;
}
const createServerInner = async (ipcAddress: string) => {
    try {
        return await createServerInstance(ipcAddress);
    }
    catch (e) {
        // On unix/linux, the file can 'leak' if the process exits unexpectedly.
        // If we see this, try to delete the file and then listen again.
        await fs.unlink(ipcAddress).catch(() => undefined);
        return await createServerInstance(ipcAddress);
    }
};
const createServerInstance = (ipcAddress: string) => new Promise<Server>((resolve, reject) => {
    const s = createServer(socket => {
        const data: Buffer[] = [];
        socket.on('data', async (chunk) => {
            if (chunk[chunk.length - 1] !== 0) {
                // terminated with NUL byte
                data.push(chunk);
                return;
            }
            data.push(chunk.slice(0, -1));
            try {
                await vscode.commands.executeCommand('extension.js-debug.autoAttachToProcess', JSON.parse(Buffer.concat(data).toString()));
                socket.write(Buffer.from([0]));
            }
            catch (err) {
                socket.write(Buffer.from([1]));
                console.error(err);
            }
        });
    })
        .on('error', reject)
        .listen(ipcAddress, () => resolve(s));
});
/**
 * Destroys the auto-attach server, if it's running.
 */
async function destroyAttachServer() {
    const instance = await server;
    if (instance) {
        await new Promise(r => instance.close(r));
    }
}
interface CachedIpcState {
    ipcAddress: string;
    jsDebugPath: string | undefined;
    settingsValue: string;
}
/**
 * Ensures the status bar text reflects the current state.
 */
function updateStatusBar(context: vscode.ExtensionContext, state: State, busy = false) {
    if (state === State.Disabled && !busy) {
        statusItem?.hide();
        return;
    }
    if (!statusItem) {
        statusItem = vscode.window.createStatusBarItem('status.debug.autoAttach', vscode.StatusBarAlignment.Left);
        statusItem.name = vscode.l10n.t("Debug Auto Attach");
        statusItem.command = TOGGLE_COMMAND;
        statusItem.tooltip = vscode.l10n.t("Automatically attach to node.js processes in debug mode");
        context.subscriptions.push(statusItem);
    }
    let text = busy ? '$(loading) ' : '';
    text += isTemporarilyDisabled ?
        vscode.l10n.t('Auto Attach: Disabled')
        : {
            [State.Disabled]: vscode.l10n.t('Auto Attach: Disabled'),
            [State.Always]: vscode.l10n.t('Auto Attach: Always'),
            [State.Smart]: vscode.l10n.t('Auto Attach: Smart'),
            [State.OnlyWithFlag]: vscode.l10n.t('Auto Attach: With Flag'),
        }[state];
    statusItem.text = text;
    statusItem.show();
}
/**
 * Updates the auto attach feature based on the user or workspace setting
 */
function updateAutoAttach(newState: State) {
    currentState = currentState.then(async ({ context, state: oldState }) => {
        if (newState === oldState) {
            return { context, state: oldState };
        }
        if (oldState !== null) {
            updateStatusBar(context, oldState, true);
        }
        await {
            async [State.Disabled](context) {
                await (async (context: vscode.ExtensionContext) => {
                    if (server || await context.workspaceState.get(STORAGE_IPC)) {
                        await context.workspaceState.update(STORAGE_IPC, undefined);
                        await vscode.commands.executeCommand('extension.js-debug.clearAutoAttachVariables');
                        await destroyAttachServer();
                    }
                })(context);
            },
            async [State.OnlyWithFlag](context) {
                await createAttachServer(context);
            },
            async [State.Smart](context) {
                await createAttachServer(context);
            },
            async [State.Always](context) {
                await createAttachServer(context);
            },
        }[newState](context);
        isTemporarilyDisabled = false;
        updateStatusBar(context, newState, false);
        return { context, state: newState };
    });
}
/**
 * Gets the IPC address for the server to listen on for js-debug sessions. This
 * is cached such that we can reuse the address of previous activations.
 */
async function getIpcAddress(context: vscode.ExtensionContext) {
    // Iff the `cachedData` is present, the js-debug registered environment
    // variables for this workspace--cachedData is set after successfully
    // invoking the attachment command.
    const cachedIpc = context.workspaceState.get<CachedIpcState>(STORAGE_IPC);
    if (cachedIpc?.jsDebugPath ===
        (vscode.extensions.getExtension('ms-vscode.js-debug-nightly')?.extensionPath ||
            vscode.extensions.getExtension('ms-vscode.js-debug')?.extensionPath) && cachedIpc?.settingsValue ===
        getJsDebugSettingKey()) {
        return cachedIpc.ipcAddress;
    }
    const result = await vscode.commands.executeCommand<{
        ipcAddress: string;
    }>('extension.js-debug.setAutoAttachVariables', cachedIpc?.ipcAddress);
    if (!result) {
        return;
    }
    await context.workspaceState.update(STORAGE_IPC, {
        ipcAddress,
        jsDebugPath,
        settingsValue,
    } satisfies CachedIpcState);
    return result.ipcAddress;
}
function getJsDebugSettingKey() {
    const o: {
        [key: string]: unknown;
    } = {};
    for (const setting of SETTINGS_CAUSE_REFRESH) {
        o[setting] = vscode.workspace.getConfiguration(SETTING_SECTION).get(setting);
    }
    return JSON.stringify(o);
}
