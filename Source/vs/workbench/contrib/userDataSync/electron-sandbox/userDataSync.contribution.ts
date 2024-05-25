/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "vs/base/common/lifecycle";
import { Schemas } from "vs/base/common/network";
import { ProxyChannel } from "vs/base/parts/ipc/common/ipc";
import { localize, localize2 } from "vs/nls";
import {
	Action2,
	MenuId,
	registerAction2,
} from "vs/platform/actions/common/actions";
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { IFileService } from "vs/platform/files/common/files";
import type { ServicesAccessor } from "vs/platform/instantiation/common/instantiation";
import { ISharedProcessService } from "vs/platform/ipc/electron-sandbox/services";
import { INativeHostService } from "vs/platform/native/common/native";
import {
	INotificationService,
	Severity,
} from "vs/platform/notification/common/notification";
import {
	IUserDataSyncUtilService,
	SyncStatus,
} from "vs/platform/userDataSync/common/userDataSync";
import {
	type IWorkbenchContribution,
	WorkbenchPhase,
	registerWorkbenchContribution2,
} from "vs/workbench/common/contributions";
import {
	CONTEXT_SYNC_STATE,
	DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR,
	IUserDataSyncWorkbenchService,
	SYNC_TITLE,
} from "vs/workbench/services/userDataSync/common/userDataSync";

class UserDataSyncServicesContribution
	extends Disposable
	implements IWorkbenchContribution
{
	static readonly ID = "workbench.contrib.userDataSyncServices";

	constructor(
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@ISharedProcessService sharedProcessService: ISharedProcessService,
	) {
		super();
		sharedProcessService.registerChannel(
			"userDataSyncUtil",
			ProxyChannel.fromService(userDataSyncUtilService, this._store),
		);
	}
}

registerWorkbenchContribution2(
	UserDataSyncServicesContribution.ID,
	UserDataSyncServicesContribution,
	WorkbenchPhase.BlockStartup,
);

registerAction2(
	class OpenSyncBackupsFolder extends Action2 {
		constructor() {
			super({
				id: "workbench.userData.actions.openSyncBackupsFolder",
				title: localize2(
					"Open Backup folder",
					"Open Local Backups Folder",
				),
				category: SYNC_TITLE,
				menu: {
					id: MenuId.CommandPalette,
					when: CONTEXT_SYNC_STATE.notEqualsTo(
						SyncStatus.Uninitialized,
					),
				},
			});
		}
		async run(accessor: ServicesAccessor): Promise<void> {
			const syncHome = accessor.get(IEnvironmentService).userDataSyncHome;
			const nativeHostService = accessor.get(INativeHostService);
			const fileService = accessor.get(IFileService);
			const notificationService = accessor.get(INotificationService);
			if (await fileService.exists(syncHome)) {
				const folderStat = await fileService.resolve(syncHome);
				const item =
					folderStat.children && folderStat.children[0]
						? folderStat.children[0].resource
						: syncHome;
				return nativeHostService.showItemInFolder(
					item.with({ scheme: Schemas.file }).fsPath,
				);
			} else {
				notificationService.info(
					localize(
						"no backups",
						"Local backups folder does not exist",
					),
				);
			}
		}
	},
);

registerAction2(
	class DownloadSyncActivityAction extends Action2 {
		constructor() {
			super(DOWNLOAD_ACTIVITY_ACTION_DESCRIPTOR);
		}

		async run(accessor: ServicesAccessor): Promise<void> {
			const userDataSyncWorkbenchService = accessor.get(
				IUserDataSyncWorkbenchService,
			);
			const notificationService = accessor.get(INotificationService);
			const hostService = accessor.get(INativeHostService);
			const folder =
				await userDataSyncWorkbenchService.downloadSyncActivity();
			if (folder) {
				notificationService.prompt(
					Severity.Info,
					localize(
						"download sync activity complete",
						"Successfully downloaded Settings Sync activity.",
					),
					[
						{
							label: localize("open", "Open Folder"),
							run: () =>
								hostService.showItemInFolder(folder.fsPath),
						},
					],
				);
			}
		}
	},
);
