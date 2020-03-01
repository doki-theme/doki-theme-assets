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
          console.log(`Successfully downloaded ${filePath}`);
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
  checkSumDifferent?: boolean,
}

console.log('Starting asset download process.');
console.log('Calculating deltas.');
Promise.all(
  toPairs<string>(syncedAssets).map(([assetPath, savedChecksum]) => {
      if (!fs.existsSync(assetPath)) {
        console.log(`Remote asset ${assetPath} does not exist locally`);
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
          .then(localChecksum => {
            const checkSumDifferent = localChecksum !== savedChecksum;
            if (checkSumDifferent) {
              console.log(`Local asset ${assetPath} is different from the remote asset.`);
            }
            return ({
              assetPath,
              checkSumDifferent: checkSumDifferent
            });
          });
      }
    }
  )
)
  .then((assetToCheckSums) =>
    assetToCheckSums
      .filter(decision => decision.notDownloaded || decision.checkSumDifferent)
      .map(decision => decision.assetPath)
  )
  .then(assetsToDownload => downloadUnsyncedAssets(assetsToDownload))
  .then(() => {
    console.log('Asset Download Complete');
  });

