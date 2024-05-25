/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "vs/base/common/lifecycle";
import { isEqual, joinPath } from "vs/base/common/resources";
import type { URI } from "vs/base/common/uri";
import type { ServicesAccessor } from "vs/editor/browser/editorExtensions";
import { localize, localize2 } from "vs/nls";
import {
	Action2,
	MenuId,
	registerAction2,
} from "vs/platform/actions/common/actions";
import { ContextKeyExpr } from "vs/platform/contextkey/common/contextkey";
import { IFileService } from "vs/platform/files/common/files";
import {
	type INeverShowAgainOptions,
	INotificationService,
	NeverShowAgainScope,
	Severity,
} from "vs/platform/notification/common/notification";
import {
	IQuickInputService,
	type IQuickPickItem,
} from "vs/platform/quickinput/common/quickInput";
import { Registry } from "vs/platform/registry/common/platform";
import {
	IStorageService,
	StorageScope,
} from "vs/platform/storage/common/storage";
import { isVirtualWorkspace } from "vs/platform/workspace/common/virtualWorkspace";
import {
	IWorkspaceContextService,
	WORKSPACE_SUFFIX,
	WorkbenchState,
	hasWorkspaceFileExtension,
} from "vs/platform/workspace/common/workspace";
import {
	ActiveEditorContext,
	ResourceContextKey,
	TemporaryWorkspaceContext,
} from "vs/workbench/common/contextkeys";
import {
	type IWorkbenchContribution,
	type IWorkbenchContributionsRegistry,
	Extensions as WorkbenchExtensions,
} from "vs/workbench/common/contributions";
import { TEXT_FILE_EDITOR_ID } from "vs/workbench/contrib/files/common/files";
import { IHostService } from "vs/workbench/services/host/browser/host";
import { LifecyclePhase } from "vs/workbench/services/lifecycle/common/lifecycle";

/**
 * A workbench contribution that will look for `.code-workspace` files in the root of the
 * workspace folder and open a notification to suggest to open one of the workspaces.
 */
export class WorkspacesFinderContribution
	extends Disposable
	implements IWorkbenchContribution
{
	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IFileService private readonly fileService: IFileService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.findWorkspaces();
	}

	private async findWorkspaces(): Promise<void> {
		const folder = this.contextService.getWorkspace().folders[0];
		if (
			!folder ||
			this.contextService.getWorkbenchState() !== WorkbenchState.FOLDER ||
			isVirtualWorkspace(this.contextService.getWorkspace())
		) {
			return; // require a single (non virtual) root folder
		}

		const rootFileNames = (
			await this.fileService.resolve(folder.uri)
		).children?.map((child) => child.name);
		if (Array.isArray(rootFileNames)) {
			const workspaceFiles = rootFileNames.filter(
				hasWorkspaceFileExtension,
			);
			if (workspaceFiles.length > 0) {
				this.doHandleWorkspaceFiles(folder.uri, workspaceFiles);
			}
		}
	}

	private doHandleWorkspaceFiles(folder: URI, workspaces: string[]): void {
		const neverShowAgain: INeverShowAgainOptions = {
			id: "workspaces.dontPromptToOpen",
			scope: NeverShowAgainScope.WORKSPACE,
			isSecondary: true,
		};

		// Prompt to open one workspace
		if (workspaces.length === 1) {
			const workspaceFile = workspaces[0];

			this.notificationService.prompt(Severity.Info, localize(
				{
					key: 'foundWorkspace',
					comment: ['{Locked="]({1})"}']
				},
				"This folder contains a workspace file '{0}'. Do you want to open it? [Learn more]({1}) about workspace files.",
				workspaceFile,
				'https://go.microsoft.com/fwlink/?linkid=2025315'
			), [{
				label: localize('openWorkspace', "Open Workspace"),
				run: () => this.hostService.openWindow([{ workspaceUri: joinPath(folder, workspaceFile) }])
			}], {
				neverShowAgain,
				priority: this.storageService.isNew(StorageScope.WORKSPACE) ? undefined // https://github.com/microsoft/vscode/issues/125315 : NotificationPriority.SILENT // https://github.com/microsoft/vscode/issues/125315
			});
		}

		// Prompt to select a workspace from many
		else if (workspaces.length > 1) {
			this.notificationService.prompt(Severity.Info, localize({
				key: 'foundWorkspaces',
				comment: ['{Locked="]({0})"}']
			}, "This folder contains multiple workspace files. Do you want to open one? [Learn more]({0}) about workspace files.", 'https://go.microsoft.com/fwlink/?linkid=2025315'), [{
				label: localize('selectWorkspace', "Select Workspace"),
				run: () => {
					this.quickInputService.pick(
						workspaces.map(workspace => ({ label: workspace } satisfies IQuickPickItem)),
						{ placeHolder: localize('selectToOpen', "Select a workspace to open") }).then(pick => {
							if (pick) {
								this.hostService.openWindow([{ workspaceUri: joinPath(folder, pick.label) }]);
							}
						});
				}
			}], {
				neverShowAgain,
				priority: this.storageService.isNew(StorageScope.WORKSPACE) ? undefined // https://github.com/microsoft/vscode/issues/125315 : NotificationPriority.SILENT // https://github.com/microsoft/vscode/issues/125315
			});
		}
	}
}

Registry.as<IWorkbenchContributionsRegistry>(
	WorkbenchExtensions.Workbench,
).registerWorkbenchContribution(
	WorkspacesFinderContribution,
	LifecyclePhase.Eventually,
);

// Render "Open Workspace" button in *.code-workspace files

registerAction2(
	class extends Action2 {
		constructor() {
			super({
				id: "workbench.action.openWorkspaceFromEditor",
				title: localize2("openWorkspace", "Open Workspace"),
				f1: false,
				menu: {
					id: MenuId.EditorContent,
					when: ContextKeyExpr.and(
						ResourceContextKey.Extension.isEqualTo(
							WORKSPACE_SUFFIX,
						),
						ActiveEditorContext.isEqualTo(TEXT_FILE_EDITOR_ID),
						TemporaryWorkspaceContext.toNegated(),
					),
				},
			});
		}

		async run(accessor: ServicesAccessor, uri: URI): Promise<void> {
			const hostService = accessor.get(IHostService);
			const contextService = accessor.get(IWorkspaceContextService);
			const notificationService = accessor.get(INotificationService);

			if (
				contextService.getWorkbenchState() === WorkbenchState.WORKSPACE
			) {
				const workspaceConfiguration =
					contextService.getWorkspace().configuration;
				if (
					workspaceConfiguration &&
					isEqual(workspaceConfiguration, uri)
				) {
					notificationService.info(
						localize(
							"alreadyOpen",
							"This workspace is already open.",
						),
					);

					return; // workspace already opened
				}
			}

			return hostService.openWindow([{ workspaceUri: uri }]);
		}
	},
);
