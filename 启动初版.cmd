@echo off
cd /d "%~dp0"
if not exist node_modules\vite\bin\vite.js (
  echo Please run npm.cmd install in this folder first.
  pause
  exit /b 1
)
powershell.exe -NoLogo -NoProfile -NonInteractive -Command ^
  "$ErrorActionPreference='Stop'; $port=5178; " ^
  "$viteRoot=[regex]::Escape((Join-Path (Get-Location).Path 'node_modules').Replace('\','/')); " ^
  "$viteCommand='^\s*(?:\x22[^\x22]+\x22|\S+)\s+\x22?'+$viteRoot+'/+(?:\.bin/+\.\./+)?vite/+bin/+vite\.js(?:\x22|\s|$)'; " ^
  "function Get-Owners { Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq $port | Select-Object -ExpandProperty OwningProcess -Unique }; " ^
  "try { " ^
  "  $servers=@(foreach($owner in (Get-Owners)){ " ^
  "    $process=Get-Process -Id $owner -ErrorAction SilentlyContinue; if(-not $process){continue}; " ^
  "    $info=Get-CimInstance Win32_Process -Filter ('ProcessId='+$owner); " ^
  "    if(-not $info -or $info.Name -ine 'node.exe' -or ([string]$info.CommandLine).Replace('\','/') -notmatch $viteCommand){throw ('Port '+$port+' is used by another process (PID '+$owner+'). Close it manually and try again.')}; " ^
  "    $process " ^
  "  }); " ^
  "  foreach($process in $servers){if(-not $process.HasExited){Write-Host ('Stopping old SpaceMate server (PID '+$process.Id+')...'); Stop-Process -InputObject $process; if(-not $process.WaitForExit(5000)){throw 'Old SpaceMate server did not stop within 5 seconds.'}}}; " ^
  "} catch { Write-Host $_.Exception.Message; exit 1 }; exit 0"
if errorlevel 1 (
  pause
  exit /b 1
)
call npm.cmd run dev -- --open
pause
