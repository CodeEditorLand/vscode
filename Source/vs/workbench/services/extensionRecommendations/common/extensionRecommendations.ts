/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IStringDictionary } from "vs/base/common/collections";
import type { Event } from "vs/base/common/event";
import type { URI } from "vs/base/common/uri";
import { createDecorator } from "vs/platform/instantiation/common/instantiation";

export enum ExtensionRecommendationReason {
	Workspace = 0,
	File = 1,
	Executable = 2,
	WorkspaceConfig = 3,
	DynamicWorkspace = 4,
	Experimental = 5,
	Application = 6,
}

export interface IExtensionRecommendationReason {
	reasonId: ExtensionRecommendationReason;
	reasonText: string;
}

export const IExtensionRecommendationsService =
	createDecorator<IExtensionRecommendationsService>(
		"extensionRecommendationsService",
	);

export interface IExtensionRecommendationsService {
	readonly _serviceBrand: undefined;

	readonly onDidChangeRecommendations: Event<void>;
	getAllRecommendationsWithReason(): IStringDictionary<IExtensionRecommendationReason>;

	getImportantRecommendations(): Promise<string[]>;
	getOtherRecommendations(): Promise<string[]>;
	getFileBasedRecommendations(): string[];
	getExeBasedRecommendations(
		exe?: string,
	): Promise<{ important: string[]; others: string[] }>;
	getConfigBasedRecommendations(): Promise<{
		important: string[];
		others: string[];
	}>;
	getWorkspaceRecommendations(): Promise<Array<string | URI>>;
	getKeymapRecommendations(): string[];
	getLanguageRecommendations(): string[];
	getRemoteRecommendations(): string[];
}

export type IgnoredRecommendationChangeNotification = {
	extensionId: string;
	isRecommended: boolean;
};

export const IExtensionIgnoredRecommendationsService =
	createDecorator<IExtensionIgnoredRecommendationsService>(
		"IExtensionIgnoredRecommendationsService",
	);

export interface IExtensionIgnoredRecommendationsService {
	readonly _serviceBrand: undefined;

	onDidChangeIgnoredRecommendations: Event<void>;
	readonly ignoredRecommendations: string[];

	onDidChangeGlobalIgnoredRecommendation: Event<IgnoredRecommendationChangeNotification>;
	readonly globalIgnoredRecommendations: string[];
	toggleGlobalIgnoredRecommendation(
		extensionId: string,
		ignore: boolean,
	): void;
}
