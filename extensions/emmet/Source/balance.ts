/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { HtmlNode as HtmlFlatNode } from "EmmetFlatNode";
import * as vscode from "vscode";
import { getRootNode } from "./parseDocument";
import { getHtmlFlatNode, offsetRangeToSelection, validate } from "./util";
let balanceOutStack: Array<readonly vscode.Selection[]> = [];
let lastBalancedSelections: readonly vscode.Selection[] = [];
export function balanceOut() {
    balance(true);
}
export function balanceIn() {
    balance(false);
}
function balance(out: boolean) {
    if (!validate(false) || !vscode.window.activeTextEditor) {
        return;
    }
    const editor = vscode.window.activeTextEditor;
    const document = editor.document;
    const rootNode = <HtmlFlatNode>getRootNode(document, true);
    if (!rootNode) {
        return;
    }
    let newSelections: readonly vscode.Selection[] = editor.selections.map((selection) => {
        return (out ? getRangeToBalanceOut : getRangeToBalanceIn)(document, rootNode, selection);
    });
    // check whether we are starting a balance elsewhere
    if (areSameSelections(lastBalancedSelections, editor.selections)) {
        // we are not starting elsewhere, so use the stack as-is
        if (out) {
            // make sure we are able to expand outwards
            if (!areSameSelections(editor.selections, newSelections)) {
                balanceOutStack.push(editor.selections);
            }
        }
        else if (balanceOutStack.length) {
            newSelections = balanceOutStack.pop()!;
        }
    }
    else {
        // we are starting elsewhere, so reset the stack
        balanceOutStack = out ? [editor.selections] : [];
    }
    editor.selections = newSelections;
    lastBalancedSelections = editor.selections;
}
function getRangeToBalanceOut(document: vscode.TextDocument, rootNode: HtmlFlatNode, selection: vscode.Selection): vscode.Selection {
    const offset = document.offsetAt(selection.start);
    const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, offset, false);
    if (!nodeToBalance) {
        return selection;
    }
    if (!nodeToBalance.open || !nodeToBalance.close) {
        return offsetRangeToSelection(document, nodeToBalance.start, nodeToBalance.end);
    }
    // Set reverse direction if we were in the end tag
    let innerSelection: vscode.Selection;
    let outerSelection: vscode.Selection;
    if (nodeToBalance.close.start <= offset &&
        nodeToBalance.close.end > offset) {
        innerSelection = offsetRangeToSelection(document, nodeToBalance.close.start, nodeToBalance.open.end);
        outerSelection = offsetRangeToSelection(document, nodeToBalance.close.end, nodeToBalance.open.start);
    }
    else {
        innerSelection = offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
        outerSelection = offsetRangeToSelection(document, nodeToBalance.open.start, nodeToBalance.close.end);
    }
    if (innerSelection.contains(selection) &&
        !innerSelection.isEqual(selection)) {
        return innerSelection;
    }
    if (outerSelection.contains(selection) &&
        !outerSelection.isEqual(selection)) {
        return outerSelection;
    }
    return selection;
}
function getRangeToBalanceIn(document: vscode.TextDocument, rootNode: HtmlFlatNode, selection: vscode.Selection): vscode.Selection {
    const nodeToBalance = getHtmlFlatNode(document.getText(), rootNode, document.offsetAt(selection.start), true);
    if (!nodeToBalance) {
        return selection;
    }
    const selectionStart = document.offsetAt(selection.start);
    const selectionEnd = document.offsetAt(selection.end);
    if (nodeToBalance.open && nodeToBalance.close) {
        if ((selectionStart === nodeToBalance.start &&
            selectionEnd === nodeToBalance.end)
            ||
                (selectionStart > nodeToBalance.open.start &&
                    selectionStart < nodeToBalance.open.end) ||
            (selectionStart > nodeToBalance.close.start &&
                selectionStart < nodeToBalance.close.end)) {
            return offsetRangeToSelection(document, nodeToBalance.open.end, nodeToBalance.close.start);
        }
    }
    if (!nodeToBalance.firstChild) {
        return selection;
    }
    const firstChild = nodeToBalance.firstChild;
    if (selectionStart === firstChild.start &&
        selectionEnd === firstChild.end &&
        firstChild.open &&
        firstChild.close) {
        return offsetRangeToSelection(document, firstChild.open.end, firstChild.close.start);
    }
    return offsetRangeToSelection(document, firstChild.start, firstChild.end);
}
function areSameSelections(a: readonly vscode.Selection[], b: readonly vscode.Selection[]): boolean {
    if (a.length !== b.length) {
        return false;
    }
    for (let i = 0; i < a.length; i++) {
        if (!a[i].isEqual(b[i])) {
            return false;
        }
    }
    return true;
}
