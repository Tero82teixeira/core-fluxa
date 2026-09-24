#!/usr/bin/env bash
set -euo pipefail

die() { printf 'Erro na restauração do banco: %s\n' "$1" >&2; exit 1; }

[[ -n "${TARGET_DB_URL:-}" ]] || die 'defina TARGET_DB_URL com a conexão do banco de destino.'
[[ -n "${BACKUP_FILE:-}" ]] || die 'defina BACKUP_FILE com o caminho de um arquivo .dump.'
[[ "$TARGET_DB_URL" =~ ^postgres(ql)?:// ]] || die 'TARGET_DB_URL deve ser uma URL PostgreSQL.'
[[ -f "$BACKUP_FILE" && "$BACKUP_FILE" == *.dump ]] || die 'BACKUP_FILE deve apontar para um arquivo .dump existente.'
for program in pg_restore sha256sum; do
  command -v "$program" >/dev/null 2>&1 || die "instale $program antes de restaurar."
done

backup_file="$(cd -- "$(dirname -- "$BACKUP_FILE")" && pwd -P)/$(basename -- "$BACKUP_FILE")"
checksum_file="$backup_file.sha256"
if [[ -f "$checksum_file" ]]; then
  read -r expected recorded extra < "$checksum_file" || die 'arquivo SHA-256 inválido.'
  [[ "$expected" =~ ^[[:xdigit:]]{64}$ && "$recorded" == "$(basename -- "$backup_file")" && -z "${extra:-}" ]] \
    || die 'arquivo SHA-256 inválido ou associado a outro dump.'
  actual="$(sha256sum -- "$backup_file")"
  [[ "${actual%% *}" == "$expected" ]] || die 'SHA-256 divergente; restauração cancelada.'
else
  printf 'Aviso: não há arquivo .sha256; não foi possível verificar a integridade externa.\n' >&2
fi

pg_restore --list "$backup_file" >/dev/null || die 'arquivo não é um dump customizado válido.'

if [[ "${FORCE:-0}" != 1 ]]; then
  [[ -t 0 ]] || die 'execução não interativa bloqueada; use FORCE=1 somente após validar o destino.'
  printf 'ATENÇÃO: --clean removerá objetos do banco de destino antes de recriá-los.\n' >&2
  printf 'Teste primeiro em um projeto Supabase isolado. Digite RESTAURAR para continuar: ' >&2
  read -r confirmation
  [[ "$confirmation" == RESTAURAR ]] || die 'restauração cancelada.'
fi

pg_restore --clean --if-exists --exit-on-error --single-transaction --no-owner \
  --dbname="$TARGET_DB_URL" "$backup_file"
printf 'Restauração concluída; valide Auth, RLS, papéis e contagens antes de usar o destino.\n' >&2
