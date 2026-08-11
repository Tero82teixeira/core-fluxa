#!/usr/bin/env bash
set -euo pipefail

reset_log="$(mktemp)"
trap 'rm -f "$reset_log"; supabase stop --no-backup >/dev/null 2>&1 || true' EXIT

supabase start

if ! supabase db reset --local 2>&1 | tee "$reset_log"; then
  mapfile -t applied < <(sed -nE 's/.*Applying migration ([^ ]+).*/\1/p' "$reset_log")
  failed="não identificada"
  if ((${#applied[@]} > 0)); then failed="${applied[-1]}"; fi
  successful_count=$((${#applied[@]} > 0 ? ${#applied[@]} - 1 : 0))
  last_successful="não aplicável"
  if (( successful_count > 0 )); then last_successful="${applied[$((successful_count - 1))]}"; fi
  sqlstate="$(sed -nE 's/.*(SQLSTATE[ :=]+|sqlstate[ :=]+)([A-Z0-9]{5}).*/\2/p' "$reset_log" | tail -1)"
  postgres_message="$(sed -nE '/(ERROR:|failed to execute sql|SQLSTATE)/p' "$reset_log" | tail -1)"
  object="$(sed -nE 's/.*(relation|function|policy|type|table|column) "?([^" ]+)"?.*/\1 \2/p' "$reset_log" | tail -1)"
  cat <<REPORT
DB RESET COMPLETO: FALHOU
migration que falhou: $failed
SQLSTATE: ${sqlstate:-não informado pelo Supabase CLI}
mensagem PostgreSQL: ${postgres_message:-não identificada}
objeto envolvido: ${object:-não identificado}
última migration aplicada com sucesso: $last_successful
quantidade de migrations aplicadas antes da falha: $successful_count
REPORT
  exit 1
fi

mapfile -t migrations < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | sort)
cat <<REPORT
DB RESET COMPLETO: PASSOU
total de migrations aplicadas: ${#migrations[@]}
última migration aplicada: ${migrations[-1]}
REPORT

supabase test db --local
npm run test:integration:parity
