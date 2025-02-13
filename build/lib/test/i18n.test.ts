/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from "assert";
import * as i18n from "../i18n";
suite("XLF Parser Tests", () => {
    const name = "vs/base/common/keybinding";
    test("Keys & messages to XLF conversion", () => {
        const xlf = new i18n.XLF("vscode-workbench");
        xlf.addFile(name, ["key1", "key2"], ["Key #1", "Key #2 &"]);
        assert.strictEqual(xlf.toString().replace(/\s{2,}/g, ""), '<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source></trans-unit></body></file></xliff>');
    });
    test("XLF to keys & messages conversion", () => {
        i18n.XLF.parse('<?xml version="1.0" encoding="utf-8"?><xliff version="1.2" xmlns="urn:oasis:names:tc:xliff:document:1.2"><file original="vs/base/common/keybinding" source-language="en" target-language="ru" datatype="plaintext"><body><trans-unit id="key1"><source xml:lang="en">Key #1</source><target>Кнопка #1</target></trans-unit><trans-unit id="key2"><source xml:lang="en">Key #2 &amp;</source><target>Кнопка #2 &amp;</target></trans-unit></body></file></xliff>').then(function (resolvedFiles) {
            assert.deepStrictEqual(resolvedFiles[0].messages, { key1: "Кнопка #1", key2: "Кнопка #2 &" });
            assert.strictEqual(resolvedFiles[0].name, name);
        });
    });
    test("JSON file source path to Transifex resource match", () => {
        const editorProject: string = "vscode-editor", workbenchProject: string = "vscode-workbench";
        assert.deepStrictEqual(i18n.getResource("vs/platform/actions/browser/menusExtensionPoint"), {
            name: "vs/platform",
            project: editorProject,
        });
        assert.deepStrictEqual(i18n.getResource("vs/editor/contrib/clipboard/browser/clipboard"), {
            name: "vs/editor/contrib",
            project: editorProject,
        });
        assert.deepStrictEqual(i18n.getResource("vs/editor/common/modes/modesRegistry"), { name: "vs/editor", project: editorProject });
        assert.deepStrictEqual(i18n.getResource("vs/base/common/errorMessage"), { name: "vs/base", project: editorProject });
        assert.deepStrictEqual(i18n.getResource("vs/code/electron-main/window"), { name: "vs/code", project: workbenchProject });
        assert.deepStrictEqual(i18n.getResource("vs/workbench/contrib/html/browser/webview"), {
            name: "vs/workbench/contrib/html",
            project: workbenchProject,
        });
        assert.deepStrictEqual(i18n.getResource("vs/workbench/services/textfile/node/testFileService"), {
            name: "vs/workbench/services/textfile",
            project: workbenchProject,
        });
        assert.deepStrictEqual(i18n.getResource("vs/workbench/browser/parts/panel/panelActions"), { name: "vs/workbench", project: workbenchProject });
    });
});
