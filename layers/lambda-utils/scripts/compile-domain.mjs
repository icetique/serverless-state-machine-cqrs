import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const domainDir = path.join(repoRoot, 'packages', 'domain');
const dbPortsDir = path.join(repoRoot, 'packages', 'db-ports');

execSync('npm install && npm run compile', { cwd: domainDir, stdio: 'inherit' });
execSync('npm install && npm run compile', { cwd: dbPortsDir, stdio: 'inherit' });
