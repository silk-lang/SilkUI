"""Read a named artifact from the compiler's published compilation request set."""
import json
from pathlib import Path
import sys
import tomllib

requests = Path(sys.argv[1])
name = sys.argv[2]
index = json.loads((requests / 'plan.json').read_text())
outputs = []
for filename in index['files']:
    with (requests / filename).open('rb') as source:
        request = tomllib.load(source)
    if request['name'] == name:
        outputs.append(request['output'])
if len(outputs) != 1:
    raise SystemExit(f'Expected one planned compilation named {name}; found {len(outputs)}')
print(outputs[0])
