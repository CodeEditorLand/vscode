/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { CancellationToken } from "vs/base/common/cancellation";
import type { ResourceSet } from "vs/base/common/map";
import { createDecorator } from "vs/platform/instantiation/common/instantiation";
import type {
	ISearchComplete,
	ISearchProgressItem,
	ITextQuery,
} from "vs/workbench/services/search/common/search";

export const INotebookSearchService = createDecorator<INotebookSearchService>(
	"notebookSearchService",
);

export interface INotebookSearchService {
	readonly _serviceBrand: undefined;

	notebookSearch(
		query: ITextQuery,
		token: CancellationToken | undefined,
		searchInstanceID: string,
		onProgress?: (result: ISearchProgressItem) => void,
	): {
		openFilesToScan: ResourceSet;
		completeData: Promise<ISearchComplete>;
		allScannedFiles: Promise<ResourceSet>;
	};
}
