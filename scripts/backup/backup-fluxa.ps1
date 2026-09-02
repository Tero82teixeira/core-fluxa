[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$OutputRoot
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$script:DatabaseUrlFromPrompt = $false
$script:ServiceKeyFromPrompt = $false

function Read-SecretText {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    $secureValue = Read-Host -Prompt $Prompt -AsSecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Assert-LastCommand {
    param([Parameter(Mandatory = $true)][string]$Step)
    if ($LASTEXITCODE -ne 0) {
        throw "$Step falhou (código $LASTEXITCODE). A pasta foi mantida como INCOMPLETA para diagnóstico."
    }
}

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$externalRoot = [IO.Path]::GetFullPath($OutputRoot)
$separator = [IO.Path]::DirectorySeparatorChar
$repositoryPrefix = $repositoryRoot.TrimEnd($separator) + $separator

if ($externalRoot.Equals($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -or
    $externalRoot.StartsWith($repositoryPrefix, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Escolha uma pasta fora do projeto FLUXA. Backups podem conter dados de clientes e nunca devem ir para o GitHub."
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "Node.js não encontrado. Instale o Node.js antes de executar o backup."
}
if (-not (Get-Command npx -ErrorAction SilentlyContinue)) {
    throw "npx não encontrado. Instale o Node.js antes de executar o backup."
}
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Docker não encontrado. Instale e abra o Docker Desktop antes de executar o backup."
}
& docker info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "O Docker Desktop está instalado, mas não está em execução. Abra-o e tente novamente."
}

$databaseUrl = $env:FLUXA_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
    $databaseUrl = Read-SecretText "Cole a connection string do banco (a digitação ficará oculta)"
    $script:DatabaseUrlFromPrompt = $true
}

$supabaseUrl = $env:FLUXA_SUPABASE_URL
if ([string]::IsNullOrWhiteSpace($supabaseUrl)) {
    $supabaseUrl = Read-Host "Cole a URL do projeto Supabase"
}

$serviceRoleKey = $env:FLUXA_SERVICE_ROLE_KEY
if ([string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    $serviceRoleKey = Read-SecretText "Cole a service_role key (a digitação ficará oculta)"
    $script:ServiceKeyFromPrompt = $true
}

if ([string]::IsNullOrWhiteSpace($databaseUrl) -or
    [string]::IsNullOrWhiteSpace($supabaseUrl) -or
    [string]::IsNullOrWhiteSpace($serviceRoleKey)) {
    throw "As três credenciais são obrigatórias. Nenhuma delas será gravada no backup."
}

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$backupDirectory = Join-Path $externalRoot "fluxa-backup-$timestamp"
New-Item -ItemType Directory -Path $backupDirectory -ErrorAction Stop | Out-Null
Set-Content -Path (Join-Path $backupDirectory "INCOMPLETO.txt") -Value "Backup ainda não concluído."

try {
    Write-Host "1/5 Exportando papéis do banco..."
    & npx --yes supabase db dump --db-url $databaseUrl -f (Join-Path $backupDirectory "roles.sql") --role-only
    Assert-LastCommand "Exportação de papéis"

    Write-Host "2/5 Exportando estrutura do banco..."
    & npx --yes supabase db dump --db-url $databaseUrl -f (Join-Path $backupDirectory "schema.sql")
    Assert-LastCommand "Exportação do schema"

    Write-Host "3/5 Exportando dados do banco..."
    & npx --yes supabase db dump --db-url $databaseUrl -f (Join-Path $backupDirectory "data.sql") --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
    Assert-LastCommand "Exportação dos dados"

    Write-Host "4/5 Copiando arquivos do Storage..."
    $previousSupabaseUrl = $env:FLUXA_SUPABASE_URL
    $previousServiceKey = $env:FLUXA_SERVICE_ROLE_KEY
    $env:FLUXA_SUPABASE_URL = $supabaseUrl
    $env:FLUXA_SERVICE_ROLE_KEY = $serviceRoleKey
    try {
        & node (Join-Path $PSScriptRoot "backup-storage.mjs") --output $backupDirectory
        Assert-LastCommand "Cópia do Storage"
    }
    finally {
        $env:FLUXA_SUPABASE_URL = $previousSupabaseUrl
        $env:FLUXA_SERVICE_ROLE_KEY = $previousServiceKey
    }

    Write-Host "5/5 Gerando comprovante de integridade..."
    $commit = "não identificado"
    if (Get-Command git -ErrorAction SilentlyContinue) {
        $detectedCommit = (& git -C $repositoryRoot rev-parse HEAD 2>$null)
        if ($LASTEXITCODE -eq 0) { $commit = ($detectedCommit | Out-String).Trim() }
    }
    $files = Get-ChildItem -Path $backupDirectory -File -Recurse |
        Where-Object { $_.Name -notin @("INCOMPLETO.txt", "checksums.sha256", "backup-info.json") } |
        Sort-Object FullName

    $checksums = foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($backupDirectory.TrimEnd("\").Length + 1).Replace("\", "/")
        $hash = (Get-FileHash -Algorithm SHA256 -Path $file.FullName).Hash.ToLowerInvariant()
        "$hash  $relativePath"
    }
    Set-Content -Path (Join-Path $backupDirectory "checksums.sha256") -Value $checksums -Encoding utf8

    $backupInfo = [ordered]@{
        formatVersion = 1
        completedAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        gitCommit = $commit
        fileCount = $files.Count
        totalBytes = ($files | Measure-Object -Property Length -Sum).Sum
        encrypted = $false
        warning = "Guardar somente em unidade protegida/criptografada e fora do GitHub."
    }
    $backupInfo | ConvertTo-Json | Set-Content -Path (Join-Path $backupDirectory "backup-info.json") -Encoding utf8

    Remove-Item -Path (Join-Path $backupDirectory "INCOMPLETO.txt")
    Set-Content -Path (Join-Path $backupDirectory "CONCLUIDO.txt") -Value "Backup concluído e verificado em $($backupInfo.completedAtUtc)." -Encoding utf8

    Write-Host ""
    Write-Host "Backup concluído em: $backupDirectory" -ForegroundColor Green
    Write-Host "Proteja essa pasta com BitLocker ou guarde-a em uma unidade criptografada."
}
finally {
    $databaseUrl = $null
    $serviceRoleKey = $null
    if ($script:DatabaseUrlFromPrompt) { $env:FLUXA_DATABASE_URL = $null }
    if ($script:ServiceKeyFromPrompt) { $env:FLUXA_SERVICE_ROLE_KEY = $null }
}
