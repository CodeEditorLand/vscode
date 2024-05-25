/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from "vs/platform/registry/common/platform";
import {
	type IWorkbenchContributionsRegistry,
	Extensions as WorkbenchExtensions,
} from "vs/workbench/common/contributions";
import { BaseLocalizationWorkbenchContribution } from "vs/workbench/contrib/localization/common/localization.contribution";
import { LifecyclePhase } from "vs/workbench/services/lifecycle/common/lifecycle";

export class WebLocalizationWorkbenchContribution extends BaseLocalizationWorkbenchContribution {}

const workbenchRegistry = Registry.as<IWorkbenchContributionsRegistry>(
	WorkbenchExtensions.Workbench,
);
workbenchRegistry.registerWorkbenchContribution(
	WebLocalizationWorkbenchContribution,
	LifecyclePhase.Eventually,
);
