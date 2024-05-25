const withDefaults = require("../../shared.webpack.config");
const path = require("path");

module.exports = withDefaults({
	context: path.join(__dirname),
	entry: {
		extension: "./src/node/cssServerNodeMain.ts",
	},
	output: {
		filename: "cssServerMain.js",
		path: path.join(__dirname, "dist", "node"),
	},
});
