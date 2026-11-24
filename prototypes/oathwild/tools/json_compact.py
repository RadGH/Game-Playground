"""Write Oathwild's classes.json in its compact house style (one tree node per line). Used by maintenance scripts."""
import json

def dump(o, ind=0, inline_keys=('nodes',)):
    sp = '  ' * ind
    if isinstance(o, dict):
        items = list(o.items())
        out = '{\n'
        for i, (k, v) in enumerate(items):
            if k in inline_keys and isinstance(v, list):
                vv = '[\n' + ',\n'.join(sp + '    ' + json.dumps(n, ensure_ascii=False) for n in v) + '\n' + sp + '  ]'
            elif isinstance(v, dict) and (ind == 0 and k in ('classes', 'rules') or ind == 1 and isinstance(v, dict) and any(isinstance(x, list) for x in v.values())):
                vv = dump(v, ind + 1, inline_keys)
            else:
                vv = json.dumps(v, ensure_ascii=False)
            out += sp + '  ' + json.dumps(k) + ': ' + vv + (',' if i < len(items) - 1 else '') + '\n'
        return out + sp + '}'
    return json.dumps(o, ensure_ascii=False)
