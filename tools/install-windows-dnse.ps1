# Chỉ đăng ký một task dưới danh tính hiện tại; không lưu mật khẩu Windows.
param([Parameter(Mandatory=$true)][string]$PythonPath, [switch]$Plan)
$ErrorActionPreference = 'Stop'
$repoPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$pythonFile = (Resolve-Path -LiteralPath $PythonPath).Path
$workerFile = (Resolve-Path -LiteralPath (Join-Path $repoPath 'tracker-tools\windows_dnse.py')).Path
$taskName = 'Tracker-DNSE-Personal-EOD'
$arguments = '"' + $workerFile + '" --run'
if ($Plan) {
    [pscustomobject]@{name=$taskName;execute=$pythonFile;arguments=$arguments;weekdays='Mon-Fri';at='16:17';atLogon=$true;runLevel='Limited';storesWindowsPassword=$false} | ConvertTo-Json -Compress
    exit 0
}
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existing -and ($existing.Actions.Execute -ne $pythonFile -or $existing.Actions.Arguments -ne $arguments)) {
    throw 'Task cùng tên có hành động khác; giữ nguyên task đang có.'
}
$identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute $pythonFile -Argument $arguments -WorkingDirectory $repoPath
$triggers = @(
    (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday,Tuesday,Wednesday,Thursday,Friday -At '16:17'),
    (New-ScheduledTaskTrigger -AtLogOn -User $identity)
)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 3) -RestartCount 2 -RestartInterval (New-TimeSpan -Minutes 30) -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'DNSE cá nhân → Supabase private → Tracker iPhone. Máy cần bật và đã đăng nhập Windows.' -Force | Out-Null
$verified = Get-ScheduledTask -TaskName $taskName
if ($verified.Actions.Execute -ne $pythonFile -or $verified.Actions.Arguments -ne $arguments) { throw 'Task chưa khớp cấu hình.' }
Write-Output 'WINDOWS_DNSE_SCHEDULE_READY'
