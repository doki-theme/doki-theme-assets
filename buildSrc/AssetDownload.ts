import toPairs from 'lodash/toPairs';
import fs from "fs";
import path from 'path';
import {buildS3Client, createChecksum, getSyncedAssets, StringDictionary} from "./AssetTools";

const syncedAssets: StringDictionary<string> =
  getSyncedAssets();

const s3 = buildS3Client();

const downloadUnsyncedAssets = (workToBeDone: string[]): Promise<string[]> => {
  const filePath: string | undefined = workToBeDone.pop();
  if (filePath) {
    return new Promise<boolean>((res) => {
      console.info(`Downloading ${filePath}`);

      const realFilePath = path.dirname(filePath);
      if (!fs.existsSync(realFilePath)) {
        fs.mkdirSync(realFilePath, {recursive: true});
      }

      const file = fs.createWriteStream(filePath);
      s3.getObject({
        Bucket: 'doki-theme-assets',
        Key: filePath,
      }).createReadStream()
        .pipe(file)
        .on('error', err => {
          console.warn(`Unable to download ${filePath} to s3 for raisins ${err}`);
          res(false);
        })
        .on('close', () => {
          res(true);
        });
    })
      .then(workResult => downloadUnsyncedAssets(workToBeDone).then(others => {
        if (workResult) {
          others.push(filePath);
        }
        return others;
      }));
  } else {
    return Promise.resolve([]);
  }
};


interface AssetDownloadDecision {
  assetPath: string,
  notDownloaded?: boolean,
  checksumDifferent?: boolean,
}

Promise.all(
  toPairs<string>(syncedAssets).map(([assetPath, savedChecksum]) => {
      if (!fs.existsSync(assetPath)) {
        return Promise.resolve<AssetDownloadDecision>({
          assetPath,
          notDownloaded: true
        });
      } else {
        return new Promise<Buffer>((res, rej) => {
          fs.readFile(assetPath, (err, dat) => {
            if (err) {
              rej(err);
            } else {
              res(dat);
            }
          });
        })
          .then(createChecksum)
          .then(localChecksum => ({
            assetPath,
            checkSumDifferent: localChecksum !== savedChecksum
          }));
      }
    }
  )
).then((assetToCheckSums) =>
  assetToCheckSums
    .filter(descision => descision.notDownloaded || descision.checksumDifferent)
    .map(decision => decision.assetPath)
).then(assetsToDownload => {
  return downloadUnsyncedAssets(assetsToDownload);
}).then(() => {
  console.log('Asset Download Complete');
});

