import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const layerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(layerRoot, '../..');
const scopeDir = path.join(layerRoot, 'nodejs', 'node_modules', '@serverless-state-machine-cqrs');

const copyDistWithoutTests = (sourceDist, targetDir) => {
    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(targetDir, { recursive: true });

    for (const entry of fs.readdirSync(sourceDist, { withFileTypes: true })) {
        if (entry.name === 'tests') {
            continue;
        }

        const sourcePath = path.join(sourceDist, entry.name);
        const destPath = path.join(targetDir, entry.name);

        if (entry.isDirectory()) {
            fs.cpSync(sourcePath, destPath, { recursive: true });
        } else {
            fs.copyFileSync(sourcePath, destPath);
        }
    }
};

const publishPackage = (name, packageDir) => {
    if (name !== 'domain') {
        execSync('npm install && npm run compile', { cwd: packageDir, stdio: 'inherit' });
    }

    const distDir = path.join(packageDir, 'dist');
    const targetDir = path.join(scopeDir, name);

    copyDistWithoutTests(distDir, targetDir);

    const sourcePackageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    fs.writeFileSync(
        path.join(targetDir, 'package.json'),
        JSON.stringify(
            {
                name: `@serverless-state-machine-cqrs/${name}`,
                version: sourcePackageJson.version ?? '1.0.0',
                private: true,
                main: 'index.js',
                types: 'index.d.ts',
            },
            null,
            2,
        ),
    );
};

fs.mkdirSync(scopeDir, { recursive: true });
publishPackage('db-ports', path.join(repoRoot, 'packages', 'db-ports'));
publishPackage('domain', path.join(repoRoot, 'packages', 'domain'));
publishPackage('persistence', path.join(repoRoot, 'packages', 'persistence'));
