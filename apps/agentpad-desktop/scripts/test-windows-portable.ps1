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
$probe = Join-Path $PSScriptRoot 'probe-portable-webview.mjs'
$token = [guid]::NewGuid().ToString()
$oldArgs = $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
$oldRuntime = $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER
$oldData = $env:WEBVIEW2_USER_DATA_FOLDER
function Test-Launch([string]$folder, [string]$mode) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    $listener.Start(); $port = $listener.LocalEndpoint.Port; $listener.Stop()
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=$port --remote-debugging-address=127.0.0.1"
    # An invalid inherited runtime makes silent fallback observable. The app must override it.
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = Join-Path $root 'missing-system-runtime'
    $env:WEBVIEW2_USER_DATA_FOLDER = $null
    & icacls.exe (Join-Path $folder 'WebView2') /grant '*S-1-15-2-2:(OI)(CI)(RX)' '*S-1-15-2-1:(OI)(CI)(RX)' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Runtime ACL preparation failed' }
    $stdout = Join-Path $root "stdout-$port.log"
    $stderr = Join-Path $root "stderr-$port.log"
    $process = Start-Process (Join-Path $folder 'AgentPad13.exe') -WorkingDirectory $env:TEMP -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    try {
        & node $probe $port $mode $token
        if ($LASTEXITCODE -ne 0) { throw "Portable webview probe failed ($mode)" }
        $engines = @(Get-CimInstance Win32_Process -Filter "Name='msedgewebview2.exe'" | Where-Object {
            $_.ExecutablePath -and $_.ExecutablePath.StartsWith((Join-Path $folder 'WebView2'), [StringComparison]::OrdinalIgnoreCase)
        })
        if ($engines.Count -eq 0) { throw 'The included WebView2 runtime was not running' }
        if (@(Get-ChildItem (Join-Path $folder 'Data') -Recurse -File).Count -eq 0) { throw 'No local webview data created' }
        $process.Refresh()
        if ($process.HasExited) { throw 'Portable exited unexpectedly' }
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
    Write-Output 'PASS: archive, rendered Studio, bundled runtime, restart, relocation, missing-runtime rejection. No HID connection.'
} finally {
    $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = $oldArgs
    $env:WEBVIEW2_BROWSER_EXECUTABLE_FOLDER = $oldRuntime
    $env:WEBVIEW2_USER_DATA_FOLDER = $oldData
    Write-Output "Smoke evidence directory: $root"
}
