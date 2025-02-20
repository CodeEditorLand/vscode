/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Node } from "EmmetFlatNode";
import * as vscode from "vscode";
import { getRootNode } from "./parseDocument";
import { getFlatNode, offsetRangeToVsRange, validate } from "./util";
export function mergeLines() {
    if (!validate(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const rootNode = getRootNode(editor.document, true);
    if (!rootNode) {
        return;
    }
    return editor.edit((editBuilder) => {
        Array.from(editor.selections)
            .reverse()
            .forEach((selection) => {
            const textEdit = getRangesToReplace(editor.document, selection, rootNode);
            if (textEdit) {
                editBuilder.replace(textEdit.range, textEdit.newText);
            }
        });
    });
}
function getRangesToReplace(document: vscode.TextDocument, selection: vscode.Selection, rootNode: Node): vscode.TextEdit | undefined {
    let startNodeToUpdate: Node | undefined;
    let endNodeToUpdate: Node | undefined;
    const selectionStart = document.offsetAt(selection.start);
    if (selection.isEmpty) {
        startNodeToUpdate = endNodeToUpdate = getFlatNode(rootNode, selectionStart, true);
    }
    else {
        startNodeToUpdate = getFlatNode(rootNode, selectionStart, true);
        endNodeToUpdate = getFlatNode(rootNode, document.offsetAt(selection.end), true);
    }
    if (!startNodeToUpdate || !endNodeToUpdate) {
        return;
    }
    const startPos = document.positionAt(startNodeToUpdate.start);
    const startLine = startPos.line;
    const endLine = document.positionAt(endNodeToUpdate.end).line;
    if (startLine === endLine) {
        return;
    }
    let textToReplaceWith = document.lineAt(startLine).text.substr(startPos.character);
    for (let i = startLine + 1; i <= endLine; i++) {
        textToReplaceWith += document.lineAt(i).text.trim();
    }
    return new vscode.TextEdit(offsetRangeToVsRange(document, startNodeToUpdate.start, endNodeToUpdate.end), textToReplaceWith);
}
