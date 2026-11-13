import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=name=>readFile(path.join(root,name),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const lock=JSON.parse(await read('src/family-ui.lock.json'));
const kit=await read('src/'+lock.module.replace('./',''));
for(const [name,expected] of Object.entries(lock.files))if(hash(await read(`src/family-ui/${lock.version}/${name}`))!==expected)throw Error('UI Kit checksum mismatch: '+name);
if(hash(await read(`src/family-ui/${lock.version}/LICENSE`))!==lock.licenseSha256)throw Error('UI Kit license mismatch');
const version=JSON.parse(await read('package.json')).version;
if(JSON.parse(await read('custom_components/wecker_manager/manifest.json')).version!==version||!(await read('custom_components/wecker_manager/const.py')).includes(`VERSION = "${version}"`))throw Error('Version mismatch');
const source=await read('src/wecker-manager-card.js');
const pattern=/import\s*\{([\s\S]*?)\}\s*from '\.\/family-ui\/1\.4\.1\/family-ui\.js';/;
const names=source.match(pattern)?.[1];if(!names)throw Error('Expected pinned UI import');
const exports=[...kit.matchAll(/^export (?:async )?(?:const|function) (\w+)/gm)].map(m=>m[1]);
const output=`/* Wecker ${version} | MIT | HA UI Kit ${lock.version} bundled unchanged */\nconst WeckerManagerUI=(()=>{\n${kit.replace(/^export /gm,'')}\nreturn {${exports.join(',')}};\n})();\n(()=>{\n${source.replace(pattern,`const {${names}} = WeckerManagerUI;`)}\n})();\n`;
const licenses=`Wecker\n${await read('LICENSE')}\nHA UI Kit ${lock.version}\n${await read(`src/family-ui/${lock.version}/LICENSE`)}`;
const manifest=JSON.stringify({version,ui_version:lock.version,ui_source_commit:lock.sourceCommit,files:{'wecker-manager-card.js':hash(output),'LICENSES.txt':hash(licenses)}},null,2)+'\n';
for(const dir of ['dist','custom_components/wecker_manager/frontend']){
 await mkdir(path.join(root,dir),{recursive:true});
 for(const [name,value] of [['wecker-manager-card.js',output],['LICENSES.txt',licenses],['manifest.json',manifest]]){
  if(process.argv.includes('--check')){if(await read(dir+'/'+name)!==value)throw Error('Stale generated file '+dir+'/'+name);}
  else await writeFile(path.join(root,dir,name),value);
 }
}
console.log(`Wecker ${version} · UI Kit ${lock.version} · ${process.argv.includes('--check')?'verified':'built'}`);
