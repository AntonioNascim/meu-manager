#!/usr/bin/env bash
# Roda os testes de ponta a ponta (c3, c4, c5, c6 e e3) um de cada vez, com o servidor local (Worker no workerd) e o site (Vite), no navegador Chromium.
# Serve ao workflow "Ponta a ponta" do GitHub Actions (e roda igual em qualquer máquina com memória: o servidor e o navegador sobem aqui dentro).
#   bash tools/online-lab/run-e2e.sh [todos | c3 c4 c5 c6 e3 ...]      (a partir da raiz do projeto)
# Saída em e2e-out/: um .log por teste, wrangler.log, vite.log e resumo.md (tabela de resultados). As capturas vão para .shots/.
# O c6 precisa do servidor com lesões frequentes (LIVE_INJURY_RATE:60); os outros, do servidor normal. Por isso o servidor sobe duas vezes.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"
OUT="${E2E_OUT:-e2e-out}"
mkdir -p "$OUT" .shots
API=http://127.0.0.1:8787
SITE=http://localhost:5173

declare -A SCRIPT=([c3]=c3-e2e.mjs [c4]=c4-e2e.mjs [c5]=c5-e2e.mjs [c6]=c6-e2e.mjs [e3]=e3-pular-conversar.mjs)
ORDER=(c3 c4 c5 e3 c6)

want=("$@")
if [ ${#want[@]} -eq 0 ] || [ "${want[0]}" = "todos" ]; then want=("${ORDER[@]}"); fi
for t in "${want[@]}"; do
  [ -n "${SCRIPT[$t]:-}" ] || { echo "teste desconhecido: $t (use c3, c4, c5, c6, e3 ou todos)"; exit 2; }
done
selected() { for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

API_PID=""
SITE_PID=""
stop_api() {
  [ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null
  pkill -f workerd 2>/dev/null
  pkill -f "wrangler dev" 2>/dev/null
  API_PID=""
  sleep 2
}
stop_all() {
  stop_api
  [ -n "$SITE_PID" ] && kill "$SITE_PID" 2>/dev/null
  pkill -f vite 2>/dev/null
}
trap stop_all EXIT

start_api() { # $1 = opções extras do wrangler (ex.: --var LIVE_INJURY_RATE:60)
  stop_api
  (cd server && ../tools/online-lab/node_modules/.bin/wrangler dev --local --port 8787 $1 > "../$OUT/wrangler.log" 2>&1) &
  API_PID=$!
  for _ in $(seq 1 60); do
    code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" "$API/api/me")
    [ "$code" = "401" ] && { echo "servidor local no ar ($1)"; return 0; }
    sleep 3
  done
  echo "o servidor local não subiu"; tail -n 30 "$OUT/wrangler.log"; return 1
}

start_site() {
  VITE_API_BASE="$API" VITE_TURNSTILE_BYPASS=1 npx vite --port 5173 --strictPort > "$OUT/vite.log" 2>&1 &
  SITE_PID=$!
  for _ in $(seq 1 60); do
    code=$(curl -s -m 8 -o /dev/null -w "%{http_code}" "$SITE/")
    [ "$code" = "200" ] && break
    sleep 3
  done
  # Aquece o Vite: a primeira carga compila o aplicativo e passa dos 30 s que os testes esperam.
  curl -s -m 120 -o /dev/null "$SITE/src/ui/main.tsx"
  echo "site no ar"
}

# Banco local com as migrações e a chave de teste do Turnstile (a mesma de server/.dev.vars.example).
[ -f server/.dev.vars ] || cp server/.dev.vars.example server/.dev.vars
(cd server && ../tools/online-lab/node_modules/.bin/wrangler d1 migrations apply meu-manager --local > "../$OUT/migracoes.log" 2>&1) || { echo "migrações falharam"; cat "$OUT/migracoes.log"; exit 1; }

echo "| Teste | Resultado | Tentativas | Duração |" > "$OUT/resumo.md"
echo "|---|---|---|---|" >> "$OUT/resumo.md"
FAILED=0

run_one() { # $1 = c3|c4|...
  local t="$1" s="${SCRIPT[$1]}" tries=0 ok=1 start end
  start=$(date +%s)
  while [ $tries -lt 2 ]; do
    tries=$((tries + 1))
    (cd tools/online-lab && node "$s") > "$OUT/$t.log" 2>&1 && { ok=0; break; }
    # Só repete uma vez, e a tentativa fica registrada no resumo (a primeira carga do Vite pode estourar o tempo; qualquer outra falha aparece nas duas).
    echo "tentativa $tries de $t falhou" >&2
    cp "$OUT/$t.log" "$OUT/$t.tentativa$tries.log"
  done
  end=$(date +%s)
  if [ $ok -eq 0 ]; then
    echo "| $t | passou | $tries | $((end - start)) s |" >> "$OUT/resumo.md"
  else
    echo "| $t | **FALHOU** | $tries | $((end - start)) s |" >> "$OUT/resumo.md"
    FAILED=1
  fi
  grep -v "\[console\]\|\[rede\]" "$OUT/$t.log" | tail -n 25
}

start_site || exit 1

# Servidor normal: c3, c4, c5 e e3.
if selected c3 || selected c4 || selected c5 || selected e3; then
  start_api "" || exit 1
  for t in c3 c4 c5 e3; do selected "$t" && run_one "$t"; done
fi
# Servidor com lesões frequentes: c6.
if selected c6; then
  start_api "--var LIVE_INJURY_RATE:60" || exit 1
  run_one c6
fi

echo
cat "$OUT/resumo.md"
exit $FAILED
