var updateGrammar = require("vscode-grammar-updater");

async function updateGrammars() {
	await updateGrammar.update(
		"jeff-hykin/better-c-syntax",
		"autogenerated/c.tmLanguage.json",
		"./syntaxes/c.tmLanguage.json",
		undefined,
		"master",
	);

	// The license has changed for these two grammar. We have to freeze them as the new license is not compatible with our license.
	// await updateGrammar.update('jeff-hykin/better-cpp-syntax', 'autogenerated/cpp.tmLanguage.json', './syntaxes/cpp.tmLanguage.json', undefined, 'master');
	// await updateGrammar.update('jeff-hykin/better-cpp-syntax', 'autogenerated/cpp.embedded.macro.tmLanguage.json', './syntaxes/cpp.embedded.macro.tmLanguage.json', undefined, 'master');

	await updateGrammar.update(
		"NVIDIA/cuda-cpp-grammar",
		"syntaxes/cuda-cpp.tmLanguage.json",
		"./syntaxes/cuda-cpp.tmLanguage.json",
		undefined,
		"master",
	);

	// `source.c.platform` which is still included by other grammars
	await updateGrammar.update(
		"textmate/c.tmbundle",
		"Syntaxes/Platform.tmLanguage",
		"./syntaxes/platform.tmLanguage.json",
	);
}

updateGrammars();
