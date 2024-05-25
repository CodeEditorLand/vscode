/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from "vs/base/common/lifecycle";
import { RedoCommand, UndoCommand } from "vs/editor/browser/editorExtensions";
import {
	WorkbenchPhase,
	registerWorkbenchContribution2,
} from "vs/workbench/common/contributions";
import {
	CellEditState,
	getNotebookEditorFromEditorPane,
} from "vs/workbench/contrib/notebook/browser/notebookBrowser";
import type { NotebookViewModel } from "vs/workbench/contrib/notebook/browser/viewModel/notebookViewModelImpl";
import { CellKind } from "vs/workbench/contrib/notebook/common/notebookCommon";
import { IEditorService } from "vs/workbench/services/editor/common/editorService";

class NotebookUndoRedoContribution extends Disposable {
	static readonly ID = "workbench.contrib.notebookUndoRedo";

	constructor(@IEditorService private readonly _editorService: IEditorService) {
		super();

		const PRIORITY = 105;
		this._register(UndoCommand.addImplementation(PRIORITY, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const viewModel = editor?.getViewModel() as NotebookViewModel | undefined;
			if (editor && editor.hasModel() && viewModel) {
				return viewModel.undo().then(cellResources => {
					if (cellResources?.length) {
						for (let i = 0; i < editor.getLength(); i++) {
							const cell = editor.cellAt(i);
							if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
								cell.updateEditState(CellEditState.Editing, 'undo');
							}
						}

						editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
					}
				});
			}

			return false;
		}));

		this._register(RedoCommand.addImplementation(PRIORITY, 'notebook-undo-redo', () => {
			const editor = getNotebookEditorFromEditorPane(this._editorService.activeEditorPane);
			const viewModel = editor?.getViewModel() as NotebookViewModel | undefined;

			if (editor && editor.hasModel() && viewModel) {
				return viewModel.redo().then(cellResources => {
					if (cellResources?.length) {
						for (let i = 0; i < editor.getLength(); i++) {
							const cell = editor.cellAt(i);
							if (cell.cellKind === CellKind.Markup && cellResources.find(resource => resource.fragment === cell.model.uri.fragment)) {
								cell.updateEditState(CellEditState.Editing, 'redo');
							}
						}

						editor?.setOptions({ cellOptions: { resource: cellResources[0] }, preserveFocus: true });
					}
				});
			}

			return false;
		}));
	}
}

registerWorkbenchContribution2(
	NotebookUndoRedoContribution.ID,
	NotebookUndoRedoContribution,
	WorkbenchPhase.BlockRestore,
);
