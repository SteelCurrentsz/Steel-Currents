#!/usr/bin/env python3
"""The orders shouted on her bridge, in her own navy's language.

    python3 build/voice-lines.py         ->  client/js/render/voices.data.js
    python3 build/voice-lines.py --tts   (also needs: pip install edge-tts)

The takes are in assets/voices, one `<nation>-<order>.mp3` each: performed
shouting (ElevenLabs voices through Higgsfield, each line led with a
"[shouting]" direction), because a reading voice pushed through effects still
sounds like somebody reading. This only finishes them for the bridge -- the
rumble cut out, the bite brought forward, squeezed, a little grit and the ring
of a small steel compartment round them -- and packs them as MP3 inside one
data module the game imports on its own, so the page does not carry it until a
battle wants it.

With --tts, an order that has no take is spoken instead by a neural voice of
its nation and pushed up in pitch and pace to stand in for one.

The wording is each navy's own order, not a translation of the English:
"Feuer frei!" from a Kriegsmarine gunnery officer, "撃ち方始め!" from an IJN
one, the Marine nationale's "grenades sous-marines" for depth charges.
"""

import asyncio
import base64
import json
import os
import ssl
import subprocess
import sys
import tempfile

if '--tts' in sys.argv:
    import edge_tts.communicate as _comm
    # Behind a proxy that re-signs TLS, the service is reached through its CA.
    _CA = os.environ.get('VOICE_CA') or ('/root/.ccr/ca-bundle.crt' if os.path.exists('/root/.ccr/ca-bundle.crt') else None)
    if _CA:
        _comm._SSL_CTX = ssl.create_default_context(cafile=_CA)

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
OUT = os.path.join(ROOT, 'client/js/render/voices.data.js')

# The voice of each navy, and how hard he is pushed: rate and pitch up is what
# turns a reading voice into a man shouting an order.
VOICES = {
    'usa': ('en-US-GuyNeural', '+16%', '+14Hz'),
    'gbr': ('en-GB-RyanNeural', '+14%', '+12Hz'),
    'ger': ('de-DE-ConradNeural', '+14%', '+12Hz'),
    'fra': ('fr-FR-HenriNeural', '+14%', '+12Hz'),
    'jpn': ('ja-JP-KeitaNeural', '+12%', '+12Hz'),
}

# main: the main battery; sec: the secondaries; torp/torps: one fish or a
# spread; aa/aas: one aeroplane or more; dc: depth charges.
LINES = {
    'usa': {
        'main': 'Open fire!',
        'sec': 'Secondary armament, open fire!',
        'torp': 'Torpedo away!',
        'torps': 'Torpedoes away!',
        'aa': 'Engage air target!',
        'aas': 'Engage air targets!',
        'dc': 'Drop depth charges!',
        'abandon': 'Abandon ship!',
        'lastShell': "We'll fight till our last shell!",
        'spotted': 'Enemy spotted, bearing',
        'torpPort': 'Torpedo hit on port side!',
        'torpStbd': 'Torpedo hit on starboard side!',
        'breach': "Hull breach below the waterline! We're taking on water!",
        'seal': 'Seal all watertight bulkheads! Isolate the section!',
        'd0': 'zero',
        'd1': 'one',
        'd2': 'two',
        'd3': 'three',
        'd4': 'four',
        'd5': 'five',
        'd6': 'six',
        'd7': 'seven',
        'd8': 'eight',
        'd9': 'niner',
    },
    'gbr': {
        'main': 'Open fire!',
        'sec': 'Secondary armament, open fire!',
        'torp': 'Torpedo away!',
        'torps': 'Torpedoes away!',
        'aa': 'Engage air target!',
        'aas': 'Engage air targets!',
        'dc': 'Drop depth charges!',
        'abandon': 'Abandon ship!',
        'lastShell': "We'll fight till our last shell!",
        'spotted': 'Enemy spotted, bearing',
        'torpPort': 'Torpedo hit on port side!',
        'torpStbd': 'Torpedo hit on starboard side!',
        'breach': "Hull breach below the waterline! We're taking on water!",
        'seal': 'Seal all watertight bulkheads! Isolate the section!',
        'd0': 'zero',
        'd1': 'one',
        'd2': 'two',
        'd3': 'three',
        'd4': 'four',
        'd5': 'five',
        'd6': 'six',
        'd7': 'seven',
        'd8': 'eight',
        'd9': 'nine',
    },
    'ger': {
        'main': 'Feuer frei!',
        'sec': 'Mittelartillerie, Feuer frei!',
        'torp': 'Torpedo los!',
        'torps': 'Torpedos los!',
        'aa': 'Luftziel bekämpfen!',
        'aas': 'Luftziele bekämpfen!',
        'dc': 'Wasserbomben werfen!',
        'abandon': 'Alle Mann von Bord!',
        'lastShell': 'Wir kämpfen bis zur letzten Granate!',
        'spotted': 'Feind in Sicht, Peilung',
        'torpPort': 'Torpedotreffer backbord!',
        'torpStbd': 'Torpedotreffer steuerbord!',
        'breach': 'Leck unter der Wasserlinie! Wir machen Wasser!',
        'seal': 'Alle wasserdichten Schotten schließen! Abteilung abschotten!',
        'd0': 'null',
        'd1': 'eins',
        'd2': 'zwo',
        'd3': 'drei',
        'd4': 'vier',
        'd5': 'fünf',
        'd6': 'sechs',
        'd7': 'sieben',
        'd8': 'acht',
        'd9': 'neun',
    },
    'fra': {
        'main': 'Ouvrez le feu !',
        'sec': 'Artillerie secondaire, ouvrez le feu !',
        'torp': 'Torpille lancée !',
        'torps': 'Torpilles lancées !',
        'aa': 'Engagez la cible aérienne !',
        'aas': 'Engagez les cibles aériennes !',
        'dc': 'Larguez les grenades sous-marines !',
        'abandon': 'Évacuez le navire !',
        'lastShell': "Nous combattrons jusqu'au dernier obus !",
        'spotted': 'Ennemi en vue, relèvement',
        'torpPort': 'Torpille à bâbord !',
        'torpStbd': 'Torpille à tribord !',
        'breach': "Brèche sous la ligne de flottaison ! Nous embarquons de l'eau !",
        'seal': 'Fermez toutes les cloisons étanches ! Isolez la tranche !',
        'd0': 'zéro',
        'd1': 'un',
        'd2': 'deux',
        'd3': 'trois',
        'd4': 'quatre',
        'd5': 'cinq',
        'd6': 'six',
        'd7': 'sept',
        'd8': 'huit',
        'd9': 'neuf',
    },
    # Japanese has no plural to change: one order serves one fish or six.
    'jpn': {
        'main': '撃ち方、始め！',
        'sec': '副砲、撃ち方始め！',
        'torp': '魚雷、発射！',
        'aa': '対空戦闘、撃ち方始め！',
        'dc': '爆雷、投下！',
        'abandon': '総員退艦！',
        'lastShell': '最後の一弾まで戦うぞ！',
        'spotted': '敵艦見ゆ、方位',
        'torpPort': '左舷に魚雷命中！',
        'torpStbd': '右舷に魚雷命中！',
        'breach': '喫水線下に破孔！浸水中！',
        'seal': '全防水扉閉鎖！区画を閉鎖せよ！',
        'd0': 'まる',
        'd1': 'ひと',
        'd2': 'ふた',
        'd3': 'さん',
        'd4': 'よん',
        'd5': 'ご',
        'd6': 'ろく',
        'd7': 'なな',
        'd8': 'はち',
        'd9': 'きゅう',
    },
}

TAKES = os.path.join(ROOT, 'assets/voices')

# A performed shout, finished for the bridge: the rumble out, the bite brought
# forward, squeezed, a little grit, the ring of a small steel compartment, and
# the silence trimmed off both ends so he speaks the instant the guns go.
CHAIN = ','.join([
    'highpass=f=140',
    'lowpass=f=8500',
    'equalizer=f=2500:width_type=o:width=1.4:g=4',
    'acompressor=threshold=-22dB:ratio=5:attack=3:release=90:makeup=6',
    'volume=3dB',
    'asoftclip=type=tanh',
    'aecho=0.9:0.5:13|29:0.16|0.08',
    'alimiter=limit=0.89:attack=1:release=40',
    'silenceremove=start_periods=1:start_threshold=-45dB',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-50dB',
    'areverse',
])

# A reading voice standing in for a take: pushed harder to sound shouted.
TTS_CHAIN = ','.join([
    'highpass=f=190',
    'lowpass=f=7000',
    'equalizer=f=900:width_type=o:width=1.2:g=3',
    'equalizer=f=2600:width_type=o:width=1.4:g=7',
    'vibrato=f=6.5:d=0.05',
    'acompressor=threshold=-26dB:ratio=9:attack=2:release=70:makeup=12',
    'volume=4dB',
    'asoftclip=type=tanh',
    'aecho=0.85:0.55:17|31|46:0.22|0.14|0.08',
    'alimiter=limit=0.89:attack=1:release=40',
    'silenceremove=start_periods=1:start_threshold=-45dB',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-42dB',
    'areverse',
])


async def speak(voice, rate, pitch, text, path):
    import edge_tts
    await edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, volume='+30%').save(path)


def rough(src, dst, chain=CHAIN):
    subprocess.run([
        'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
        '-af', chain, '-ac', '1', '-ar', '24000',
        '-c:a', 'libmp3lame', '-b:a', '56k', dst,
    ], check=True)


def figure(src, i, dst, tmp):
    """The i-th of ten figures said one after another in one take, by its pauses."""
    out = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af',
                          'silencedetect=noise=-38dB:d=0.12', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts, ends = [], []
    for line in out.splitlines():
        if 'silence_start' in line: starts.append(float(line.split('silence_start:')[1]))
        if 'silence_end' in line: ends.append(float(line.split('silence_end:')[1].split('|')[0]))
    # Spoken stretches lie between one silence's end and the next one's start.
    edges = [0.0] + ends
    spans = []
    for k, a in enumerate(edges):
        b = starts[k] if k < len(starts) and starts[k] > a else None
        if b is None:
            later = [q for q in starts if q > a]
            b = later[0] if later else None
        if b is None: b = 1e9
        if b - a > 0.08: spans.append((a, b))
    if len(spans) < 10:
        sys.exit(f'{src}: found {len(spans)} figures, not ten')
    a, b = spans[i]
    cut = os.path.join(tmp, f'cut-{i}.mp3')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', src,
                    '-ss', str(max(0, a - 0.03)), '-to', str(b + 0.05), cut], check=True)
    rough(cut, dst)


async def main():
    out = {}
    with tempfile.TemporaryDirectory() as tmp:
        for nation, lines in LINES.items():
            voice, rate, pitch = VOICES[nation]
            out[nation] = {}
            for key, text in lines.items():
                take = os.path.join(TAKES, f'{nation}-{key}.mp3')
                done = os.path.join(tmp, f'{nation}-{key}.mp3')
                if os.path.exists(take):
                    rough(take, done)
                elif key.startswith('d') and key[1:].isdigit() and os.path.exists(os.path.join(TAKES, f'{nation}-digits.mp3')):
                    # One take of all ten figures, cut apart at the pauses.
                    figure(os.path.join(TAKES, f'{nation}-digits.mp3'), int(key[1:]), done, tmp)
                elif '--tts' in sys.argv:
                    raw = os.path.join(tmp, f'{nation}-{key}-raw.mp3')
                    await speak(voice, rate, pitch, text, raw)
                    rough(raw, done, TTS_CHAIN)
                else:
                    sys.exit(f'no take for {nation} {key}: record assets/voices/{nation}-{key}.mp3 or run with --tts')
                with open(done, 'rb') as f:
                    out[nation][key] = base64.b64encode(f.read()).decode('ascii')
                print(f'{nation} {key:5} {text}  {os.path.getsize(done) // 1024} KB', file=sys.stderr)
    body = json.dumps(out, separators=(',', ':'))
    with open(OUT, 'w') as f:
        f.write('// Built by build/voice-lines.py -- do not edit by hand.\n')
        f.write('// The bridge orders of each navy, as base64 MP3, by nation and order.\n')
        f.write(f'export const VOICE_LINES = {body};\n')
    print(f'{OUT} -- {os.path.getsize(OUT) // 1024} KB', file=sys.stderr)


asyncio.run(main())
