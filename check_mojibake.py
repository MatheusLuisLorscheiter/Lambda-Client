from pathlib import Path
patterns = ['Ã', 'Â', 'â', '�']
root = Path.cwd()
exts = {'.js','.ts','.tsx','.jsx','.json','.md','.html','.css','.sql','.txt','.py','.java','.cjs','.mjs'}
exclude = {'node_modules','.git','.next','target','dist','build','coverage','.turbo','.idea','.vscode'}

files = []
for path in root.rglob('*'):
    if not path.is_file():
        continue
    if path.suffix.lower() not in exts:
        continue
    if any(part in exclude for part in path.parts):
        continue
    try:
        text = path.read_text(encoding='utf-8', errors='ignore')
    except Exception:
        continue
    for p in patterns:
        if p in text:
            files.append(path)
            break
print(len(files))
for p in files[:50]:
    print(p)
