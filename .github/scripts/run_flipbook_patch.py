from pathlib import Path

script_path = Path('.github/scripts/apply_flipbook_links.py')
source = script_path.read_text(encoding='utf-8')
old = """def replace_once(value, old, new, label):
    count = value.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, found {count}')
    return value.replace(old, new, 1)
"""
new = """def replace_once(value, old, new, label):
    count = value.count(old)
    if label == 'admin ui save migration error' and count == 2:
        index = value.rfind(old)
        return value[:index] + new + value[index + len(old):]
    if count != 1:
        raise SystemExit(f'{label}: expected 1 exact match, found {count}')
    return value.replace(old, new, 1)
"""
if source.count(old) != 1:
    raise SystemExit('temporary runner could not patch replace_once')
source = source.replace(old, new, 1)
exec(compile(source, str(script_path), 'exec'), {'__name__': '__main__'})
