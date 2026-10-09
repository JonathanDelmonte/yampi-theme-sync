import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {iconSizes} from './distribution.mjs';
// Original geometric code symbol. Generated locally; no fonts, remote images or store data.
const segments = [[25,23,16,32],[16,32,25,41],[39,23,48,32],[48,32,39,41],[35,21,29,43]];
const ink = [38,39,44], border = [115,119,129], paper = [250,250,249];
function lineDistance(x,y,[ax,ay,bx,by]) {
  const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy)));
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
}
function roundedDistance(x,y) {
  const qx=Math.abs(x-32)-16,qy=Math.abs(y-32)-16;
  return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-14;
}
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function chunk(type,data) {
  const name=Buffer.from(type), length=Buffer.alloc(4), crc=Buffer.alloc(4);
  length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([name,data])));
  return Buffer.concat([length,name,data,crc]);
}
function png(size) {
  const rows=Buffer.alloc((size*4+1)*size),samples=4;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const sum=[0,0,0];let hits=0;
    for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
      const px=(x+(sx+.5)/samples)*64/size,py=(y+(sy+.5)/samples)*64/size,d=roundedDistance(px,py);
      if(d>0)continue;
      const color=segments.some(segment=>lineDistance(px,py,segment)<=2.3)?paper:d>-.75?border:ink;
      for(let c=0;c<3;c++)sum[c]+=color[c];hits++;
    }
    const offset=y*(size*4+1)+1+x*4;
    for(let c=0;c<3;c++)rows[offset+c]=hits?Math.round(sum[c]/hits):0;
    rows[offset+3]=Math.round(255*hits/(samples*samples));
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
}
export async function writeIcons(dist) {
  const directory=path.join(dist,'icons');await mkdir(directory,{recursive:true});
  for(const size of iconSizes)await writeFile(path.join(directory,`icon${size}.png`),png(size));
}
