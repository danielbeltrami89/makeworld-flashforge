"""Flatten an installed slicer JSON profile for CLI validation (--load-settings)."""
import argparse
import json
from pathlib import Path


def resolve(directory, name, parents=()):
    if name in parents:
        raise ValueError(f'Cyclic profile inheritance: {name}')
    data = json.loads((directory / f'{name}.json').read_text())
    base = resolve(directory, data['inherits'], parents + (name,)) if data.get('inherits') else {}
    base.update(data)
    base.pop('inherits', None)
    return base


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('name')
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    with args.output.open('x') as output:
        json.dump(resolve(args.directory, args.name), output, indent=2)
