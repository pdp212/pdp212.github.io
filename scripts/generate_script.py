import re

with open('info/Figma Make App.html', 'r', encoding='utf-8') as f:
    html = f.read()

def extract(regex):
    m = re.search(regex, html, re.DOTALL)
    if not m: return ""
    return m.group(1).strip()

home = extract(r'<section class="min-h-screen flex flex-col pt-14">(.*?)</section>')
work = extract(r'<div class="h-screen flex flex-col pt-14 overflow-hidden">(.*?)<div class="flex-shrink-0 text-center py-1\.5 border-t"')
profile = extract(r'<section class="min-h-screen pt-14">.*?<h2 class="font-sanstext-xl font-bold tracking-widest">PROFILE</h2>(.*?)<!-- Contact -->')
# wait, Profile ends where Contact begins? The DOM separates sections by navigating or conditionally rendering?
# Actually in Figma Make App.html, only the HOME section is visible, because it's a React SPA.
# Wait, let me check if all sections are in the HTML dump.
