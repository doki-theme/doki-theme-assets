import fs from "fs";
import path from "path";
import crypto from "crypto";
import aws from "aws-sdk";

export const rootDirectory =
  path.join(__dirname, '..');

export const assetDirectories = [
  'backgrounds',
  'stickers',
  'screenshots',
  'misc',
];

export async function walkDir(dir: string): Promise<string[]> {
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

export function createChecksum(data: Buffer | string): string {
  return crypto.createHash('md5')
    .update(data)
    .digest('hex');
}

export interface StringDictionary<T> {
  [key: string]: T
}

export const buildS3Client = () => {
  aws.config.update({region: 'us-east-1'});
  return new aws.S3();
};

export const getSyncedAssets = () => JSON.parse(
  fs.readFileSync(path.join(rootDirectory, 'syncedAssets.json'), 'utf-8'));