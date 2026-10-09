import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {iconSizes} from './distribution.mjs';
// Resize the exact owner-provided logo locally; preserve its proportions and alpha.
// sharp is a development dependency and is never shipped in the extension.
const source = path.resolve(import.meta.dirname, '../assets/yampi-code-sync-logo.png');
export async function writeIcons(dist) {
  const directory=path.join(dist,'icons');await mkdir(directory,{recursive:true});
  for(const size of iconSizes) await sharp(source)
    .resize(size,size,{fit:'contain',background:{r:0,g:0,b:0,alpha:0}})
    .png().toFile(path.join(directory,`icon${size}.png`));
}
