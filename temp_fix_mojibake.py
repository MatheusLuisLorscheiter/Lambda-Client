from pathlib import Path

roots = [
    Path(r'c:\Users\Usuario\OneDrive\Área de Trabalho\DADOS\System\Projetos Concluídos\whatsapp-cloud-platform'),
    Path(r'c:\Users\Usuario\OneDrive\Área de Trabalho\DADOS\System\Projetos Concluídos\Representantes'),
    Path(r'c:\Users\Usuario\OneDrive\Área de Trabalho\DADOS\System\Projetos Concluídos\API-Disparador'),
    Path(r'c:\Users\Usuario\OneDrive\Área de Trabalho\DADOS\System\Site Chave Mestra\chave-mestra-gestao'),
    Path(r'c:\Users\Usuario\OneDrive\Área de Trabalho\DADOS\System\Projetos Concluídos\Lambda-Client'),
]
text_exts = {'.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.html', '.css', '.sql', '.txt', '.yml', '.yaml', '.xml', '.cjs', '.mjs', '.java', '.py', '.sh', '.ps1', '.env', '.example'}
exclude_dirs = {'node_modules', '.git', '.next', 'target', 'dist', 'build', 'coverage', '.turbo', '.idea', '.vscode'}
replacements = [
    ('ç', 'ç'), ('ã', 'ã'), ('á', 'á'), ('â', 'â'), ('ä', 'ä'), ('å', 'å'),
    ('è', 'è'), ('é', 'é'), ('ê', 'ê'), ('ë', 'ë'), ('ì', 'ì'), ('í', 'í'), ('î', 'î'), ('ï', 'ï'),
    ('ñ', 'ñ'), ('ò', 'ò'), ('ó', 'ó'), ('ô', 'ô'), ('õ', 'õ'), ('ö', 'ö'), ('ø', 'ø'), ('ù', 'ù'), ('ú', 'ú'), ('û', 'û'), ('ü', 'ü'), ('ý', 'ý'), ('þ', 'þ'), ('ÿ', 'ÿ'),
    ('À', 'À'), ('Á', 'Á'), ('Â', 'Â'), ('Ã', 'Ã'), ('Ä', 'Ä'), ('Å', 'Å'), ('Ç', 'Ç'), ('È', 'È'), ('É', 'É'), ('Ê', 'Ê'), ('Ë', 'Ë'), ('Ì', 'Ì'), ('Î', 'Î'), ('Ï', 'Ï'),
    ('Ñ', 'Ñ'), ('Ó', 'Ó'), ('Ô', 'Ô'), ('Ö', 'Ö'), ('Ø', 'Ø'), ('×', '×'), ('Ù', 'Ù'), ('Ú', 'Ú'), ('Û', 'Û'), ('Ü', 'Ü'), ('Ý', 'Ý'), ('Þ', 'Þ'), ('ß', 'ß'),
    ("''", "'"), ('“', '“'), ('”', '”'), ('–', '–'), ('—', '—'), ('…', '…'), ('“', '“'), (' ', ' '), ('Â\n', '\n'), ('Â\r\n', '\r\n')
]

changed_files = []
for root in roots:
    if not root.exists():
        continue
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        if any(part in exclude_dirs for part in path.parts):
            continue
        if path.suffix.lower() not in text_exts:
            continue
        try:
            original = path.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue
        updated = original
        for old, new in replacements:
            updated = updated.replace(old, new)
        if updated != original:
            path.write_text(updated, encoding='utf-8')
            changed_files.append(path.as_posix())

print(f'FILES_CHANGED={len(changed_files)}')
for item in changed_files[:200]:
    print(item)
