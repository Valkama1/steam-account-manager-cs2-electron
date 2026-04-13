# 2fa.ps1 — Enter a Steam Guard TOTP code into the Steam login dialog.
#
# Called AFTER steam.exe -login <user> <pass> has already been launched.
# The TOTP code is pre-computed by Node.js and passed as the first argument
# so this script has no crypto dependency.
#
# Usage:  powershell.exe -File 2fa.ps1 <5-char-code>
# Exit:   0 = code entered, 1 = timed out / window not found

param([string]$Code)

if ($Code.Length -ne 5) { Write-Error "Expected 5-char code, got: $Code"; exit 1 }

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$AP  = [System.Windows.Automation.AutomationElement]
$TS  = [System.Windows.Automation.TreeScope]
$PC  = [System.Windows.Automation.PropertyCondition]
$CT  = [System.Windows.Automation.ControlType]
$ALL = [System.Windows.Automation.Condition]::TrueCondition

function Get-SteamLoginWindow {
    $desktop    = $AP::RootElement
    $helpers    = Get-Process -Name steamwebhelper -ErrorAction SilentlyContinue
    if (-not $helpers) { return $null }
    $helperIds  = @($helpers | Select-Object -ExpandProperty Id)
    foreach ($win in $desktop.FindAll($TS::Children, $ALL)) {
        try {
            $pid  = $win.GetCurrentPropertyValue($AP::ProcessIdProperty)
            if ($pid -notin $helperIds) { continue }
            $name = $win.Current.Name
            if (($name -like '*Steam*' -and $name.Length -gt 5) -or $name -eq '蒸汽平台登录') {
                return $win
            }
        } catch {}
    }
    return $null
}

# ── Wait for the Steam login window to appear (up to 40 s) ───────────────────

$loginWin = $null
$deadline = (Get-Date).AddSeconds(40)
while (-not $loginWin -and (Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 300
    $loginWin = Get-SteamLoginWindow
}

if (-not $loginWin) { Write-Error "Steam login window did not appear"; exit 1 }

# ── Wait for the 2FA code-entry state (5 buttons in the doc) ─────────────────
# Steam shows individual letter-buttons for each character of the code.

$docCond = New-Object $PC($AP::ControlTypeProperty, $CT::Document)
$btnCond = New-Object $PC($AP::ControlTypeProperty, $CT::Button)

$deadline2 = (Get-Date).AddSeconds(20)
$entered   = $false

while (-not $entered -and (Get-Date) -lt $deadline2) {
    Start-Sleep -Milliseconds 150
    try {
        $loginWin.SetFocus() | Out-Null
        $doc     = $loginWin.FindFirst($TS::Descendants, $docCond)
        if (-not $doc) { continue }
        $buttons = $doc.FindAll($TS::Children, $btnCond)
        if ($buttons.Count -lt 5) { continue }

        # Click each button slot and send the corresponding character
        for ($i = 0; $i -lt 5; $i++) {
            $buttons[$i].GetCurrentPattern(
                [System.Windows.Automation.InvokePattern]::Pattern
            ).Invoke()
            [System.Windows.Forms.SendKeys]::SendWait([string]$Code[$i])
            Start-Sleep -Milliseconds 80
        }
        $entered = $true
    } catch {}
}

if ($entered) { exit 0 } else { Write-Error "2FA dialog did not appear in time"; exit 1 }
