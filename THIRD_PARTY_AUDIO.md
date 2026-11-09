# Third-party audio

The orchestral sample pack in `public/audio/orch/v1/` is built by
`scripts/build-orchestra-samples.mjs` from public-domain (CC0) recordings of single
instrument notes. `src/lib/music.ts` plays these notes. The melodies, harmonies and
arrangements are original to Courage for Kids and live in code. The pack contains no
recorded music, only individual notes and effects.

CC0 does not require credit. Versilian Studios asks for it, so we give credit to every
source below.

Suggested credit line for an About or credits page:

> Orchestral samples: VSCO 2 Community Edition and VCSL by Versilian Studios; celesta by
> stamperadam (Freesound). All released under CC0.

## Sources

### VSCO 2 Community Edition, by Versilian Studios (Sam Gossner)

- License: CC0 1.0 Universal (the `LICENSE` file in the repository). The homepage is
  https://versilian-studios.com/vsco-community/. The repository's `Readme.txt` makes three
  non-binding requests:
  - credit Versilian Studios / Sam Gossner;
  - link to the VSCO: CE homepage;
  - don't sell the samples directly.
- Repository: https://github.com/sgossner/VSCO-2-CE
- Pinned commit: `440300901dfe9275fd84e0b7763af1f8443ae62e`
- Used:

  | Instrument | Files |
  | --- | --- |
  | Glockenspiel | `Percussion/Glock/glock_medium_*` |
  | Concert harp | `Strings/Harp/KSHarp_*_mf` |
  | Violin section, sustain with vibrato | `Strings/Violin Section/susVib/*_v2` |
  | Violin section, tremolo | `Strings/Violin Section/Trem/*_v1` |
  | Cello section, sustain with vibrato | `Strings/Cello Section/susvib/*_v3_1` |
  | F horn, sustain | `Brass/F Horn/sus/MOHorn_sus_*` |
  | Timpani hits | `Percussion/Timpani/*_Hit_v3_rr1`, `*_Hit_v4_rr1` |
  | Timpani rolls | `Percussion/Timpani/Rolls/*_Roll_v3_rr1` |
  | Orchestral crash cymbals | `Percussion/cymbal-crash1_mf_rr1`, `_ff_rr1` |

### VCSL (Versilian Community Sample Library), by Versilian Studios LLC

- License: CC0 1.0 Universal (the `LICENSE` file). The README says "no royalties, no
  credit, no special terms".
- Repository: https://github.com/sgossner/VCSL
- Pinned commit: `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`
- Used:
  - suspended cymbal mallet swells: `Idiophones/Struck Idiophones/Suspended Cymbal 1/susCymb1_cresc_{2s,4s,7.5s}`
  - mark tree glissandi: `Idiophones/Struck Idiophones/Mark Trees/Legacy/windchimes_{asc1,desc1}`

### Celeste samples, by stamperadam (Freesound pack 6166)

- License: CC0 1.0 (Creative Commons 0), as shown on the Freesound pack page.
- Original: https://freesound.org/people/stamperadam/packs/6166/
- Fetched from: the Freesound site needs a login, so the build takes the files from an
  unmodified FLAC mirror in the Sonatina Symphonic Orchestra repository:
  https://github.com/peastman/sso/tree/4f570ce3b3896fb8a7c543f50b5d13f2ea5e58a1/Sonatina%20Symphonic%20Orchestra/Samples/Celeste.
  The folder's README says the files come from the Freesound pack above, were converted to
  FLAC, were not otherwise modified, and are public domain (CC0).
- Pinned commit: `4f570ce3b3896fb8a7c543f50b5d13f2ea5e58a1` (the commit that added the folder)
- Used: all 24 notes, C4 to G#7 in major thirds, in the soft and hard layers.
- Only this folder is used. The rest of the SSO repository is under Creative Commons
  Sampling Plus 1.0, and its original sources can't be verified. The build script's
  allow-list rejects every SSO path outside this folder.

## Changes we made

CC0 places no conditions on changes. We list them so it's clear what we did. The build
script changes each file in these ways:

- Trims the leading silence.
- Removes rumble with a high-pass filter set below the instrument's range.
- Mixes the stereo channels down to mono, after lining up the delay between the two
  microphones.
- Shortens the file and fades it out.
- Gives sustained notes a crossfaded loop.
- Normalizes the peak level.
- Encodes it as MP3.

`public/audio/orch/v1/manifest.json` lists the source path of every output file.

## Sources we don't use

We excluded these because their terms or the origin of their recordings couldn't be
verified. Don't add samples from them:

- Philharmonia Orchestra samples: they may not be made available "as is" or as a sampler
  instrument.
- Any SSO folder other than Celeste.
- The FluidR3, MusyngKite and FatBoy soundfonts.
- tonejs-instruments.

## Rebuilding

```
node scripts/build-orchestra-samples.mjs            # needs git, curl, and ffmpeg/ffprobe with libmp3lame
ORCH_CACHE_DIR=/some/cache node scripts/build-orchestra-samples.mjs --dry-run
```

The script downloads the pinned files into a cache directory outside the repository and
checks each one against the git blob hash of its pinned commit. It writes only the
encoded MP3s and the manifest, and it fails if the pack grows past 6 MB.
