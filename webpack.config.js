const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const FIREFOX_REQUIRED_DATA = [
  'authenticationInfo',
  'personallyIdentifyingInfo',
  'websiteContent',
  'financialAndPaymentInfo',
];

function buildManifest(content, target, apiOrigin) {
  const manifest = JSON.parse(content.toString('utf8').replace(/__API_ORIGIN__/g, apiOrigin));

  if (target === 'firefox') {
    manifest.background = { scripts: ['background.js'] };
    manifest.incognito = 'not_allowed';
    manifest.browser_specific_settings = {
      gecko: {
        id: 'skinalyze-sync@skinalyze.app',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: FIREFOX_REQUIRED_DATA,
          optional: ['technicalAndInteraction'],
        },
      },
    };
  } else {
    manifest.background = { service_worker: 'background.js' };
  }

  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

module.exports = (env = {}) => {
  const target = env.target || process.env.TARGET_BROWSER || 'chrome';
  if (!['chrome', 'firefox'].includes(target)) {
    throw new Error(`Unsupported extension target: ${target}`);
  }

  const apiOrigin = process.env.SKINALYZE_API_ORIGIN || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const apiOriginClean = apiOrigin.replace(/\/$/, '');

  return {
    entry: {
      background: './src/background.ts',
      popup: './src/popup/popup.ts',
      'content/inventory': './src/content/inventory.ts',
    },
    output: {
      path: path.resolve(__dirname, 'dist', target),
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
        __TARGET_BROWSER__: JSON.stringify(target),
      }),
      new MiniCssExtractPlugin({ filename: 'content/skinalyze.css' }),
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'src/manifest.json',
            to: 'manifest.json',
            transform(content) {
              return buildManifest(content, target, apiOriginClean);
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
};
