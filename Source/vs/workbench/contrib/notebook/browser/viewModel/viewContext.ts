/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IBaseCellEditorOptions } from "vs/workbench/contrib/notebook/browser/notebookBrowser";
import type { NotebookOptions } from "vs/workbench/contrib/notebook/browser/notebookOptions";
import type { NotebookEventDispatcher } from "vs/workbench/contrib/notebook/browser/viewModel/eventDispatcher";

export class ViewContext {
	constructor(
		readonly notebookOptions: NotebookOptions,
		readonly eventDispatcher: NotebookEventDispatcher,
		readonly getBaseCellEditorOptions: (
			language: string,
		) => IBaseCellEditorOptions,
	) {}
}
