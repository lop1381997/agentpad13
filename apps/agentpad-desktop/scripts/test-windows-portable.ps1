param([Parameter(Mandatory)][string]$Archive)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if (-not $IsWindows) { throw 'Windows required' }
$archivePath = (Resolve-Path $Archive).Path
$expected = ((Get-Content "$archivePath.sha256" -Raw).Trim() -split '\s+')[0]
if ((Get-FileHash $archivePath -Algorithm SHA256).Hash -ne $expected) { throw 'ZIP hash mismatch' }
$root = Join-Path ([System.IO.Path]::GetTempPath()) ("AgentPad13 smoke " + [guid]::NewGuid())
New-Item -ItemType Directory $root | Out-Null
Expand-Archive $archivePath $root
$package = Join-Path $root 'AgentPad13'
foreach ($required in @('AgentPad13.exe', 'agentpad13.portable', 'Start-AgentPad13.cmd', 'Data', 'WebView2/msedgewebview2.exe')) {
    if (-not (Test-Path (Join-Path $package $required))) { throw "Missing portable entry: $required" }
}
$oldRuntime = $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER
$oldData = $env:WEBVIEW2_USER_DATA_FOLDER
function Test-Launch([string]$folder, [string]$mode) {
    # An invalid inherited runtime makes silent fallback observable. The app must override it.
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = Join-Path $root 'missing-system-runtime'
    $env:WEBVIEW2_USER_DATA_FOLDER = $null
    & icacls.exe (Join-Path $folder 'WebView2') /grant '*S-1-15-2-2:(OI)(CI)(RX)' '*S-1-15-2-1:(OI)(CI)(RX)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Runtime ACL preparation failed' }
    $stdout = Join-Path $root "stdout-$mode.log"
    $stderr = Join-Path $root "stderr-$mode.log"
    $process = Start-Process (Join-Path $folder 'AgentPad13.exe') -WorkingDirectory $env:TEMP -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try {
        $deadline = (Get-Date).AddSeconds(15)
        $engines = @()
        do {
            $engines = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object {
                $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $folder 'WebView2'), [StringComparison]::OrdinalIgnoreCase)
            })
            $process.Refresh()
            if ($process.HasExited) { throw 'Portable exited unexpectedly' }
            if ($engines.Count -eq 0) { Start-Sleep -Milliseconds 250 }
        } while ($engines.Count -eq 0 -and (Get-Date) -lt $deadline)
        if ($engines.Count -eq 0) { throw 'The included WebView2 runtime was not running' }
        do {
            $renderers = @($engines | Where-Object { $_.CommandLine -match '--type=renderer' })
            if ($renderers.Count -eq 0) {
                Start-Sleep -Milliseconds 250
                $engines = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object {
                    $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $folder 'WebView2'), [StringComparison]::OrdinalIgnoreCase)
                })
            }
        } while ($renderers.Count -eq 0 -and (Get-Date) -lt $deadline)
        if ($renderers.Count -eq 0) { throw 'The included WebView2 runtime did not create a renderer' }
        do {
            if (@(Get-ChildItem (Join-Path $folder 'Data') -Recurse -File).Count -gt 0) { break }
            Start-Sleep -Milliseconds 250
        } while ((Get-Date) -lt $deadline)
        if (@(Get-ChildItem (Join-Path $folder 'Data') -Recurse -File).Count -eq 0) { throw 'No local webview data created' }
        $process.Refresh()
        if ($process.HasExited) { throw 'Portable exited unexpectedly' }
        if ($process.MainWindowTitle -ne 'AgentPad13') { throw "Unexpected portable window title: $($process.MainWindowTitle)" }
        if (-not $process.CloseMainWindow()) { throw 'No native window to close' }
        if (-not $process.WaitForExit(15000)) { throw 'Portable did not close cleanly' }
    } finally {
        $process.Refresh()
        Write-Output "App PID $($process.Id), exited=$($process.HasExited)"
        if ($process.HasExited) { Write-Output "App exit code: $($process.ExitCode)" }
        Get-Content $stdout, $stderr -ErrorAction SilentlyContinue | Write-Output
        Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine | Format-List
        if (-not $process.HasExited) { & taskkill.exe /PID $process.Id /T /F | Out-Null }
    }
}
try {
    Test-Launch $package 'write'
    Test-Launch $package 'read'
    $moved = Join-Path $root 'Moved portable with spaces'
    Move-Item $package $moved
    Test-Launch $moved 'read'
    # A broken archive must fail rather than fall back to the installed runtime.
    Move-Item (Join-Path $moved 'WebView2') (Join-Path $moved 'WebView2-absent')
    $broken = Start-Process (Join-Path $moved 'AgentPad13.exe') -PassThru
    try {
        if (-not $broken.WaitForExit(10000)) { throw 'Missing runtime did not stop startup' }
        if ($broken.ExitCode -eq 0) { throw 'Missing runtime returned success' }
    } finally {
        if (-not $broken.HasExited) { & taskkill.exe /PID $broken.Id /T /F | Out-Null }
    }
    Write-Output 'PASS: archive, native Studio window, bundled runtime, restart, relocation, missing-runtime rejection. No HID connection.'
} finally {
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $oldRuntime
    $env:WEBVIEW2_USER_DATA_FOLDER = $oldData
    Write-Output "Smoke evidence directory: $root"
}
