import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const domainDir = path.join(repoRoot, 'packages', 'domain');

execSync('npm install && npm run compile', { cwd: domainDir, stdio: 'inherit' });
