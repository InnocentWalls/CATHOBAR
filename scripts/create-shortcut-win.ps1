param(
  [string]$DestinationDir = [Environment]::GetFolderPath("Desktop"),
  [string]$ShortcutName = "CATHOBAR.lnk"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$vbsPath = Join-Path $PSScriptRoot "start-cathobar.vbs"
if (-not (Test-Path $vbsPath)) {
  Write-Error "Launcher script not found: $vbsPath"
  exit 1
}

New-Item -ItemType Directory -Force -Path $DestinationDir | Out-Null
$shortcutPath = Join-Path $DestinationDir $ShortcutName

$iconCandidates = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$iconExe = $iconCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
$iconLocation = if ($iconExe) { "$iconExe,0" } else { "shell32.dll,15" }

$wshell = New-Object -ComObject WScript.Shell
$shortcut = $wshell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = """$vbsPath"""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "CATHOBAR Ticker Display"
$shortcut.IconLocation = $iconLocation
$shortcut.Save()

Write-Host "Shortcut created: $shortcutPath"
