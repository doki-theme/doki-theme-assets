import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const assetDirectories = [
    'backgrounds',
    'stickers',
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

function createChecksum(data: Buffer): string {
    return crypto.createHash('md5')
        .update(data)
        .digest('hex');
}

interface StringDictionary<T> {
    [key: string]: T
}
Promise.all(
    assetDirectories.map(directory =>
        walkDir(path.join(__dirname, '..', directory)))
)
    .then(directories => directories.reduce((accum, dirs) => accum.concat(dirs), []))
    .then(allAssets =>
        Promise.all(
            allAssets.map(assetPath =>
                new Promise<Buffer>((res, rej) =>
                    fs.readFile(assetPath, (err, dat) => {
                        if (err) {
                            rej(err)
                        } else {
                            res(dat);
                        }
                    }))
                    .then(createChecksum)
                    .then(checkSum => ({
                        assetPath,
                        checkSum
                    }))
            )
        ).then((assetToCheckSums) =>
            assetToCheckSums.reduce(
                (accum: StringDictionary<string>, assetToChecksum) => {
                    accum[assetToChecksum.assetPath] = assetToChecksum.checkSum;
                    return accum;
                }, {})
        )
    )
    .then(assetToCheckSum => {
        return assetToCheckSum;
    })
    .then(allNewAssets => {
        console.log(allNewAssets);
    })