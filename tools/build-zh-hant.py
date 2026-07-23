#!/usr/bin/env python3
"""Generate js/lang/zh-Hant.js from the 简体中文 dictionary in js/i18n.js.
Pure text transform via OpenCC s2t — only Han characters are remapped, so the
English keys, JS syntax, emoji and interpolation all pass through untouched.
Run from the repo root:  python3 tools/build-zh-hant.py"""
import re, opencc
src = open('js/i18n.js', encoding='utf-8').read().split('\n')
# Line ranges of the dictionary literals inside js/i18n.js (1-indexed).
T_src = '\n'.join(src[20:845])     # const T = { ... };
P_src = '\n'.join(src[848:959])    # const PATTERNS = [ ... ];
conv = opencc.OpenCC('s2t')
T_tw = conv.convert(T_src)
P_tw = re.sub(r'\btr\(', 'MKR.i18n.t(', conv.convert(P_src))
out = ("/* ===== 繁體中文 dictionary (auto-generated from 简体中文 via OpenCC s2t) =====\n"
       "   Regenerate: python3 tools/build-zh-hant.py  (do not hand-edit). */\n"
       "(function(){\n  if(!window.MKR || !MKR.i18n) return;\n  "
       + T_tw.replace('\n','\n  ') + "\n  " + P_tw.replace('\n','\n  ')
       + "\n  MKR.i18n.register('zh-Hant', { T: T, P: PATTERNS });\n})();\n")
open('js/lang/zh-Hant.js','w',encoding='utf-8').write(out)
print('wrote js/lang/zh-Hant.js', len(out), 'bytes')
