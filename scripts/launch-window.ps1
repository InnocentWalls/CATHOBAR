param(
  [string]$Url = "http://localhost:3000/",
  [int]$Width = 1280,
  [int]$Height = 400
)

$candidates = @(
  "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$browser = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Error "Microsoft Edge または Google Chrome が見つかりません。"
  exit 1
}

$profileDir = Join-Path $env:TEMP "cathobar-win-profile"
$args = @(
  "--app=$Url",
  "--window-size=$Width,$Height",
  "--user-data-dir=$profileDir",
  "--no-first-run",
  "--disable-session-crashed-bubble"
)

Write-Host "Launching $browser at ${Width}x${Height} -> $Url"
Start-Process -FilePath $browser -ArgumentList $args
