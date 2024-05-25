/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import TelemetryReporter from "@vscode/extension-telemetry";
import {
	Disposable,
	type ExtensionContext,
	LogLevel,
	type LogOutputChannel,
	Uri,
	type WorkspaceFolder,
	commands,
	env,
	l10n,
	version as vscodeVersion,
	window,
	workspace,
} from "vscode";
import { registerAPICommands } from "./api/api1";
import { GitExtensionImpl } from "./api/extension";
import type { GitExtension } from "./api/git";
import { Askpass } from "./askpass";
import { CommandCenter } from "./commands";
import { GitDecorations } from "./decorationProvider";
import {
	GitCommitInputBoxCodeActionsProvider,
	GitCommitInputBoxDiagnosticsManager,
} from "./diagnostics";
import { GitEditSessionIdentityProvider } from "./editSessionIdentityProvider";
import { GitFileSystemProvider } from "./fileSystemProvider";
import { Git, type IGit, findGit } from "./git";
import { GitEditor } from "./gitEditor";
import { type IPCServer, createIPCServer } from "./ipc/ipcServer";
import { Model } from "./model";
import { GitPostCommitCommandsProvider } from "./postCommitCommands";
import { GitProtocolHandler } from "./protocolHandler";
import { TerminalEnvironmentManager } from "./terminal";
import { GitTimelineProvider } from "./timelineProvider";
import { eventToPromise, filterEvent, toDisposable } from "./util";

const deactivateTasks: { (): Promise<any> }[] = [];

export async function deactivate(): Promise<any> {
	for (const task of deactivateTasks) {
		await task();
	}
}

async function createModel(
	context: ExtensionContext,
	logger: LogOutputChannel,
	telemetryReporter: TelemetryReporter,
	disposables: Disposable[],
): Promise<Model> {
	const pathValue = workspace
		.getConfiguration("git")
		.get<string | string[]>("path");
	let pathHints = Array.isArray(pathValue)
		? pathValue
		: pathValue
			? [pathValue]
			: [];

	const { isTrusted, workspaceFolders = [] } = workspace;
	const excludes = isTrusted
		? []
		: workspaceFolders.map((f) =>
				path.normalize(f.uri.fsPath).replace(/[\r\n]+$/, ""),
			);

	if (!isTrusted && pathHints.length !== 0) {
		// Filter out any non-absolute paths
		pathHints = pathHints.filter((p) => path.isAbsolute(p));
	}

	const info = await findGit(
		pathHints,
		(gitPath) => {
			logger.info(l10n.t('Validating found git in: "{0}"', gitPath));
			if (excludes.length === 0) {
				return true;
			}

			const normalized = path.normalize(gitPath).replace(/[\r\n]+$/, "");
			const skip = excludes.some((e) => normalized.startsWith(e));
			if (skip) {
				logger.info(l10n.t('Skipped found git in: "{0}"', gitPath));
			}
			return !skip;
		},
		logger,
	);

	let ipcServer: IPCServer | undefined = undefined;

	try {
		ipcServer = await createIPCServer(context.storagePath);
	} catch (err) {
		logger.error(`Failed to create git IPC: ${err}`);
	}

	const askpass = new Askpass(ipcServer);
	disposables.push(askpass);

	const gitEditor = new GitEditor(ipcServer);
	disposables.push(gitEditor);

	const environment = {
		...askpass.getEnv(),
		...gitEditor.getEnv(),
		...ipcServer?.getEnv(),
	};
	const terminalEnvironmentManager = new TerminalEnvironmentManager(context, [
		askpass,
		gitEditor,
		ipcServer,
	]);
	disposables.push(terminalEnvironmentManager);

	logger.info(l10n.t('Using git "{0}" from "{1}"', info.version, info.path));

	const git = new Git({
		gitPath: info.path,
		userAgent: `git/${info.version} (${
			(os as any).version?.() ?? os.type()
		} ${os.release()}; ${os.platform()} ${os.arch()}) vscode/${vscodeVersion} (${
			env.appName
		})`,
		version: info.version,
		env: environment,
	});
	const model = new Model(
		git,
		askpass,
		context.globalState,
		context.workspaceState,
		logger,
		telemetryReporter,
	);
	disposables.push(model);

	const onRepository = () =>
		commands.executeCommand(
			"setContext",
			"gitOpenRepositoryCount",
			`${model.repositories.length}`,
		);
	model.onDidOpenRepository(onRepository, null, disposables);
	model.onDidCloseRepository(onRepository, null, disposables);
	onRepository();

	const onOutput = (str: string) => {
		const lines = str.split(/\r?\n/gm);

		while (/^\s*$/.test(lines[lines.length - 1])) {
			lines.pop();
		}

		logger.appendLine(lines.join("\n"));
	};
	git.onOutput.addListener("log", onOutput);
	disposables.push(
		toDisposable(() => git.onOutput.removeListener("log", onOutput)),
	);

	const cc = new CommandCenter(
		git,
		model,
		context.globalState,
		logger,
		telemetryReporter,
	);
	disposables.push(
		cc,
		new GitFileSystemProvider(model),
		new GitDecorations(model),
		new GitTimelineProvider(model, cc),
		new GitEditSessionIdentityProvider(model),
	);

	const postCommitCommandsProvider = new GitPostCommitCommandsProvider();
	model.registerPostCommitCommandsProvider(postCommitCommandsProvider);

	const diagnosticsManager = new GitCommitInputBoxDiagnosticsManager(model);
	disposables.push(diagnosticsManager);

	const codeActionsProvider = new GitCommitInputBoxCodeActionsProvider(
		diagnosticsManager,
	);
	disposables.push(codeActionsProvider);

	checkGitVersion(info);
	commands.executeCommand(
		"setContext",
		"gitVersion2.35",
		git.compareGitVersionTo("2.35") >= 0,
	);

	return model;
}

async function isGitRepository(folder: WorkspaceFolder): Promise<boolean> {
	if (folder.uri.scheme !== "file") {
		return false;
	}

	const dotGit = path.join(folder.uri.fsPath, ".git");

	try {
		const dotGitStat = await new Promise<fs.Stats>((c, e) =>
			fs.stat(dotGit, (err, stat) => (err ? e(err) : c(stat))),
		);
		return dotGitStat.isDirectory();
	} catch (err) {
		return false;
	}
}

async function warnAboutMissingGit(): Promise<void> {
	const config = workspace.getConfiguration("git");
	const shouldIgnore =
		config.get<boolean>("ignoreMissingGitWarning") === true;

	if (shouldIgnore) {
		return;
	}

	if (!workspace.workspaceFolders) {
		return;
	}

	const areGitRepositories = await Promise.all(
		workspace.workspaceFolders.map(isGitRepository),
	);

	if (areGitRepositories.every((isGitRepository) => !isGitRepository)) {
		return;
	}

	const download = l10n.t("Download Git");
	const neverShowAgain = l10n.t("Don't Show Again");
	const choice = await window.showWarningMessage(
		l10n.t(
			'Git not found. Install it or configure it using the "git.path" setting.',
		),
		download,
		neverShowAgain,
	);

	if (choice === download) {
		commands.executeCommand(
			"vscode.open",
			Uri.parse("https://aka.ms/vscode-download-git"),
		);
	} else if (choice === neverShowAgain) {
		await config.update("ignoreMissingGitWarning", true, true);
	}
}

export async function _activate(
	context: ExtensionContext,
): Promise<GitExtensionImpl> {
	const disposables: Disposable[] = [];
	context.subscriptions.push(
		new Disposable(() => Disposable.from(...disposables).dispose()),
	);

	const logger = window.createOutputChannel("Git", { log: true });
	disposables.push(logger);

	const onDidChangeLogLevel = (logLevel: LogLevel) => {
		logger.appendLine(l10n.t("Log level: {0}", LogLevel[logLevel]));
	};
	disposables.push(logger.onDidChangeLogLevel(onDidChangeLogLevel));
	onDidChangeLogLevel(logger.logLevel);

	const { aiKey } = require("../package.json") as { aiKey: string };
	const telemetryReporter = new TelemetryReporter(aiKey);
	deactivateTasks.push(() => telemetryReporter.dispose());

	const config = workspace.getConfiguration("git", null);
	const enabled = config.get<boolean>("enabled");

	if (!enabled) {
		const onConfigChange = filterEvent(
			workspace.onDidChangeConfiguration,
			(e) => e.affectsConfiguration("git"),
		);
		const onEnabled = filterEvent(
			onConfigChange,
			() =>
				workspace
					.getConfiguration("git", null)
					.get<boolean>("enabled") === true,
		);
		const result = new GitExtensionImpl();

		eventToPromise(onEnabled).then(
			async () =>
				(result.model = await createModel(
					context,
					logger,
					telemetryReporter,
					disposables,
				)),
		);
		return result;
	}

	try {
		const model = await createModel(
			context,
			logger,
			telemetryReporter,
			disposables,
		);
		return new GitExtensionImpl(model);
	} catch (err) {
		if (!/Git installation not found/.test(err.message || "")) {
			throw err;
		}

		console.warn(err.message);
		logger.warn(err.message);

		/* __GDPR__
			"git.missing" : {
				"owner": "lszomoru"
			}
		*/
		telemetryReporter.sendTelemetryEvent("git.missing");

		commands.executeCommand("setContext", "git.missing", true);
		warnAboutMissingGit();

		return new GitExtensionImpl();
	} finally {
		disposables.push(new GitProtocolHandler(logger));
	}
}

let _context: ExtensionContext;
export function getExtensionContext(): ExtensionContext {
	return _context;
}

export async function activate(
	context: ExtensionContext,
): Promise<GitExtension> {
	_context = context;

	const result = await _activate(context);
	context.subscriptions.push(registerAPICommands(result));
	return result;
}

async function checkGitv1(info: IGit): Promise<void> {
	const config = workspace.getConfiguration("git");
	const shouldIgnore = config.get<boolean>("ignoreLegacyWarning") === true;

	if (shouldIgnore) {
		return;
	}

	if (!/^[01]/.test(info.version)) {
		return;
	}

	const update = l10n.t("Update Git");
	const neverShowAgain = l10n.t("Don't Show Again");

	const choice = await window.showWarningMessage(
		l10n.t(
			'You seem to have git "{0}" installed. Code works best with git >= 2',
			info.version,
		),
		update,
		neverShowAgain,
	);

	if (choice === update) {
		commands.executeCommand(
			"vscode.open",
			Uri.parse("https://aka.ms/vscode-download-git"),
		);
	} else if (choice === neverShowAgain) {
		await config.update("ignoreLegacyWarning", true, true);
	}
}

async function checkGitWindows(info: IGit): Promise<void> {
	if (!/^2\.(25|26)\./.test(info.version)) {
		return;
	}

	const config = workspace.getConfiguration("git");
	const shouldIgnore =
		config.get<boolean>("ignoreWindowsGit27Warning") === true;

	if (shouldIgnore) {
		return;
	}

	const update = l10n.t("Update Git");
	const neverShowAgain = l10n.t("Don't Show Again");
	const choice = await window.showWarningMessage(
		l10n.t(
			'There are known issues with the installed Git "{0}". Please update to Git >= 2.27 for the git features to work correctly.',
			info.version,
		),
		update,
		neverShowAgain,
	);

	if (choice === update) {
		commands.executeCommand(
			"vscode.open",
			Uri.parse("https://aka.ms/vscode-download-git"),
		);
	} else if (choice === neverShowAgain) {
		await config.update("ignoreWindowsGit27Warning", true, true);
	}
}

async function checkGitVersion(info: IGit): Promise<void> {
	await checkGitv1(info);

	if (process.platform === "win32") {
		await checkGitWindows(info);
	}
}
