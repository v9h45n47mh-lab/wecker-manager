"""Package only the independent alarm integration, docs and reproducible source."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json, hashlib
root=Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
output=root.parent/f'Wecker-Manager-{version}.zip'
script=(root/'dist/wecker-manager-card.js').read_text()
fixture=(root/'tests/fixture.html').read_text()
preview=fixture.replace('<script type="module" src="../custom_components/wecker_manager/frontend/wecker-manager-card.js"></script>','<script type="module">'+script.replace('</script','<\\/script')+'</script>')
(root/'Vorschau.html').write_text(preview)
with ZipFile(output,'w',ZIP_DEFLATED,compresslevel=9) as archive:
 for name in ['README.md','LICENSE','RELEASE_NOTES.md','Vorschau.html']:archive.write(root/name,name)
 for file in (root/'custom_components/wecker_manager').rglob('*'):
  if file.is_file() and '__pycache__' not in file.parts:archive.write(file,file.relative_to(root).as_posix())
 for file in (root/'docs').glob('*.md'):archive.write(file,file.relative_to(root).as_posix())
 for file in root.rglob('*'):
  if file.is_file() and not any(p in {'.git','node_modules','test-results','__pycache__','.test-deps'} for p in file.relative_to(root).parts) and file.name!='Vorschau.html':archive.write(file,'source/'+file.relative_to(root).as_posix())
with ZipFile(output) as archive:
 assert archive.testzip() is None
 assert archive.read('custom_components/wecker_manager/frontend/wecker-manager-card.js')==(root/'dist/wecker-manager-card.js').read_bytes()
 assert not any(name.startswith('custom_components/music_manager/') for name in archive.namelist())
print(json.dumps({'file':str(output),'bytes':output.stat().st_size,'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))
