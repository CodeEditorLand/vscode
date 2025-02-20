/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import os from "os";
import path from "path";
import { Stream } from "stream";
import ansiColors from "ansi-colors";
import es from "event-stream";
import fancyLog from "fancy-log";
import rename from "gulp-rename";
import rimraf from "rimraf";
import vfs from "vinyl-fs";
import * as ext from "./extensions";
export interface IExtensionDefinition {
	name: string;
	version: string;
	sha256: string;
	repo: string;
	platforms?: string[];
	vsix?: string;
	metadata: {
		id: string;
		publisherId: {
			publisherId: string;
			publisherName: string;
			displayName: string;
			flags: string;
		};
		publisherDisplayName: string;
	};
}
const productjson = JSON.parse(fs.readFileSync(path.join(__dirname, "../../product.json"), "utf8"));
const controlFilePath = path.join(os.homedir(), ".vscode-oss-dev", "extensions", "control.json");
function log(...messages: string[]): void {
    if (!process.env["VSCODE_BUILD_BUILTIN_EXTENSIONS_SILENCE_PLEASE"]) {
        fancyLog(...messages);
    }
}
function getExtensionPath(extension: IExtensionDefinition): string {
    return path.join(path.dirname(path.dirname(__dirname)), ".build", "builtInExtensions", extension.name);
}
function isUpToDate(extension: IExtensionDefinition): boolean {
    const packagePath = path.join(getExtensionPath(extension), "package.json");
    if (!fs.existsSync(packagePath)) {
        return false;
    }
    try {
        return JSON.parse(fs.readFileSync(packagePath, { encoding: "utf8" })).version
            === extension.version;
    }
    catch (err) {
        return false;
    }
}
function getExtensionDownloadStream(extension: IExtensionDefinition) {
	let input: Stream;

	if (extension.vsix) {
		input = ext.fromVsix(path.join(root, extension.vsix), extension);
	} else if (productjson.extensionsGallery?.serviceUrl) {
		input = ext.fromMarketplace(productjson.extensionsGallery.serviceUrl, extension);
	} else {
		input = ext.fromGithub(extension);
	}

	return input.pipe(rename(p => p.dirname = `${extension.name}/${p.dirname}`));
}
export function getExtensionStream(extension: IExtensionDefinition) {
    // if the extension exists on disk, use those files instead of downloading anew
    if (isUpToDate(extension)) {
        log("[extensions]", `${extension.name}@${extension.version} up to date`, ansiColors.green("✔︎"));
        return vfs
            .src(["**"], { cwd: getExtensionPath(extension), dot: true })
            .pipe(rename((p) => (p.dirname = `${extension.name}/${p.dirname}`)));
    }
    return getExtensionDownloadStream(extension);
}
interface IControlFile {
    [name: string]: "disabled" | "marketplace";
}
export function getBuiltInExtensions(): Promise<void> {
    log("Synchronizing built-in extensions...");
    log(`You can manage built-in extensions with the ${ansiColors.cyan("--builtin")} flag`);
    const control = ((): IControlFile => {
        try {
            return JSON.parse(fs.readFileSync(controlFilePath, "utf8"));
        }
        catch (err) {
            return {};
        }
    })();
    const streams: Stream[] = [];
    for (const extension of [...(<IExtensionDefinition[]>productjson.builtInExtensions || []), ...(<IExtensionDefinition[]>productjson.webBuiltInExtensions || [])]) {
        const controlState = control[extension.name] || "marketplace";
        control[extension.name] = controlState;
        streams.push(((extension: IExtensionDefinition, controlState: "disabled" | "marketplace"): Stream => {
            if (extension.platforms) {
                if (!new Set(extension.platforms).has(process.platform)) {
                    log(ansiColors.gray("[skip]"), `${extension.name}@${extension.version}: Platform '${process.platform}' not supported: [${extension.platforms}]`, ansiColors.green("✔︎"));
                    return es.readArray([]);
                }
            }
            switch (controlState) {
                case "disabled":
                    log(ansiColors.blue("[disabled]"), ansiColors.gray(extension.name));
                    return es.readArray([]);
                case "marketplace":
                    return ((extension: IExtensionDefinition): Stream => {
                        const source = ansiColors.blue(productjson.extensionsGallery?.serviceUrl
                            ? "[marketplace]" : "[github]");
                        if (isUpToDate(extension)) {
                            log(source, `${extension.name}@${extension.version}`, ansiColors.green("✔︎"));
                            return es.readArray([]);
                        }
                        rimraf.sync(getExtensionPath(extension));
                        return getExtensionDownloadStream(extension)
                            .pipe(vfs.dest(".build/builtInExtensions"))
                            .on("end", () => log(source, extension.name, ansiColors.green("✔︎")));
                    })(extension);
                default:
                    if (!fs.existsSync(controlState)) {
                        log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but that path does not exist.`));
                        return es.readArray([]);
                    }
                    else if (!fs.existsSync(path.join(controlState, "package.json"))) {
                        log(ansiColors.red(`Error: Built-in extension '${extension.name}' is configured to run from '${controlState}' but there is no 'package.json' file in that directory.`));
                        return es.readArray([]);
                    }
                    log(ansiColors.blue("[local]"), `${extension.name}: ${ansiColors.cyan(controlState)}`, ansiColors.green("✔︎"));
                    return es.readArray([]);
            }
        })(extension, controlState));
    }
    ((control: IControlFile): void => {
        fs.mkdirSync(path.dirname(controlFilePath), { recursive: true });
        fs.writeFileSync(controlFilePath, JSON.stringify(control, null, 2));
    })(control);
    return new Promise((resolve, reject) => {
        es.merge(streams).on("error", reject).on("end", resolve);
    });
}
if (require.main === module) {
    getBuiltInExtensions()
        .then(() => process.exit(0))
        .catch((err) => {
        console.error(err);
        process.exit(1);
    });
}
