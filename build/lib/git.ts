/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import path from "path";
/**
 * Returns the sha1 commit version of a repository or undefined in case of failure.
 */
export function getVersion(repo: string): string | undefined {
    const git = path.join(repo, ".git");
    let head: string;
    try {
        head = fs.readFileSync(path.join(git, "HEAD"), "utf8").trim();
    }
    catch (e) {
        return undefined;
    }
    if (/^[0-9a-f]{40}$/i.test(head)) {
        return head;
    }
    const refMatch = /^ref: (.*)$/.exec(head);
    if (!refMatch) {
        return undefined;
    }
    const ref = refMatch[1];
    try {
        return fs.readFileSync(path.join(git, ref), "utf8").trim();
    }
    catch (e) {
        // noop
    }
    let refsRaw: string;
    try {
        refsRaw = fs.readFileSync(path.join(git, "packed-refs"), "utf8").trim();
    }
    catch (e) {
        return undefined;
    }
    let refsMatch: RegExpExecArray | null;
    const refs: {
        [ref: string]: string;
    } = {};
    while ((refsMatch = /^([0-9a-f]{40})\s+(.+)$/gm.exec(refsRaw))) {
        refs[refsMatch[2]] = refsMatch[1];
    }
    return refs[ref];
}
