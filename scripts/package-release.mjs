import { createWriteStream, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ZipArchive } from 'archiver';

const root = process.cwd();
const artifacts = path.join(root, 'artifacts');
const { version } = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

process.env.SKINALYZE_API_ORIGIN = 'https://www.skinalyze.app';
execFileSync('npm', ['run', 'ci'], { cwd: root, env: process.env, stdio: 'inherit', shell: true });

rmSync(artifacts, { recursive: true, force: true });
mkdirSync(artifacts, { recursive: true });

function zip(outputName, addEntries) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(path.join(artifacts, outputName));
    const archive = new ZipArchive({ zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    addEntries(archive);
    void archive.finalize();
  });
}

await zip(`skinalyze-sync-chrome-v${version}.zip`, (archive) => {
  archive.directory(path.join(root, 'dist', 'chrome'), false);
});

await zip(`skinalyze-sync-firefox-amo-v${version}.zip`, (archive) => {
  archive.directory(path.join(root, 'dist', 'firefox'), false);
});

await zip(`skinalyze-sync-source-v${version}.zip`, (archive) => {
  for (const directory of ['.github', 'docs', 'icons', 'scripts', 'src']) {
    archive.directory(path.join(root, directory), directory);
  }
  for (const file of [
    '.gitignore',
    'CONTRIBUTING.md',
    'LICENSE',
    'NOTICE.md',
    'package-lock.json',
    'package.json',
    'PRIVACY.md',
    'README.md',
    'ROADMAP.md',
    'SECURITY.md',
    'tsconfig.json',
    'webpack.config.js',
  ]) {
    archive.file(path.join(root, file), { name: file });
  }
});

console.log(`release artifacts: ${artifacts}`);
