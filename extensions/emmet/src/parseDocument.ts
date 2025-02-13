/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import parseStylesheet from "@emmetio/css-parser";
import parse from "@emmetio/html-matcher";
import { Node as FlatNode } from "EmmetFlatNode";
import { TextDocument } from "vscode";
import { isStyleSheet } from "./util";
type Pair<K, V> = {
    key: K;
    value: V;
};
// Map(filename, Pair(fileVersion, rootNodeOfParsedContent))
const _parseCache = new Map<string, Pair<number, FlatNode> | undefined>();
export function getRootNode(document: TextDocument, useCache: boolean): FlatNode {
    const key = document.uri.toString();
    const result = _parseCache.get(key);
    const documentVersion = document.version;
    if (useCache && result) {
        if (documentVersion === result.key) {
            return result.value;
        }
    }
    const rootNode = (isStyleSheet(document.languageId)
        ? parseStylesheet
        : parse)(document.getText());
    if (useCache) {
        _parseCache.set(key, { key: documentVersion, value: rootNode });
    }
    return rootNode;
}
export function addFileToParseCache(document: TextDocument) {
    _parseCache.set(document.uri.toString(), undefined);
}
export function removeFileFromParseCache(document: TextDocument) {
    _parseCache.delete(document.uri.toString());
}
export function clearParseCache() {
    _parseCache.clear();
}
