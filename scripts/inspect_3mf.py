"""Inspect 3MF resources and effective component geometry without changing the ZIP."""
import argparse
import hashlib
import json
import math
import posixpath
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

CORE = "http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
PROD = "http://schemas.microsoft.com/3dmanufacturing/production/2015/06"
NS = {"m": CORE}
IDENTITY = (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0)
UNITS = {"micron": .001, "millimeter": 1, "centimeter": 10,
         "meter": 1000, "inch": 25.4, "foot": 304.8}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def tree(element):
    if element is None:
        return None
    return [element.tag, sorted(element.attrib.items()), (element.text or "").strip(),
            [tree(child) for child in element]]


def matrix(value):
    result = tuple(map(float, value.split())) if value else IDENTITY
    if len(result) != 12 or not all(math.isfinite(x) for x in result):
        raise ValueError("Invalid 3MF transform")
    return result


def transform(point, matrices):
    for m in matrices:
        point = tuple(sum(point[j] * m[j * 3 + i] for j in range(3)) + m[9 + i]
                      for i in range(3))
    return point


def bounds(points):
    lo = [min(p[i] for p in points) for i in range(3)]
    hi = [max(p[i] for p in points) for i in range(3)]
    return {"min": lo, "max": hi, "dimensions": [hi[i] - lo[i] for i in range(3)]}


def target_path(source, target):
    return posixpath.normpath(posixpath.join(posixpath.dirname(source), target)).lstrip("/")


def inspect(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP entries")
        bad = archive.testzip()
        if bad:
            raise ValueError(f"Invalid CRC: {bad}")
        entries = {name: archive.read(name) for name in names}
    models = {n: ET.fromstring(data) for n, data in entries.items() if n.endswith('.model')}
    units = {n: root.get('unit', 'millimeter') for n, root in models.items()}
    objects = {(n, ob.get('id')): ob for n, root in models.items()
               for ob in root.findall('m:resources/m:object', NS)}
    relationships = {}
    root_path = None
    for name, data in entries.items():
        if not name.endswith('.rels'):
            continue
        relationships[name] = tree(ET.fromstring(data))
        source = '' if name == '_rels/.rels' else name.replace('_rels/', '')[:-5]
        for rel in ET.fromstring(data):
            if rel.get('TargetMode') == 'External':
                continue
            target = target_path(source, rel.get('Target'))
            if target not in entries:
                raise ValueError(f"Broken relationship: {name} -> {target}")
            if name == '_rels/.rels' and rel.get('Type', '').endswith('/3dmodel'):
                root_path = target
    if root_path is None:
        raise ValueError('Missing package model relationship')

    config = json.loads(entries.get('Metadata/project_settings.config', b'{}'))
    settings = ET.fromstring(entries.get('Metadata/model_settings.config', b'<config/>'))
    colors = config.get('filament_colour', [])
    parts = {}
    for ob in settings.findall('object'):
        parent = {m.get('key'): m.get('value') for m in ob.findall('metadata') if m.get('key')}
        for part in ob.findall('part'):
            props = {m.get('key'): m.get('value') for m in part.findall('metadata') if m.get('key')}
            extruder = props.get('extruder', parent.get('extruder'))
            parts[(ob.get('id'), part.get('id'))] = {
                'name': props.get('name'), 'extruder': extruder, 'subtype': part.get('subtype'),
                'color': colors[int(extruder) - 1] if extruder and 0 < int(extruder) <= len(colors) else None,
            }

    components = []
    all_points = []

    def walk(file, oid, chain, ancestry, build_id, root_object):
        key = (file, oid)
        if key in ancestry:
            raise ValueError(f'Cyclic component reference: {key}')
        if key not in objects:
            raise ValueError(f'Missing component: {key}')
        if units[file] != units[root_path]:
            raise ValueError('Mixed resource units require explicit interpretation')
        ob = objects[key]
        mesh = ob.find('m:mesh', NS)
        if mesh is not None:
            vertices = [tuple(float(v.get(axis)) for axis in ('x', 'y', 'z'))
                        for v in mesh.findall('m:vertices/m:vertex', NS)]
            if not vertices or not all(math.isfinite(x) for v in vertices for x in v):
                raise ValueError(f'Invalid vertices: {key}')
            triangles = [tuple(int(t.get(k)) for k in ('v1', 'v2', 'v3'))
                         for t in mesh.findall('m:triangles/m:triangle', NS)]
            if any(i < 0 or i >= len(vertices) for t in triangles for i in t):
                raise ValueError(f'Invalid triangle index: {key}')
            scale = UNITS[units[file]]
            points = [tuple(x * scale for x in transform(v, chain)) for v in vertices]
            all_points.extend(points)
            components.append({
                'build': build_id, 'path': file, 'object': oid,
                'ancestry': ancestry, 'transforms': chain,
                'vertices': len(vertices), 'triangles': len(triangles),
                'mesh_sha256': digest(json.dumps(tree(mesh)).encode()),
                'local_bbox': bounds(vertices), 'world_bbox_mm': bounds(points),
                **parts.get((root_object, oid), {}),
            })
        for component in ob.findall('m:components/m:component', NS):
            resource = component.get(f'{{{PROD}}}path')
            child_file = target_path(file, resource) if resource else file
            walk(child_file, component.get('objectid'),
                 [matrix(component.get('transform'))] + chain,
                 ancestry + [key], build_id, root_object)

    for i, item in enumerate(models[root_path].findall('m:build/m:item', NS)):
        walk(root_path, item.get('objectid'), [matrix(item.get('transform'))], [], i, item.get('objectid'))

    return {
        'entry_hashes': {n: digest(data) for n, data in entries.items()},
        'geometry': {
            'units': units,
            'resources': {n: tree(root.find('m:resources', NS)) for n, root in models.items()},
            'build': tree(models[root_path].find('m:build', NS)),
            'relationships': relationships,
            'model_settings': tree(settings),
            'colors': colors,
            'components': components,
            'overall_bbox_mm': bounds(all_points),
        },
        'settings': config,
    }


def compare(original, converted):
    a, b = inspect(original), inspect(converted)
    ah, bh = a['entry_hashes'], b['entry_hashes']
    settings = {k: {'before': a['settings'].get(k), 'after': b['settings'].get(k)}
                for k in sorted(a['settings'].keys() | b['settings'].keys())
                if a['settings'].get(k) != b['settings'].get(k)}
    return {
        'original': str(original), 'converted': str(converted),
        'geometry_equal': a['geometry'] == b['geometry'],
        'changed_entries': [n for n in ah if n in bh and ah[n] != bh[n]],
        'removed_entries': sorted(ah.keys() - bh.keys()),
        'added_entries': sorted(bh.keys() - ah.keys()),
        'components': a['geometry']['components'],
        'overall_bbox_mm': a['geometry']['overall_bbox_mm'],
        'settings_changed': settings,
    }


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original', type=Path)
    parser.add_argument('converted', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    result = compare(args.original, args.converted)
    serialized = json.dumps(result, indent=2, ensure_ascii=False)
    if args.output:
        args.output.write_text(serialized + '\n')
        print(json.dumps({k: result[k] for k in ['geometry_equal', 'changed_entries', 'removed_entries', 'overall_bbox_mm']}, indent=2))
    else:
        print(serialized)
