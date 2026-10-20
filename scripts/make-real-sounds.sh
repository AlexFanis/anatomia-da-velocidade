#!/bin/sh
# Monta os sons reais de F1 a partir de gravações CC0 (domínio público) do Freesound:
#   181187 — Ears68, Red Bull Renault V8 (2012): marcha lenta + largada, Sydney 2013
#            https://freesound.org/people/Ears68/sounds/181187/
#   150337 — Ears68, F1 no GP da Austrália 2012 (TL3), reta da curva 10
#            https://freesound.org/people/Ears68/sounds/150337/
#   410894 — wandererscapes, beira da pista em Monza 2014
#            https://freesound.org/people/wandererscapes/sounds/410894/
# Originais em source/audio (gitignored). Uso: sh scripts/make-real-sounds.sh
set -e
export LC_ALL=C  # ponto decimal (o sistema está em pt_BR)
SRC=source/audio
OUT=public/audio
RB=$SRC/181187_2214631-hq.mp3
AUS=$SRC/150337_2214631-hq.mp3
MONZA=$SRC/410894_7987814-hq.mp3
NORM="loudnorm=I=-16:TP=-1.5:LRA=11"
mkdir -p "$OUT"

# Loop sem emenda: o corpo [a+x, b] termina num crossfade com a cabeça [a, a+x];
# o fim do arquivo cai exatamente onde o começo continua.
loop() { # entrada inicio fim crossfade saida
  mid=$(awk "BEGIN { printf \"%.3f\", $2 + $4 }")
  ffmpeg -v error -y -i "$1" -filter_complex "\
    [0:a]asplit[a][b];\
    [a]atrim=start=$mid:end=$3,asetpts=PTS-STARTPTS[body];\
    [b]atrim=start=$2:end=$mid,asetpts=PTS-STARTPTS[head];\
    [body][head]acrossfade=d=$4:c1=tri:c2=tri,$NORM,aresample=44100,aformat=channel_layouts=mono[out]" \
    -map "[out]" -c:a pcm_s16le "$5"
}

loop "$RB" 0.4 4.8 0.4 "$OUT/engine-idle.wav"
loop "$RB" 6.6 10.8 0.5 "$OUT/engine-high.wav"
loop "$MONZA" 1.0 20.0 1.0 "$OUT/trackside-full.wav"
# Ambiente de fundo: 22 kHz basta e corta o arquivo pela metade.
ffmpeg -v error -y -i "$OUT/trackside-full.wav" -ar 22050 -c:a pcm_s16le "$OUT/trackside.wav"
rm "$OUT/trackside-full.wav"

# Largada inteira (lenta → rugido → some na curva 1).
ffmpeg -v error -y -i "$RB" -af "atrim=start=5.0:end=13.5,asetpts=PTS-STARTPTS,afade=t=in:d=0.15,afade=t=out:st=6.8:d=1.7,$NORM" -b:a 160k "$OUT/launch.mp3"
# Passagem de um carro (vira o "whoosh" das transições).
ffmpeg -v error -y -i "$AUS" -af "atrim=start=16.2:end=18.8,asetpts=PTS-STARTPTS,afade=t=in:d=0.35,afade=t=out:st=2.0:d=0.6,$NORM" -b:a 160k "$OUT/passby.mp3"

ls -la "$OUT"
