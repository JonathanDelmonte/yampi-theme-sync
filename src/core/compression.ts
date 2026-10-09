import {zipSync,type Zippable} from 'fflate';
export type ArchiveEntries=Record<string,Uint8Array>;
export function compressArchive(entries:ArchiveEntries):Uint8Array {
  // Already compressed formats waste CPU when deflated again. ZIP STORE keeps
  // their exact bytes; text/SVG/CSS still use lossless DEFLATE level 6.
  const input:Zippable=Object.fromEntries(Object.entries(entries).map(([name,bytes])=>[name,/\.(?:png|jpe?g|webp|woff2)$/i.test(name)?[bytes,{level:0}]:bytes]));
  return zipSync(input,{level:6});
}
