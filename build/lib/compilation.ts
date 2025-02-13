/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import fs from "fs";
import os from "os";
import path from "path";
import ansiColors from "ansi-colors";
import es from "event-stream";
import fancyLog from "fancy-log";
import gulp from "gulp";
import { RawSourceMap } from "source-map";
import File from "vinyl";
import { Mangler } from "./mangle/index";
import * as monacodts from "./monaco-api";
import * as nls from "./nls";
import { gulpPostcss } from "./postcss";
import { createReporter } from "./reporter";
import * as task from "./task";
import * as util from "./util";
import ts = require("typescript");
const watch = require("./watch");
// --- gulp-tsb: compile and transpile --------------------------------
const reporter = createReporter();
interface ICompileTaskOptions {
    readonly build: boolean;
    readonly emitError: boolean;
    readonly transpileOnly: boolean | {
        esbuild: boolean;
    };
    readonly preserveEnglish: boolean;
}
function createCompile(src: string, { build, emitError, transpileOnly, preserveEnglish }: ICompileTaskOptions) {
    const projectPath = path.join(__dirname, "../../", src, "tsconfig.json");
    const overrideOptions = {
        ...((src: string): ts.CompilerOptions => {
            const rootDir = path.join(__dirname, `../../${src}`);
            const options: ts.CompilerOptions = {};
            options.verbose = false;
            options.sourceMap = true;
            if (process.env["VSCODE_NO_SOURCEMAP"]) {
                // To be used by developers in a hurry
                options.sourceMap = false;
            }
            options.rootDir = rootDir;
            options.baseUrl = rootDir;
            options.sourceRoot = util.toFileUri(rootDir);
            options.newLine = /\r\n/.test(fs.readFileSync(__filename, "utf8")) ? 0 : 1;
            return options;
        })(src),
        inlineSources: Boolean(build),
    };
    if (!build) {
        overrideOptions.inlineSourceMap = true;
    }
    const compilation = (require("./tsb") as typeof import("./tsb")).create(projectPath, overrideOptions, {
        verbose: false,
        transpileOnly: Boolean(transpileOnly),
        transpileWithSwc: typeof transpileOnly !== "boolean" && transpileOnly.esbuild,
    }, (err) => reporter(err));
    function pipeline(token?: util.ICancellationToken) {
        const tsFilter = util.filter((data) => /\.ts$/.test(data.path));
        const noDeclarationsFilter = util.filter((data) => !/\.d\.ts$/.test(data.path));
        const input = es.through();
        const output = input
            .pipe(util.$if((f: File) => /(\/|\\)test(\/|\\).*utf8/.test(f.path), (require("gulp-bom") as typeof import("gulp-bom"))())) // this is required to preserve BOM in test files that loose it otherwise
            .pipe(util.$if(!build &&
            ((f: File) => f.path.endsWith(".js") && !f.path.includes("fixtures")), util.appendOwnPathSourceURL()))
            .pipe(util.$if((f: File) => f.path.endsWith(".css") && !f.path.includes("fixtures"), gulpPostcss([require("postcss-nesting")()], (err) => reporter(String(err)))))
            .pipe(tsFilter)
            .pipe(util.loadSourcemaps())
            .pipe(compilation(token))
            .pipe(noDeclarationsFilter)
            .pipe(util.$if(build, nls.nls({ preserveEnglish })))
            .pipe(noDeclarationsFilter.restore)
            .pipe(util.$if(!transpileOnly, (require("gulp-sourcemaps") as typeof import("gulp-sourcemaps")).write(".", {
            addComment: false,
            includeContent: !!build,
            sourceRoot: overrideOptions.sourceRoot,
        })))
            .pipe(tsFilter.restore)
            .pipe(reporter.end(!!emitError));
        return es.duplex(input, output);
    }
    pipeline.tsProjectSrc = () => {
        return compilation.src({ base: src });
    };
    pipeline.projectPath = projectPath;
    return pipeline;
}
export function transpileTask(src: string, out: string, esbuild: boolean): task.StreamTask {
    const task = () => {
        return gulp.src(`${src}/**`, { base: `${src}` }).pipe(createCompile(src, {
            build: false,
            emitError: true,
            transpileOnly: { esbuild },
            preserveEnglish: false,
        })()).pipe(gulp.dest(out));
    };
    task.taskName = `transpile-${path.basename(src)}`;
    return task;
}
export function compileTask(src: string, out: string, build: boolean, options: {
    disableMangle?: boolean;
    preserveEnglish?: boolean;
} = {}): task.StreamTask {
    const task = () => {
        if (os.totalmem() < 4000000000) {
            throw new Error("compilation requires 4GB of RAM");
        }
        const compile = createCompile(src, {
            build,
            emitError: true,
            transpileOnly: false,
            preserveEnglish: !!options.preserveEnglish,
        });
        const generator = new MonacoGenerator(false);
        if (src === "src") {
            generator.execute();
        }
        // mangle: TypeScript to TypeScript
        let mangleStream = es.through();
        if (build && !options.disableMangle) {
            let ts2tsMangler = new Mangler(compile.projectPath, (...data) => fancyLog(ansiColors.blue("[mangler]"), ...data), { mangleExports: true, manglePrivateFields: true });
            const newContentsByFileName = ts2tsMangler.computeNewFileContents(new Set(["saveState"]));
            mangleStream = es.through(async function write(data: File & {
                sourceMap?: RawSourceMap;
            }) {
                type TypeScriptExt = typeof ts & {
                    normalizePath(path: string): string;
                };
                const newContents = (await newContentsByFileName).get((<TypeScriptExt>ts).normalizePath(data.path));
                if (newContents !== undefined) {
                    data.contents = Buffer.from(newContents.out);
                    data.sourceMap =
                        newContents.sourceMap &&
                            JSON.parse(newContents.sourceMap);
                }
                this.push(data);
            }, async function end() {
                // free resources
                (await newContentsByFileName).clear();
                this.push(null);
                (<any>ts2tsMangler) = undefined;
            });
        }
        return gulp.src(`${src}/**`, { base: `${src}` }).pipe(mangleStream)
            .pipe(generator.stream)
            .pipe(compile())
            .pipe(gulp.dest(out));
    };
    task.taskName = `compile-${path.basename(src)}`;
    return task;
}
export function watchTask(out: string, build: boolean, srcPath: string = "src"): task.StreamTask {
    const task = () => {
        const generator = new MonacoGenerator(true);
        generator.execute();
        return watch(`${srcPath}/**`, {
            base: srcPath,
            readDelay: 200,
        }).pipe(generator.stream)
            .pipe(util.incremental(createCompile(srcPath, {
            build,
            emitError: false,
            transpileOnly: false,
            preserveEnglish: false,
        }), gulp.src(`${srcPath}/**`, { base: srcPath }), true))
            .pipe(gulp.dest(out));
    };
    task.taskName = `watch-${path.basename(out)}`;
    return task;
}
class MonacoGenerator {
    private readonly _isWatch: boolean;
    public readonly stream: NodeJS.ReadWriteStream;
    private readonly _watchedFiles: {
        [filePath: string]: boolean;
    };
    private readonly _fsProvider: monacodts.FSProvider;
    private readonly _declarationResolver: monacodts.DeclarationResolver;
    constructor(isWatch: boolean) {
        this._isWatch = isWatch;
        this.stream = es.through();
        this._watchedFiles = {};
        this._fsProvider = new (class extends monacodts.FSProvider {
            public readFileSync(moduleId: string, filePath: string): Buffer {
                ((moduleId: string, filePath: string) => {
                    if (!this._isWatch) {
                        return;
                    }
                    if (this._watchedFiles[filePath]) {
                        return;
                    }
                    this._watchedFiles[filePath] = true;
                    fs.watchFile(filePath, () => {
                        this._declarationResolver.invalidateCache(moduleId);
                        this._executeSoon();
                    });
                })(moduleId, filePath);
                return super.readFileSync(moduleId, filePath);
            }
        })();
        this._declarationResolver = new monacodts.DeclarationResolver(this._fsProvider);
        if (this._isWatch) {
            fs.watchFile(monacodts.RECIPE_PATH, () => {
                this._executeSoon();
            });
        }
    }
    private _executeSoonTimer: NodeJS.Timeout | null = null;
    private _executeSoon(): void {
        if (this._executeSoonTimer !== null) {
            clearTimeout(this._executeSoonTimer);
            this._executeSoonTimer = null;
        }
        this._executeSoonTimer = setTimeout(() => {
            this._executeSoonTimer = null;
            this.execute();
        }, 20);
    }
    private _run(): monacodts.IMonacoDeclarationResult | null {
        const r = monacodts.run3(this._declarationResolver);
        if (!r && !this._isWatch) {
            // The build must always be able to generate the monaco.d.ts
            throw new Error(`monaco.d.ts generation error - Cannot continue`);
        }
        return r;
    }
    private _log(message: any, ...rest: any[]): void {
        fancyLog(ansiColors.cyan("[monaco.d.ts]"), message, ...rest);
    }
    public execute(): void {
        const result = this._run();
        if (!result) {
            // nothing really changed
            return;
        }
        if (result.isTheSame) {
            return;
        }
        fs.writeFileSync(result.filePath, result.content);
        fs.writeFileSync(path.join(path.join(__dirname, "../../src"), "vs/editor/common/standalone/standaloneEnums.ts"), result.enums);
        this._log(`monaco.d.ts is changed - total time took ${Date.now() -
            Date.now()} ms`);
        if (!this._isWatch) {
            this.stream.emit("error", "monaco.d.ts is no longer up to date. Please run gulp watch and commit the new file.");
        }
    }
}
function generateApiProposalNames() {
    let eol: string;
    try {
        const match = /\r?\n/m.exec(fs.readFileSync("src/vs/platform/extensions/common/extensionsApiProposals.ts", "utf-8"));
        eol = match ? match[0] : os.EOL;
    }
    catch {
        eol = os.EOL;
    }
    const pattern = /vscode\.proposed\.([a-zA-Z\d]+)\.d\.ts$/;
    const proposals = new Map<string, {
        proposal: string;
        version?: number;
    }>();
    const input = es.through();
    const output = input
        .pipe(util.filter((f: File) => pattern.test(f.path)))
        .pipe(es.through((f: File) => {
        const match = pattern.exec(path.basename(f.path));
        if (!match) {
            return;
        }
        const proposalName = match[1];
        const versionMatch = /^\s*\/\/\s*version\s*:\s*(\d+)\s*$/im.exec(f.contents.toString("utf8"));
        const version = versionMatch ? versionMatch[1] : undefined;
        proposals.set(proposalName, {
            proposal: `https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.proposed.${proposalName}.d.ts`,
            version: version ? parseInt(version) : undefined,
        });
    }, function () {
        this.emit("data", new File({
            path: "vs/platform/extensions/common/extensionsApiProposals.ts",
            contents: Buffer.from([
                "/*---------------------------------------------------------------------------------------------",
                " *  Copyright (c) Microsoft Corporation. All rights reserved.",
                " *  Licensed under the MIT License. See License.txt in the project root for license information.",
                " *--------------------------------------------------------------------------------------------*/",
                "",
                "// THIS IS A GENERATED FILE. DO NOT EDIT DIRECTLY.",
                "",
                "const _allApiProposals = {",
                `${[...proposals.keys()].sort().map((proposalName) => {
                    const proposal = proposals.get(proposalName)!;
                    return `\t${proposalName}: {${eol}\t\tproposal: '${proposal.proposal}',${eol}${proposal.version ? `\t\tversion: ${proposal.version}${eol}` : ""}\t}`;
                })
                    .join(`,${eol}`)}`,
                "};",
                "export const allApiProposals = Object.freeze<{ [proposalName: string]: Readonly<{ proposal: string; version?: number }> }>(_allApiProposals);",
                "export type ApiProposalName = keyof typeof _allApiProposals;",
                "",
            ].join(eol)),
        }));
        this.emit("end");
    }));
    return es.duplex(input, output);
}
const apiProposalNamesReporter = createReporter("api-proposal-names");
export const compileApiProposalNamesTask = task.define("compile-api-proposal-names", () => {
    return gulp
        .src("src/vscode-dts/**")
        .pipe(generateApiProposalNames())
        .pipe(gulp.dest("src"))
        .pipe(apiProposalNamesReporter.end(true));
});
export const watchApiProposalNamesTask = task.define("watch-api-proposal-names", () => {
    return watch("src/vscode-dts/**", { readDelay: 200 })
        .pipe(util.debounce(() => gulp
        .src("src/vscode-dts/**")
        .pipe(generateApiProposalNames())
        .pipe(apiProposalNamesReporter.end(true))))
        .pipe(gulp.dest("src"));
});
