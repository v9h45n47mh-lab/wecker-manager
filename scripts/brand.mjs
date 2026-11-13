/** Render the existing UI Kit alarm glyph as local Home Assistant brand images. */
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {icon} from '../src/family-ui/1.4.1/family-ui.js';
const dir=new URL('../custom_components/wecker_manager/brand/',import.meta.url);
await mkdir(dir,{recursive:true});
const glyph=icon('media-alarm').replace(/^<svg[^>]*>/,'').replace(/<\/svg>$/,'');
for(const dark of [false,true]){
  const prefix=dark?'dark_':'',background=dark?'#67d3ff':'#0288d1',foreground=dark?'#102530':'#ffffff';
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="52" fill="${background}"/><g transform="translate(32 38) scale(8)" fill="${foreground}">${glyph}</g></svg>\n`;
  await writeFile(new URL(prefix+'icon.svg',dir),svg);
  for(const size of [256,512]){
   const target=fileURLToPath(new URL(prefix+'icon'+(size===512?'@2x':'')+'.png',dir));
   await sharp(Buffer.from(svg),{density:size*72/256}).resize(size,size).png({compressionLevel:9}).toFile(target);
  }
}
console.log('Rendered light/dark Wecker icons in 256 px and 512 px from HA UI Kit.');
