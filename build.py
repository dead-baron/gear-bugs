#!/usr/bin/env python3
"""GEAR BUGS build script.

Concatenates src/head.html + src/*.js (in name order) + src/tail.html into a
single self-contained index.html, and stamps `const BUILD = '<UTC timestamp>'`
so running clients can detect a new deploy (see the version check in 90_main.js).

Usage:  python3 build.py
"""
import datetime
import glob
import os

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')


def main():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    with open(os.path.join(SRC, 'head.html'), encoding='utf-8') as f:
        head = f.read()
    with open(os.path.join(SRC, 'tail.html'), encoding='utf-8') as f:
        tail = f.read()
    parts = []
    for path in sorted(glob.glob(os.path.join(SRC, '*.js'))):
        with open(path, encoding='utf-8') as f:
            parts.append('/* ===== %s ===== */\n%s' % (os.path.basename(path), f.read()))
    body = '\n'.join(parts)
    body = body.replace("const BUILD = '__BUILD__'", "const BUILD = '%s'" % stamp, 1)
    out = head + body + tail
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    print('built index.html  BUILD=%s  %d bytes, %d lines' % (stamp, len(out.encode('utf-8')), out.count('\n')))


if __name__ == '__main__':
    main()
