from pathlib import Path

patterns = ['Ã', 'Â', 'â', '�']
root = Path.cwd()
exts = {'.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.html', '.css', '.sql', '.txt', '.py', '.java', '.cjs', '.mjs'}
exclude = {'node_modules', '.git', '.next', 'target', 'dist', 'build', 'coverage', '.turbo', '.idea', '.vscode'}

for path in sorted(root.rglob('*')):
    if not path.is_file():
        continue
    if path.suffix.lower() not in exts:
        continue
    if any(part in exclude for part in path.parts):
        continue
    text = path.read_text(encoding='utf-8', errors='ignore').splitlines()
    for i, line in enumerate(text, 1):
        if any(p in line for p in patterns):
            print(f'{path}:{i}: {line}')
