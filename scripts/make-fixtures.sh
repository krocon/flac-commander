#!/usr/bin/env bash
# Regenerates the audio fixtures of fc-core (1 s, 440 Hz sine, self-made: no rights of others).
# Needs ffmpeg with libmp3lame and libopus. The results are committed; CI does not run this.
set -euo pipefail
cd "$(dirname "$0")/../crates/fc-core/tests/fixtures"

gen() { # gen <sample rate> <channels> <output> <encoder options…>
  local rate=$1 channels=$2 out=$3
  shift 3
  ffmpeg -hide_banner -loglevel error -y \
    -f lavfi -i "sine=frequency=440:duration=1:sample_rate=${rate}" \
    -ac "$channels" -map_metadata -1 -metadata title=Sine -metadata artist=fc-core \
    "$@" "$out"
}

gen 44100 2 sine.mp3 -c:a libmp3lame -b:a 64k
gen 44100 2 sine.flac -c:a flac
gen 44100 2 sine.wav -c:a pcm_s16le
gen 44100 2 sine.ogg -c:a vorbis -strict -2 -b:a 64k
gen 48000 2 sine.opus -c:a libopus -b:a 48k
gen 44100 2 sine.m4a -c:a aac -b:a 64k
gen 44100 2 sine-alac.m4a -c:a alac
gen 44100 2 sine.aiff -c:a pcm_s16be
gen 96000 1 sine-96k-24bit-mono.flac -c:a flac -sample_fmt s32 -bits_per_raw_sample 24

# Broken input: a FLAC cut off in the middle of its first frames, and text named like an MP3.
head -c 14000 sine.flac > truncated.flac
for _ in $(seq 1 40); do echo "this is not audio at all, just text pretending to be an mp3 file"; done > garbage.mp3
