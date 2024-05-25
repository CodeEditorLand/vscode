const path = require("path");

const withDefaults = require("../shared.webpack.config");

module.exports = withDefaults({
	context: __dirname,
	entry: {
		extension: "./src/node/emmetNodeMain.ts",
	},
	output: {
		path: path.join(__dirname, "dist", "node"),
		filename: "emmetNodeMain.js",
	},
});
