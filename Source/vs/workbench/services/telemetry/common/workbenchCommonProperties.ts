/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { INodeProcess } from "vs/base/common/platform";
import {
	type IStorageService,
	StorageScope,
} from "vs/platform/storage/common/storage";
import { resolveCommonProperties } from "vs/platform/telemetry/common/commonProperties";
import {
	type ICommonProperties,
	firstSessionDateStorageKey,
	lastSessionDateStorageKey,
} from "vs/platform/telemetry/common/telemetry";
import { cleanRemoteAuthority } from "vs/platform/telemetry/common/telemetryUtils";

export function resolveWorkbenchCommonProperties(
	storageService: IStorageService,
	release: string,
	hostname: string,
	commit: string | undefined,
	version: string | undefined,
	machineId: string,
	sqmId: string,
	isInternalTelemetry: boolean,
	process: INodeProcess,
	remoteAuthority?: string,
): ICommonProperties {
	const result = resolveCommonProperties(
		release,
		hostname,
		process.arch,
		commit,
		version,
		machineId,
		sqmId,
		isInternalTelemetry,
	);
	const firstSessionDate = storageService.get(
		firstSessionDateStorageKey,
		StorageScope.APPLICATION,
	)!;
	const lastSessionDate = storageService.get(
		lastSessionDateStorageKey,
		StorageScope.APPLICATION,
	)!;

	// __GDPR__COMMON__ "common.version.shell" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result["common.version.shell"] = process.versions?.["electron"];
	// __GDPR__COMMON__ "common.version.renderer" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result["common.version.renderer"] = process.versions?.["chrome"];
	// __GDPR__COMMON__ "common.firstSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result["common.firstSessionDate"] = firstSessionDate;
	// __GDPR__COMMON__ "common.lastSessionDate" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result["common.lastSessionDate"] = lastSessionDate || "";
	// __GDPR__COMMON__ "common.isNewSession" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result["common.isNewSession"] = lastSessionDate ? "0" : "1";
	// __GDPR__COMMON__ "common.remoteAuthority" : { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
	result["common.remoteAuthority"] = cleanRemoteAuthority(remoteAuthority);
	// __GDPR__COMMON__ "common.cli" : { "classification": "SystemMetaData", "purpose": "FeatureInsight" }
	result["common.cli"] = !!process.env["VSCODE_CLI"];

	return result;
}
