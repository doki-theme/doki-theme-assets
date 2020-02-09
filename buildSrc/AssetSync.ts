import fs from 'fs';
import path from 'path';
import crypto, { generateKeyPair } from 'crypto';
import aws from 'aws-sdk';

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

const rootDirectory =
    path.join(__dirname, '..')

const syncedAssets: StringDictionary<string> =
    JSON.parse(
        fs.readFileSync(path.join(rootDirectory, 'syncedAssets.json'), 'utf-8'));

function buildKey(filePath: string): string {
    return filePath.substr(rootDirectory.length + 1)
}

aws.config.update({ region: 'us-east-1' });
const s3 = new aws.S3();

const uploadUnsyncedAssets = (workToBeDone: [string, string][]): Promise<[string, string][]> => {
    const next = workToBeDone.pop();
    if (next) {
        const [filePath,] = next;
        return new Promise<boolean>((res) => {
            const fileStream = fs.createReadStream(filePath)
            fileStream.on('error', err => {
                console.warn(`Unable to open stream for ${next} for raisins ${err}`);
                res(false);
            });

            console.info(`Uploading ${filePath}`);
            s3.upload({
                Bucket: 'doki-theme-assets',
                Key: buildKey(filePath),
                Body: fileStream,
                ACL: 'public-read',
            }, (err) => {
                if (err) {
                    console.warn(`Unable to upload ${next} to s3 for raisins ${err}`)
                    res(false);
                } else {
                    res(true);
                }
            })
        })
            .then(workResult => uploadUnsyncedAssets(workToBeDone).then(others => {
                if (workResult) {
                    others.push(next)
                }
                return others;
            }))
    } else {
        return Promise.resolve([]);
    }
};


Promise.all(
    assetDirectories.map(directory =>
        walkDir(path.join(rootDirectory, directory)))
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
            .filter(assetPath => {
                const assetKey = buildKey(assetPath)
                return !syncedAssets[assetKey] ||
                    syncedAssets[assetKey] !== assetToCheckSum[assetPath]
            }
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
        return uploadUnsyncedAssets(Object.entries(allNewAssets))
            .then(syncedAssets => syncedAssets
                .map(([key, value]) => ([buildKey(key), value]))
                .reduce((accum: StringDictionary<string>, kva) => {
                    const [key, value] = kva;
                    accum[key] = value;
                    return accum;
                }, {})
            )
            .then(syncedAssetDictionary => {
                fs.writeFileSync(path.join(
                    __dirname, '..', 'syncedAssets.json'
                ), JSON.stringify({
                    ...syncedAssets,
                    ...syncedAssetDictionary
                }, null, 2), 'utf8');
            })
    })