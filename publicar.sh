#!/bin/sh
# Gera o build e publica no GitHub Pages (branch gh-pages).
# Uso: ./publicar.sh  (ou npm run publicar)
set -e
cd "$(dirname "$0")"
npm run build
TMP=$(mktemp -d)
cp -R dist/. "$TMP"
touch "$TMP/.nojekyll"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name)" -c user.email="$(git -C "$OLDPWD" config user.email)" commit -q -m "Publicar site"
# Usa o login do GitHub CLI só neste push, sem mudar a configuração global do git.
git -c credential.helper= -c credential.helper='!gh auth git-credential' push -q -f "$(git -C "$OLDPWD" remote get-url origin)" gh-pages
cd - >/dev/null
rm -rf "$TMP"
echo "Publicado: https://alexfanis.github.io/anatomia-da-velocidade/"
