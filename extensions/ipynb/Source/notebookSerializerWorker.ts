/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parentPort } from "worker_threads";
import type { NotebookData } from "vscode";

import { serializeNotebookToString } from "./serializers";

if (parentPort) {
	parentPort.on(
		"message",
		({ id, data }: { id: string; data: NotebookData }) => {
			if (parentPort) {
				const json = serializeNotebookToString(data);
				const bytes = new TextEncoder().encode(json);
				parentPort.postMessage({ id, data: bytes });
			}
		},
	);
}
