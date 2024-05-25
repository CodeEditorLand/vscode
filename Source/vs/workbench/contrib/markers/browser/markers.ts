/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IView } from "vs/workbench/common/views";
import type {
	MarkerElement,
	ResourceMarkers,
} from "vs/workbench/contrib/markers/browser/markersModel";
import type { MarkersFilters } from "vs/workbench/contrib/markers/browser/markersViewActions";
import type { MarkersViewMode } from "vs/workbench/contrib/markers/common/markers";

export interface IMarkersView extends IView {
	readonly filters: MarkersFilters;
	focusFilter(): void;
	clearFilterText(): void;
	getFilterStats(): { total: number; filtered: number };

	getFocusElement(): MarkerElement | undefined;
	getFocusedSelectedElements(): MarkerElement[] | null;
	getAllResourceMarkers(): ResourceMarkers[];

	collapseAll(): void;
	setMultiline(multiline: boolean): void;
	setViewMode(viewMode: MarkersViewMode): void;
}
