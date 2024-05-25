import * as fs from "fs";
import * as path from "path";
import { downloadArtifact } from "@electron/get";
import * as debug from "debug";
import * as extract from "extract-zip";

const root = path.dirname(path.dirname(__dirname));

const d = debug("explorer-appx-fetcher");

export async function downloadExplorerAppx(
	outDir: string,
	quality = "stable",
	targetArch = "x64",
): Promise<void> {
	const fileNamePrefix = quality === "insider" ? "code_insiders" : "code";
	const fileName = `${fileNamePrefix}_explorer_${targetArch}.zip`;

	if (await fs.existsSync(path.resolve(outDir, "resources.pri"))) {
		return;
	}

	if (!(await fs.existsSync(outDir))) {
		await fs.mkdirSync(outDir, { recursive: true });
	}

	d(`downloading ${fileName}`);
	const artifact = await downloadArtifact({
		isGeneric: true,
		version: "3.0.4",
		artifactName: fileName,
		unsafelyDisableChecksums: true,
		mirrorOptions: {
			mirror: "https://github.com/microsoft/vscode-explorer-command/releases/download/",
			customDir: "3.0.4",
			customFilename: fileName,
		},
	});

	d(`unpacking from ${fileName}`);
	await extract(artifact, { dir: fs.realpathSync(outDir) });
}

async function main(outputDir?: string): Promise<void> {
	const arch = process.env["VSCODE_ARCH"];

	if (!outputDir) {
		throw new Error("Required build env not set");
	}

	const product = JSON.parse(
		fs.readFileSync(path.join(root, "product.json"), "utf8"),
	);
	await downloadExplorerAppx(outputDir, (product as any).quality, arch);
}

if (require.main === module) {
	main(process.argv[2]).catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
