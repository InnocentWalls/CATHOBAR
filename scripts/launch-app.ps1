param(
  [int]$Port = 3000,
  [int]$Width = 1600,
  [int]$Height = 280,
  [switch]$KeepServer,
  [ValidateSet("auto", "chrome", "edge")]
  [string]$Browser = "auto",
  [string]$ProfileDir = (Join-Path $env:LOCALAPPDATA "CATHOBAR\browser-profile")
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$serverEntry = Join-Path $repoRoot "packages\server\dist\index.js"
$webEntry = Join-Path $repoRoot "packages\web\dist\index.html"
$baseUrl = "http://localhost:$Port/"
$healthUrl = "http://127.0.0.1:$Port/api/health"

function Show-ErrorPopup {
  param([string]$Message)
  try {
    $wshell = New-Object -ComObject WScript.Shell
    [void]$wshell.Popup($Message, 0, "CATHOBAR", 16)
  } catch {
    Write-Error $Message
  }
}

function Test-CathobarHealth {
  param([string]$Url)
  try {
    $res = Invoke-RestMethod -Uri $Url -TimeoutSec 1 -ErrorAction Stop
    return ($null -ne $res -and $res.ok -eq $true -and $res.service -eq "cathobar")
  } catch {
    return $false
  }
}

function Resolve-BrowserPath {
  param([string]$Choice)
  $chromeCandidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
  )
  $edgeCandidates = @(
    "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )

  $candidates = @()
  if ($Choice -eq "chrome") {
    $candidates = $chromeCandidates
  } elseif ($Choice -eq "edge") {
    $candidates = $edgeCandidates
  } else {
    $candidates = $chromeCandidates + $edgeCandidates
  }

  return ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
}

$browserPath = Resolve-BrowserPath -Choice $Browser
if (-not $browserPath) {
  Show-ErrorPopup "Google Chrome or Microsoft Edge was not found."
  exit 1
}
$browserExeName = [System.IO.Path]::GetFileName($browserPath)

$serverProc = $null
$startedByUs = $false

try {
  if (-not (Test-CathobarHealth -Url $healthUrl)) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) {
      Show-ErrorPopup "Node.js was not found. Please check your PATH."
      exit 1
    }

    if (-not (Test-Path $serverEntry) -or -not (Test-Path $webEntry)) {
      $npmCmd = Get-Command npm.cmd -ErrorAction SilentlyContinue
      if (-not $npmCmd) {
        Show-ErrorPopup "npm.cmd was not found (required for initial build)."
        exit 1
      }
      $buildOutLog = Join-Path $env:TEMP "cathobar-build.log"
      $buildErrLog = Join-Path $env:TEMP "cathobar-build.err.log"
      $buildProc = Start-Process -FilePath $npmCmd.Source `
        -ArgumentList @("run", "build") `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -Wait `
        -PassThru `
        -RedirectStandardOutput $buildOutLog `
        -RedirectStandardError $buildErrLog
      if ($buildProc.ExitCode -ne 0) {
        Show-ErrorPopup "Build failed. Check the log:`n$buildErrLog"
        exit 1
      }
    }

    $serverOutLog = Join-Path $env:TEMP "cathobar-server-$Port.log"
    $serverErrLog = Join-Path $env:TEMP "cathobar-server-$Port.err.log"

    $hadPrevPort = Test-Path Env:PORT
    $prevPort = $env:PORT
    try {
      $env:PORT = "$Port"
      $serverProc = Start-Process -FilePath $nodeCmd.Source `
        -ArgumentList @("""$serverEntry""") `
        -WorkingDirectory $repoRoot `
        -WindowStyle Hidden `
        -PassThru `
        -RedirectStandardOutput $serverOutLog `
        -RedirectStandardError $serverErrLog
    } finally {
      if ($hadPrevPort) {
        $env:PORT = $prevPort
      } else {
        Remove-Item Env:PORT -ErrorAction SilentlyContinue
      }
    }

    $startedByUs = $true

    $ready = $false
    for ($i = 0; $i -lt 100; $i++) {
      if ($serverProc.HasExited) {
        Show-ErrorPopup "Failed to start the CATHOBAR server. Check the log:`n$serverErrLog"
        exit 1
      }
      if (Test-CathobarHealth -Url $healthUrl) {
        $ready = $true
        break
      }
      Start-Sleep -Milliseconds 200
    }

    if (-not $ready) {
      Show-ErrorPopup "CATHOBAR server did not respond in time (port $Port).`n$serverErrLog"
      exit 1
    }
  }

  New-Item -ItemType Directory -Force -Path $ProfileDir | Out-Null

  $browserArgs = @(
    "--app=$baseUrl",
    "--window-size=$Width,$Height",
    "--user-data-dir=""$ProfileDir""",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-session-crashed-bubble"
  )

  $browserProc = Start-Process -FilePath $browserPath -ArgumentList $browserArgs -PassThru

  if ($browserProc) {
    Wait-Process -Id $browserProc.Id -ErrorAction SilentlyContinue
  }

  # Chromium launcher handoff guard: wait until all browser processes using this profile exit.
  while ($true) {
    $remaining = Get-CimInstance Win32_Process -Filter "Name = '$browserExeName'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -and $_.CommandLine.Contains($ProfileDir) }
    if (-not $remaining) {
      break
    }
    Start-Sleep -Milliseconds 500
  }
} finally {
  if ($startedByUs -and -not $KeepServer -and $serverProc -and -not $serverProc.HasExited) {
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
  }
}
