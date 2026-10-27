#!/usr/bin/env python3
"""Generate src/styles/app-v5-auto.css from src/styles/app-v3.css.

Every colour-related declaration of every v3 rule is re-emitted under `.v5`, in
source order, with light hex colours mapped to the dark palette. Copying *all*
colour declarations (not just the light ones) keeps v3's base → state ordering
intact, so `.v5 .x button` can never outrank `.x button[aria-pressed]`.

Run from apps/web:  python3 scripts/gen-v5-auto.py
Hand polish lives in app-v5.css, which loads after this file.
"""
import re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent / 'src' / 'styles'
src = re.sub(r'/\*.*?\*/', '', (ROOT / 'app-v3.css').read_text(), flags=re.S)

BG = {'#fff':'#0F0F0F','#ffffff':'#0F0F0F','#fbfafc':'#0C0C0C','#f8f7fb':'#121212','#fafafa':'#0C0C0C','#f7f6fa':'#121212','#f4f3f8':'#030303','#efedf6':'#161616','#ecebf1':'#151515','#edecf0':'#181818','#efeee9':'#1C1C1C','#efeef3':'#161616','#f5f4fa':'#121212','#f1f0f5':'#141414','#eeeaff':'rgba(8,196,101,.12)','#f3f0ff':'rgba(8,196,101,.1)','#e6f7ef':'rgba(8,196,101,.12)','#fdecef':'rgba(254,58,49,.12)','#fff4d6':'rgba(242,181,58,.12)','#fff8e6':'rgba(242,181,58,.1)','#fef6f7':'rgba(254,58,49,.08)','#f6fdf9':'rgba(8,196,101,.08)','#fce3e8':'#1C1C1C','#e9e5fb':'#161616',
      '#7c5cff':'#2EE58A','#6e4bff':'#08C465','#5733ee':'#06A253','#9479ff':'#2EE58A','#4b2ad8':'#06A253','#24222f':'#E9E9EC','#17161f':'#141414','#22212c':'#1A1A1A','#1a1922':'#161616','#c4b5ff':'#7DF2B6','#b9a8ff':'#5CF0A6','#3e22b5':'#046B38','#100f17':'#F4F4F5','#0a0911':'#050505'}
BORDER = {'#e4e2e6':'#1E1E1E','#edecf0':'#181818','#cfccd8':'#2E2E2E','#d9d6e2':'#2A2A2A','#c9c7d2':'#333333','#d6ccff':'rgba(8,196,101,.34)','#bfebd5':'rgba(8,196,101,.4)','#f8c9d1':'rgba(254,58,49,.4)','#f4dfa3':'rgba(242,181,58,.4)','#e9e7ee':'#1E1E1E','#ecebf1':'#1E1E1E','#f0eef5':'#1C1C1C','#d5d3dc':'#2A2A2A','#b9b6c4':'#3A3A3A','#fff':'#1E1E1E','#1c1b25':'#1A1A1A','#1a1922':'#161616','#2a2932':'#262626','#6e4bff':'#08C465','#100f17':'#F4F4F5'}
TEXT = {'#4d4c56':'#C4C4CC','#34333c':'#D4D4D8','#100f17':'#F4F4F5','#0a0911':'#F4F4F5','#77768a':'#71717A','#6c6c70':'#8B8B94','#9b9ba0':'#5E5E66','#5733ee':'#2EE58A','#6e4bff':'#2EE58A','#7c5cff':'#2EE58A','#9479ff':'#2EE58A','#4b2ad8':'#2EE58A','#3e22b5':'#08C465','#c98a00':'#F2B53A','#0fa968':'#2EE58A','#e5304c':'#FF6A62','#c9c7d2':'#3A3A3A','#8c7fd6':'#55555D','#b4b3c0':'#A1A1AA','#8a8a98':'#6E6E76'}
COLOR_PROPS = {'background', 'background-color', 'background-image', 'color', 'border', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-color', 'border-bottom-color', 'border-left-color', 'border-right-color', 'box-shadow', 'outline', 'outline-color', 'fill', 'stroke'}

def map_hex(v, table):
    return re.sub(r'#[0-9a-fA-F]{3,6}\b', lambda m: table.get(m.group(0).lower(), m.group(0)), v)

out = []
def handle(sel, body, media):
    decls = [d.strip() for d in body.split(';') if d.strip() and ':' in d]
    ink_bg = any(re.match(r'background(-color)?\s*:\s*var\(--ink\)', d) for d in decls)
    acc_bg = any(re.match(r'background(-color)?\s*:\s*var\(--(acc|short|long-fill|short-fill)\)', d) for d in decls)
    new = []
    for d in decls:
        prop, val = d.split(':', 1); prop = prop.strip(); v = val.strip(); lv = v.lower()
        if prop not in COLOR_PROPS: continue
        if prop in ('background', 'background-color', 'background-image'):
            if re.search(r'gradient', lv) and re.search(r'#(fff\b|f[0-9a-f]{5}|e[0-9a-f]{5})', lv): nv = '#0F0F0F'
            else: nv = map_hex(v, BG)
        elif prop.startswith('border') or prop.startswith('outline'):
            nv = map_hex(v, BORDER)
        elif prop == 'color':
            c = lv.replace('!important', '').strip()
            if c in ('#fff', '#ffffff') and ink_bg: nv = '#000'
            elif c in ('#fff', '#ffffff') and acc_bg: nv = 'var(--on-acc)'
            else: nv = map_hex(v, TEXT)
        elif prop == 'box-shadow':
            nv = re.sub(r'rgba\(16,\s*15,\s*23,\s*[.\d]+\)', 'rgba(0,0,0,.6)', v)
            nv = re.sub(r'rgba\(110,\s*75,\s*255,', 'rgba(8,196,101,', nv)
            nv = re.sub(r'rgba\(25,\s*195,\s*125,', 'rgba(8,196,101,', nv)
        else:
            nv = map_hex(v, TEXT)
        new.append(f'{prop}: {nv}')
    if not new: return
    parts = []
    for s in sel.split(','):
        s = s.strip()
        if not s or s.startswith(('@', 'from', 'to')) or re.match(r'^\d', s): return
        if s == '.v3': return
        if s.startswith('.v3 '): s = '.v5 ' + s[4:]
        elif s.startswith('.v3.'): s = '.v5' + s[3:]
        else: s = '.v5 ' + s
        parts.append(s)
    out.append((media, ', '.join(parts) + ' { ' + '; '.join(new) + '; }'))

def parse(text, media=None):
    pos = 0
    pat = re.compile(r'([^{}]+)\{')
    while pos < len(text):
        m = pat.search(text, pos)
        if not m: break
        head = m.group(1).strip()
        if head.startswith('@'):
            depth, j = 1, m.end()
            while depth and j < len(text):
                depth += {'{': 1, '}': -1}.get(text[j], 0); j += 1
            if head.startswith('@media'): parse(text[m.end():j - 1], head)
            pos = j
        else:
            e = text.index('}', m.end()); handle(head, text[m.end():e], media); pos = e + 1

parse(src)
lines = ['/* AUTO-GENERATED by scripts/gen-v5-auto.py from app-v3.css — do not hand-edit.',
         '   Colour declarations of every v3 rule, re-scoped under .v5 in source order. */']
cur = None
for media, rule in out:
    if media != cur:
        if cur: lines.append('}')
        if media: lines.append(media + ' {')
        cur = media
    lines.append(('  ' if media else '') + rule)
if cur: lines.append('}')
(ROOT / 'app-v5-auto.css').write_text('\n'.join(lines) + '\n')
print(len(out), 'rules')
