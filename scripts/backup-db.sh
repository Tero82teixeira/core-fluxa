#!/usr/bin/env bash
set -euo pipefail

umask 077

die() { printf 'Erro no backup do banco: %s\n' "$1" >&2; exit 1; }

[[ -n "${SUPABASE_DB_URL:-}" ]] || die 'defina SUPABASE_DB_URL com a conexão PostgreSQL do projeto operacional.'
[[ -n "${BACKUP_DIR:-}" ]] || die 'defina BACKUP_DIR com uma pasta protegida fora do repositório.'
[[ "$SUPABASE_DB_URL" =~ ^postgres(ql)?:// ]] || die 'SUPABASE_DB_URL deve ser uma URL PostgreSQL.'

for program in pg_dump pg_restore sha256sum flock mktemp; do
  command -v "$program" >/dev/null 2>&1 || die "instale $program antes de executar o backup."
done

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
mkdir -p -- "$BACKUP_DIR"
backup_dir="$(cd -- "$BACKUP_DIR" && pwd -P)"
case "$backup_dir/" in
  "$repo_root/"*) die 'BACKUP_DIR não pode ficar dentro do repositório FLUXA.' ;;
esac

# Evita concorrência e colisões de nomes quando duas execuções começam juntas.
exec 9>"$backup_dir/.fluxa-db.lock"
flock -x 9
timestamp="$(date -u +%Y%m%d_%H%M%S)"
while [[ -e "$backup_dir/fluxa_db_$timestamp" ]]; do
  sleep 1
  timestamp="$(date -u +%Y%m%d_%H%M%S)"
done

name="fluxa_db_$timestamp"
temporary_dir="$(mktemp -d "$backup_dir/.${name}.XXXXXX")"
trap 'rm -rf -- "$temporary_dir"' EXIT

# A conexão é fornecida apenas em tempo de execução; nunca é escrita nos arquivos.
pg_dump --format=custom --dbname="$SUPABASE_DB_URL" --file="$temporary_dir/$name.dump"
pg_dump --schema-only --dbname="$SUPABASE_DB_URL" --file="$temporary_dir/${name}_schema.sql"

[[ -s "$temporary_dir/$name.dump" ]] || die 'o dump de dados está vazio.'
[[ -s "$temporary_dir/${name}_schema.sql" ]] || die 'o dump de schema está vazio.'
pg_restore --list "$temporary_dir/$name.dump" >/dev/null
(
  cd -- "$temporary_dir"
  sha256sum "$name.dump" > "$name.dump.sha256"
  sha256sum "${name}_schema.sql" > "${name}_schema.sql.sha256"
  sha256sum --check --status "$name.dump.sha256"
  sha256sum --check --status "${name}_schema.sql.sha256"
)

printf 'Backup concluído em %s (UTC).\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$temporary_dir/COMPLETED"
mv -T -- "$temporary_dir" "$backup_dir/$name"
trap - EXIT
printf 'Backup verificado: %s\n' "$backup_dir/$name" >&2
printf '%s\n' "$backup_dir/$name"
