import re

# 1. Update src/LiveLandings.tsx
with open('src/LiveLandings.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Remove dialog ref
code = code.replace(
    "const dialog=useRef<HTMLDialogElement>(null),filterKey=useRef('');",
    "const filterKey=useRef('');"
)

# Replace useEffect with modal
old_effect = "useEffect(()=>{if(modal){dialog.current?.showModal();api<Source[]>('/sources').then(setSources).catch(e=>setError(e.message));fetch('/api/landings').then(r=>r.json()).then(v=>{if(Array.isArray(v))setOffers(v);}).catch(()=>{});}else dialog.current?.close();return()=>dialog.current?.close();},[modal]);"
new_effect = "useEffect(()=>{if(modal){api<Source[]>('/sources').then(setSources).catch(e=>setError(e.message));fetch('/api/landings').then(r=>r.json()).then(v=>{if(Array.isArray(v))setOffers(v);}).catch(()=>{});}},[modal]);"
assert old_effect in code, 'old_effect not found'
code = code.replace(old_effect, new_effect)

# Replace dialog tag with modal overlay div
old_dialog_start = '<dialog ref={dialog} className="live-dialog" onCancel={()=>setModal(false)}>'
new_dialog_start = '{modal && <div className="live-modal-overlay" onClick={()=>setModal(false)}><div className="live-dialog" onClick={e=>e.stopPropagation()}>'
assert old_dialog_start in code, 'old_dialog_start not found'
code = code.replace(old_dialog_start, new_dialog_start)

old_dialog_end = '</dialog>'
new_dialog_end = '</div></div>}'
assert old_dialog_end in code, 'old_dialog_end not found'
code = code.replace(old_dialog_end, new_dialog_end)

with open('src/LiveLandings.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Updated src/LiveLandings.tsx successfully')

# 2. Add .live-modal-overlay to src/live.css
with open('src/live.css', 'r', encoding='utf-8') as f:
    css = f.read()

overlay_css = "\n.live-modal-overlay{position:fixed;inset:0;background:#071328b3;backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;}\n"
if '.live-modal-overlay' not in css:
    css += overlay_css
    with open('src/live.css', 'w', encoding='utf-8') as f:
        f.write(css)
    print('Updated src/live.css successfully')
