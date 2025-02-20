/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HtmlNode as HtmlFlatNode } from "EmmetFlatNode";
import * as vscode from "vscode";
import { getRootNode } from "./parseDocument";
import { getEmmetConfiguration, getEmmetMode, getHtmlFlatNode, offsetRangeToVsRange, validate, } from "./util";
export function splitJoinTag() {
    if (!validate(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const rootNode = <HtmlFlatNode>getRootNode(editor.document, true);
    if (!rootNode) {
        return;
    }
    return editor.edit((editBuilder) => {
        Array.from(editor.selections)
            .reverse()
            .forEach((selection) => {
            const nodeToUpdate = getHtmlFlatNode(document.getText(), rootNode, document.offsetAt(selection.start), true);
            if (nodeToUpdate) {
                const textEdit = getRangesToReplace(document, nodeToUpdate);
                editBuilder.replace(textEdit.range, textEdit.newText);
            }
        });
    });
}
function getRangesToReplace(document: vscode.TextDocument, nodeToUpdate: HtmlFlatNode): vscode.TextEdit {
    let rangeToReplace: vscode.Range;
    let textToReplaceWith: string;
    if (!nodeToUpdate.open || !nodeToUpdate.close) {
        const m = document
            .getText()
            .substring(nodeToUpdate.start, nodeToUpdate.end).match(/(\s*\/)?>$/);
        const end = nodeToUpdate.end;
        rangeToReplace = offsetRangeToVsRange(document, (m ? end - m[0].length : end), end);
        textToReplaceWith = `></${nodeToUpdate.name}>`;
    }
    else {
        rangeToReplace = offsetRangeToVsRange(document, (nodeToUpdate.open.end - 1), nodeToUpdate.end);
        textToReplaceWith = "/>";
        const emmetMode = getEmmetMode(document.languageId, {}, []) ?? "";
        const emmetConfig = getEmmetConfiguration(emmetMode);
        if (emmetMode &&
            emmetConfig.syntaxProfiles[emmetMode] &&
            (emmetConfig.syntaxProfiles[emmetMode]["selfClosingStyle"] ===
                "xhtml" ||
                emmetConfig.syntaxProfiles[emmetMode]["self_closing_tag"] ===
                    "xhtml")) {
            textToReplaceWith = " " + textToReplaceWith;
        }
    }
    return new vscode.TextEdit(rangeToReplace, textToReplaceWith);
}
