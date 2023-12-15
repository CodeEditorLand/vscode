/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
declare module "vscode" {
	export interface NotebookController {
		/** Set this to attach a variable provider to this controller. */
		variableProvider?: NotebookVariableProvider;
	}

	export enum NotebookVariablesRequestKind {
		Named = 1,
		Indexed = 2,
	}

	interface VariablesResult {
		variable: Variable;
		namedChildrenCount: number;
		indexedChildrenCount: number;
	}

	interface NotebookVariableProvider {
		onDidChangeVariables: Event<NotebookDocument>;

		/** When parent is undefined, this is requesting global Variables. When a variable is passed, it's requesting child props of that Variable. */
		provideVariables(
			notebook: NotebookDocument,
			parent: Variable | undefined,
			kind: NotebookVariablesRequestKind,
			start: number,
			token: CancellationToken,
		): AsyncIterable<VariablesResult>;
	}

	interface Variable {
		/** The variable's name. */
		name: string;

		/** The variable's value.
			This can be a multi-line text, e.g. for a function the body of a function.
			For structured variables (which do not have a simple value), it is recommended to provide a one-line representation of the structured object.
			This helps to identify the structured object in the collapsed state when its children are not yet visible.
			An empty string can be used if no value should be shown in the UI.
		*/
		value: string;
	}
}
