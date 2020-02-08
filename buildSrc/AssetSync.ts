import fs from 'fs';
import path from 'path';

const assetDirectories = [
    'backgrounds',
    'stickers',
    'themes'
]

async function walkDir(dir: string): Promise<string[]> {
    const values: Promise<string[]>[] = fs.readdirSync(dir)
        .map((file: string) => {
            const dirPath: string = path.join(dir, file);
            const isDirectory = fs.statSync(dirPath).isDirectory();
            if (isDirectory) {
                return walkDir(dirPath);
            } else {
                return Promise.resolve([path.join(dir, file)]);
            }
        });
    const scannedDirectories = await Promise.all(values);
    return scannedDirectories.reduce((accum, files) => accum.concat(files), []);
}

Promise.all(
    assetDirectories.map(directory =>
        walkDir(path.join(__dirname, '..', directory)))
)
    .then(directories => directories.reduce((accum, dirs) => accum.concat(dirs), []))
    .then(allAssets => {
        console.log(allAssets);
    })