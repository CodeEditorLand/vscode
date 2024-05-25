/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "vs/base/common/lifecycle";
import { Categories } from "vs/platform/action/common/actionCommonCategories";
import { Action2, registerAction2 } from "vs/platform/actions/common/actions";
import {
	IInstantiationService,
	type ServicesAccessor,
} from "vs/platform/instantiation/common/instantiation";
import { Registry } from "vs/platform/registry/common/platform";
import {
	type IWorkbenchContribution,
	type IWorkbenchContributionsRegistry,
	Extensions as WorkbenchExtensions,
} from "vs/workbench/common/contributions";
import { OpenWindowSessionLogFileAction } from "vs/workbench/contrib/logs/common/logsActions";
import { LogsDataCleaner } from "vs/workbench/contrib/logs/common/logsDataCleaner";
import { LifecyclePhase } from "vs/workbench/services/lifecycle/common/lifecycle";

class WebLogOutputChannels
	extends Disposable
	implements IWorkbenchContribution
{
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		this.registerWebContributions();
	}

	private registerWebContributions(): void {
		this.instantiationService.createInstance(LogsDataCleaner);

		this._register(
			registerAction2(
				class extends Action2 {
					constructor() {
						super({
							id: OpenWindowSessionLogFileAction.ID,
							title: OpenWindowSessionLogFileAction.TITLE,
							category: Categories.Developer,
							f1: true,
						});
					}
					run(servicesAccessor: ServicesAccessor): Promise<void> {
						return servicesAccessor
							.get(IInstantiationService)
							.createInstance(
								OpenWindowSessionLogFileAction,
								OpenWindowSessionLogFileAction.ID,
								OpenWindowSessionLogFileAction.TITLE.value,
							)
							.run();
					}
				},
			),
		);
	}
}

Registry.as<IWorkbenchContributionsRegistry>(
	WorkbenchExtensions.Workbench,
).registerWorkbenchContribution(WebLogOutputChannels, LifecyclePhase.Restored);
