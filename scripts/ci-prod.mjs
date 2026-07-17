import { execSync } from 'node:child_process';

process.env.SKINALYZE_API_ORIGIN = 'https://www.skinalyze.app';
execSync('npm run ci', { stdio: 'inherit', env: process.env });
