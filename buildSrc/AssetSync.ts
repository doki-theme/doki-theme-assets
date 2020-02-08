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
const syncedAssets: StringDictionary<string> =
            JSON.parse(
                fs.readFileSync(path.join(__dirname, '..', 'syncedAssets.json'), 'utf-8'));

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
        return Object.keys(assetToCheckSum)
            .filter(assetPath =>
                !syncedAssets[assetPath] ||
                syncedAssets[assetPath] !== assetToCheckSum[assetPath]
            )
            .map(changedAsset => ({
                key: changedAsset,
                value: assetToCheckSum[changedAsset]
            })
            )
            .reduce((accum: StringDictionary<string>, kv) => {
                accum[kv.key] = kv.value;
                return accum
            }, {});

    })
    .then(allNewAssets => {
        console.log(allNewAssets);
        fs.writeFileSync(path.join(
            __dirname, '..', 'syncedAssets.json'
        ), JSON.stringify({
            ...syncedAssets,
            ...allNewAssets
        }, null, 2), 'utf8');
    })