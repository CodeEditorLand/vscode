/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from "vs/base/parts/ipc/common/ipc";
import {
	InstantiationType,
	registerSingleton,
} from "vs/platform/instantiation/common/extensions";
import { IMainProcessService } from "vs/platform/ipc/common/mainProcessService";
import { INativeHostService } from "vs/platform/native/common/native";
import { IWorkspacesService } from "vs/platform/workspaces/common/workspaces";

// @ts-ignore: interface is implemented via proxy
export class NativeWorkspacesService implements IWorkspacesService {
	declare readonly _serviceBrand: undefined;

	constructor(
		@IMainProcessService mainProcessService: IMainProcessService,
		@INativeHostService nativeHostService: INativeHostService,
	) {
		return ProxyChannel.toService<IWorkspacesService>(
			mainProcessService.getChannel("workspaces"),
			{ context: nativeHostService.windowId },
		);
	}
}

registerSingleton(
	IWorkspacesService,
	NativeWorkspacesService,
	InstantiationType.Delayed,
);
