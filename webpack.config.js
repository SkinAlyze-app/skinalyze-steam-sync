const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const apiOrigin = process.env.SKINALYZE_API_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
const apiOriginClean = apiOrigin.replace(/\/$/, '');

module.exports = {
  entry: {
    background: './src/background.ts',
    popup: './src/popup/popup.ts',
    'content/inventory': './src/content/inventory.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [{ loader: 'ts-loader', options: { transpileOnly: true } }],
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.mjs'],
    alias: { '@': path.resolve(__dirname, 'src') },
    fallback: {
      buffer: require.resolve('buffer/'),
    },
  },
  plugins: [
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
    }),
    new webpack.DefinePlugin({
      __SKINALYZE_API_ORIGIN__: JSON.stringify(apiOriginClean),
    }),
    new MiniCssExtractPlugin({ filename: 'content/skinalyze.css' }),
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'src/manifest.json',
          to: 'manifest.json',
          transform(content) {
            return Buffer.from(content.toString('utf8').replace(/__API_ORIGIN__/g, apiOriginClean));
          },
        },
        { from: 'icons', to: 'icons', noErrorOnMissing: true },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
      ],
    }),
  ],
  optimization: { minimize: true },
};
