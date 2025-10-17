import path from "path";
import HtmlWebpackPlugin from "html-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CssMinimizerPlugin from "css-minimizer-webpack-plugin";
import TerserPlugin from "terser-webpack-plugin";
import webpack from "webpack";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default {
    mode: "production",
    entry: "./src/main.js",
    output: {
        path: path.resolve(__dirname, "dist"),
        filename: "bundle.js", // samakan dengan dev
        clean: true,
    },
    devtool: "inline-source-map", // tambahkan agar hasil sama & mudah debug
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, "css-loader"], // ekstrak CSS ke file terpisah (lebih optimal)
            },
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"],
                    },
                },
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: "./index.html",
            minify: false, // nonaktifkan minify agar struktur HTML sama
        }),
        new MiniCssExtractPlugin({
            filename: "styles.css", // nama file sama dengan dev
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: "src/sw.js", to: "" },
                { from: "manifest.json", to: "" },
                { from: "icons", to: "icons" },
                { from: "scripts/pwa-init.js", to: "scripts/" },
            ],
        }),
        new webpack.DefinePlugin({
            "process.env.NODE_ENV": JSON.stringify("production"),
        }),
    ],
    optimization: {
        minimize: false, // nonaktifkan minify agar hasil JS & CSS tidak berubah
        minimizer: [new TerserPlugin(), new CssMinimizerPlugin()],
    },
};
