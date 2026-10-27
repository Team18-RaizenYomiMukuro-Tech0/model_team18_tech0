# 週1要約を Windows のタスクスケジューラに登録・解除・確認する（毎週月曜 09:00）。管理者権限は要らない（自分のユーザーのタスクとして登録する）。
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\scheduled\register-digest-task.ps1 -Action Register
#   -Action: Register（登録・上書き） / Unregister（解除） / Status（状態確認。省略時） / RunNow（今すぐ1回）
# 未検証: Windows 実機では動かしていない（01_ナレッジ/定期実行の導入手順_Windows.md 参照）。
param(
  [ValidateSet('Register', 'Unregister', 'Status', 'RunNow')]
  [string]$Action = 'Status'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'MunderDigest'
$Script = (Resolve-Path (Join-Path $PSScriptRoot 'run-digest.ps1')).Path

switch ($Action) {
  'Register' {
    # -ExecutionPolicy Bypass はこの起動1回だけ有効（PC の実行ポリシー設定は変えない）
    $argLine = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $Script
    $act = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argLine -WorkingDirectory (Split-Path (Split-Path $PSScriptRoot))
    $trg = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At '09:00'
    # 取りこぼし（PC が起きていなかった）は起動後に1回走らせる。多重起動はしない
    $set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $pri = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $act -Trigger $trg -Settings $set -Principal $pri `
      -Description '週1要約（munder / run-digest.ps1）' -Force | Out-Null
    Write-Host "登録しました: $TaskName（毎週月曜 09:00、ユーザー $user）"
    Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Format-List TaskName, NextRunTime, LastRunTime, LastTaskResult
  }
  'Unregister' {
    if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
      Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
      Write-Host "解除しました: $TaskName"
    } else {
      Write-Host "登録されていません: $TaskName"
    }
  }
  'RunNow' {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "起動しました。ログ: $env:LOCALAPPDATA\munder-scheduled\"
  }
  'Status' {
    $t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if (-not $t) { Write-Host "登録されていません: $TaskName"; return }
    $t | Get-ScheduledTaskInfo | Format-List TaskName, NextRunTime, LastRunTime, LastTaskResult
    Write-Host "状態: $($t.State)"
  }
}
