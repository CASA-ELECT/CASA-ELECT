# CASA-ELECT · copie quotidienne de la base sur le PC du magasin, et copie hebdomadaire sur le disque externe.
# Lancé chaque jour par le Planificateur de tâches de Windows (voir installer-tache.cmd).
# Le fichier config.json (à côté de ce script) contient : {"url": "...supabase.co", "cle": "sb_secret_...", "dossier": "C:\\Sauvegardes\\CASA-ELECT", "disque": "CASA-SAUV"}
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ici = Split-Path -Parent $MyInvocation.MyCommand.Path
$cfg = Get-Content (Join-Path $ici 'config.json') -Raw | ConvertFrom-Json
$dossier = if ($cfg.dossier) { $cfg.dossier } else { 'C:\Sauvegardes\CASA-ELECT' }
New-Item -ItemType Directory -Force -Path $dossier | Out-Null
$journal = Join-Path $dossier 'journal.txt'
function Note($m) { Add-Content -Path $journal -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm') + '  ' + $m) }
try {
  $H = @{ apikey = $cfg.cle; Authorization = 'Bearer ' + $cfg.cle }
  $coll = @{}; $n = 0; $from = 0
  do {
    $rows = Invoke-RestMethod -Headers $H -Uri ($cfg.url + '/rest/v1/docs?select=col,id,data&order=col,id&offset=' + $from + '&limit=1000')
    foreach ($r in $rows) { if (-not $coll.ContainsKey($r.col)) { $coll[$r.col] = @{} }; $coll[$r.col][$r.id] = $r.data; $n++ }
    $from += 1000
  } while ($rows.Count -eq 1000)
  $out = [ordered]@{ app = 'CASA-ELECT'; version = 1; date = (Get-Date).ToUniversalTime().ToString('o'); source = 'Supabase (copie PC)'; collections = $coll }
  $f = Join-Path $dossier ('sauvegarde-casa-elect-' + (Get-Date -Format 'yyyy-MM-dd') + '.json')
  [IO.File]::WriteAllText($f, ($out | ConvertTo-Json -Depth 30 -Compress), (New-Object Text.UTF8Encoding $false))   # UTF-8 sans BOM : relisible par l'application
  Note ("OK : $n fiches -> $f")
  # on garde 30 jours sur le PC
  Get-ChildItem $dossier -Filter 'sauvegarde-casa-elect-*.json' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Force
  # disque externe : copie si branché et si la dernière copie a plus de 6 jours (on garde 12 copies)
  $vol = Get-Volume -ErrorAction SilentlyContinue | Where-Object { $_.FileSystemLabel -eq $cfg.disque -and $_.DriveLetter }
  if ($vol) {
    $ext = ($vol.DriveLetter + ':\Sauvegardes-CASA-ELECT'); New-Item -ItemType Directory -Force -Path $ext | Out-Null
    $der = Get-ChildItem $ext -Filter 'sauvegarde-casa-elect-*.json' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $der -or $der.LastWriteTime -lt (Get-Date).AddDays(-6)) { Copy-Item $f $ext; Note ('Copie sur le disque externe ' + $vol.DriveLetter + ':') }
    Get-ChildItem $ext -Filter 'sauvegarde-casa-elect-*.json' | Sort-Object Name -Descending | Select-Object -Skip 12 | Remove-Item -Force
  }
} catch { Note ('ERREUR : ' + $_.Exception.Message) }
