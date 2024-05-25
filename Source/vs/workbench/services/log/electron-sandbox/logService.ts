/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from "vs/base/common/lifecycle";
import { localize } from "vs/nls";
import { ConsoleLogger, type ILogger } from "vs/platform/log/common/log";
import type { LoggerChannelClient } from "vs/platform/log/common/logIpc";
import { LogService } from "vs/platform/log/common/logService";
import type { INativeWorkbenchEnvironmentService } from "vs/workbench/services/environment/electron-sandbox/environmentService";
import { windowLogId } from "vs/workbench/services/log/common/logConstants";

export class NativeLogService extends LogService {
	constructor(
		loggerService: LoggerChannelClient,
		environmentService: INativeWorkbenchEnvironmentService,
	) {
		const disposables = new DisposableStore();

		const fileLogger = disposables.add(
			loggerService.createLogger(environmentService.logFile, {
				id: windowLogId,
				name: localize("rendererLog", "Window"),
			}),
		);

		let consoleLogger: ILogger;
		if (
			environmentService.isExtensionDevelopment &&
			!!environmentService.extensionTestsLocationURI
		) {
			// Extension development test CLI: forward everything to main side
			consoleLogger = loggerService.createConsoleMainLogger();
		} else {
			// Normal mode: Log to console
			consoleLogger = new ConsoleLogger(fileLogger.getLevel());
		}

		super(fileLogger, [consoleLogger]);

		this._register(disposables);
	}
}
