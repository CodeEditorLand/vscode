/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HtmlNode as HtmlFlatNode } from "EmmetFlatNode";
import * as vscode from "vscode";
import { getRootNode } from "./parseDocument";
import { getHtmlFlatNode, offsetRangeToVsRange, validate } from "./util";
export function removeTag() {
    if (!validate(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const rootNode = <HtmlFlatNode>getRootNode(editor.document, true);
    if (!rootNode) {
        return;
    }
    return editor.edit((editBuilder) => {
        Array.from(editor.selections)
            .reverse()
            .reduce<vscode.Range[]>((prev, selection) => prev.concat(getRangesToRemove(editor.document, rootNode, selection)), []).forEach((range) => {
            editBuilder.delete(range);
        });
    });
}
/**
 * Calculates the ranges to remove, along with what to replace those ranges with.
 * It finds the node to remove based on the selection's start position
 * and then removes that node, reindenting the content in between.
 */
function getRangesToRemove(document: vscode.TextDocument, rootNode: HtmlFlatNode, selection: vscode.Selection): vscode.Range[] {
    const nodeToUpdate = getHtmlFlatNode(document.getText(), rootNode, document.offsetAt(selection.start), true);
    if (!nodeToUpdate) {
        return [];
    }
    let openTagRange: vscode.Range | undefined;
    if (nodeToUpdate.open) {
        openTagRange = offsetRangeToVsRange(document, nodeToUpdate.open.start, nodeToUpdate.open.end);
    }
    let closeTagRange: vscode.Range | undefined;
    if (nodeToUpdate.close) {
        closeTagRange = offsetRangeToVsRange(document, nodeToUpdate.close.start, nodeToUpdate.close.end);
    }
    if (openTagRange && closeTagRange) {
        // Special case: there is only whitespace in between.
        if (document.getText(new vscode.Range(openTagRange.end.line, openTagRange.end.character, closeTagRange.start.line, closeTagRange.start.character)).trim() === "" &&
            nodeToUpdate.name !== "pre") {
            return [new vscode.Range(openTagRange.start.line, openTagRange.start.character, closeTagRange.end.line, closeTagRange.end.character)];
        }
    }
    const rangesToRemove = [];
    if (openTagRange) {
        rangesToRemove.push(openTagRange);
        if (closeTagRange) {
            let firstInnerNonEmptyLine: number | undefined;
            let lastInnerNonEmptyLine: number | undefined;
            for (let i = openTagRange.start.line + 1; i < closeTagRange.start.line; i++) {
                if (!document.lineAt(i).isEmptyOrWhitespace) {
                    rangesToRemove.push(new vscode.Range(i, 0, i, calculateIndentAmountToRemove(document, openTagRange, closeTagRange)));
                    if (firstInnerNonEmptyLine === undefined) {
                        // We found the first non-empty inner line.
                        firstInnerNonEmptyLine = i;
                    }
                    lastInnerNonEmptyLine = i;
                }
            }
            // Remove the entire last line + empty lines preceding it
            // if it is just the tag, otherwise remove just the tag.
            if (entireLineIsTag(document, closeTagRange) &&
                lastInnerNonEmptyLine) {
                rangesToRemove.push(new vscode.Range(lastInnerNonEmptyLine, document.lineAt(lastInnerNonEmptyLine).range.end.character, closeTagRange.end.line, closeTagRange.end.character));
            }
            else {
                rangesToRemove.push(closeTagRange);
            }
            // Remove the entire first line + empty lines proceding it
            // if it is just the tag, otherwise keep on removing just the tag.
            if (entireLineIsTag(document, openTagRange) &&
                firstInnerNonEmptyLine) {
                rangesToRemove[1] = new vscode.Range(openTagRange.start.line, openTagRange.start.character, firstInnerNonEmptyLine, document.lineAt(firstInnerNonEmptyLine).firstNonWhitespaceCharacterIndex);
                rangesToRemove.shift();
            }
        }
    }
    return rangesToRemove;
}
function entireLineIsTag(document: vscode.TextDocument, range: vscode.Range): boolean {
    if (range.start.line === range.end.line) {
        if (document.lineAt(range.start).text.trim() ===
            document.getText(range)) {
            return true;
        }
    }
    return false;
}
/**
 * Calculates the amount of indent to remove for getRangesToRemove.
 */
function calculateIndentAmountToRemove(document: vscode.TextDocument, openRange: vscode.Range, closeRange: vscode.Range): number {
    const startLine = openRange.start.line;
    const endLine = closeRange.start.line;
    const startLineIndent = document.lineAt(startLine).firstNonWhitespaceCharacterIndex;
    const endLineIndent = document.lineAt(endLine).firstNonWhitespaceCharacterIndex;
    let contentIndent: number | undefined;
    for (let i = startLine + 1; i < endLine; i++) {
        const line = document.lineAt(i);
        if (!line.isEmptyOrWhitespace) {
            const lineIndent = line.firstNonWhitespaceCharacterIndex;
            contentIndent = !contentIndent
                ? lineIndent
                : Math.min(contentIndent, lineIndent);
        }
    }
    let indentAmount = 0;
    if (contentIndent) {
        if (contentIndent < startLineIndent || contentIndent < endLineIndent) {
            indentAmount = 0;
        }
        else {
            indentAmount = Math.min(contentIndent - startLineIndent, contentIndent - endLineIndent);
        }
    }
    return indentAmount;
}
