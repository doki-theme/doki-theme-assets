import fs from 'fs';
import path from 'path';
import FileType from 'file-type';
import {
  assetDirectories,
  buildS3Client,
  createChecksum,
  getSyncedAssets,
  StringDictionary,
  walkDir
} from "./AssetTools";

export const rootDirectory =
    path.join(__dirname, '..');

const syncedAssets: StringDictionary<string> =
    getSyncedAssets();

function buildKey(filePath: string): string {
    return filePath.substr(rootDirectory.length + 1)
}


const s3 = buildS3Client();

const uploadUnsyncedAssets = (workToBeDone: [string, string][]): Promise<[string, string][]> => {
    const next = workToBeDone.pop();
    if (next) {
        const [filePath,] = next;
        return FileType.fromFile(filePath)
            .then(fileType => {
                return new Promise<boolean>((res) => {
                    const fileStream = fs.createReadStream(filePath);
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
                        ContentType: fileType?.mime
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
            })
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
