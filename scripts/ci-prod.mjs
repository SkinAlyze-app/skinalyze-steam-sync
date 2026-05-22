import { execSync } from 'node:child_process';

process.env.SKINALYZE_API_ORIGIN = 'https://skinalyze.app';
execSync('npm run build', { stdio: 'inherit', env: process.env });
