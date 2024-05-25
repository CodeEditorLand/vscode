/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { joinPath } from "vs/base/common/resources";
import { IFileService } from "vs/platform/files/common/files";
import {
	InstantiationType,
	registerSingleton,
} from "vs/platform/instantiation/common/extensions";
import { ILogService } from "vs/platform/log/common/log";
import { IWorkspaceContextService } from "vs/platform/workspace/common/workspace";
import {
	WorkbenchPhase,
	registerWorkbenchContribution2,
} from "vs/workbench/common/contributions";
import { IWorkbenchEnvironmentService } from "vs/workbench/services/environment/common/environmentService";
import { BrowserWorkingCopyBackupTracker } from "vs/workbench/services/workingCopy/browser/workingCopyBackupTracker";
import { IWorkingCopyBackupService } from "vs/workbench/services/workingCopy/common/workingCopyBackup";
import { WorkingCopyBackupService } from "vs/workbench/services/workingCopy/common/workingCopyBackupService";

export class BrowserWorkingCopyBackupService extends WorkingCopyBackupService {
	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IFileService fileService: IFileService,
		@ILogService logService: ILogService,
	) {
		super(
			joinPath(
				environmentService.userRoamingDataHome,
				"Backups",
				contextService.getWorkspace().id,
			),
			fileService,
			logService,
		);
	}
}

// Register Service
registerSingleton(
	IWorkingCopyBackupService,
	BrowserWorkingCopyBackupService,
	InstantiationType.Eager,
);

// Register Backup Tracker
registerWorkbenchContribution2(
	BrowserWorkingCopyBackupTracker.ID,
	BrowserWorkingCopyBackupTracker,
	WorkbenchPhase.BlockStartup,
);
