/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Registry } from "vs/platform/registry/common/platform";
import {
	Extensions,
	type IWorkbenchContributionsRegistry,
} from "vs/workbench/common/contributions";
import {
	BrowserResourcePerformanceMarks,
	BrowserStartupTimings,
} from "vs/workbench/contrib/performance/browser/startupTimings";
import { LifecyclePhase } from "vs/workbench/services/lifecycle/common/lifecycle";

// -- startup timings

Registry.as<IWorkbenchContributionsRegistry>(
	Extensions.Workbench,
).registerWorkbenchContribution(
	BrowserResourcePerformanceMarks,
	LifecyclePhase.Eventually,
);

Registry.as<IWorkbenchContributionsRegistry>(
	Extensions.Workbench,
).registerWorkbenchContribution(
	BrowserStartupTimings,
	LifecyclePhase.Eventually,
);
