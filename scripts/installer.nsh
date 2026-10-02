; Morpheus installer: checked, recoverable replacement of one installation.
; No name-based process termination or delayed wildcard deletion.
!include "LogicLib.nsh"
Var /GLOBAL clawxRollbackDir

!macro customHeader
  ShowInstDetails show
  ShowUninstDetails show
!macroend

!macro morpheusInstallGuard ACTION BACKUP
  InitPluginsDir
  File "/oname=$PLUGINSDIR\morpheus-install-guard.ps1" "${PROJECT_DIR}\scripts\windows\install-guard.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\morpheus-install-guard.ps1" -Action ${ACTION} -InstallDir "$INSTDIR" -BackupDir "${BACKUP}"'
  Pop $R0
  Pop $R1
!macroend

!macro customCheckAppRunning
  SetDetailsPrint both
  SetOutPath $TEMP
  ; Let the user save work and close this exact installation. Never kill another.
  _morpheus_check_closed:
    !insertmacro morpheusInstallGuard Check "$INSTDIR._rollback_0"
    ${if} $R0 != 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Cannot safely replace Morpheus.$\r$\n$R1$\r$\nClose the selected installation and retry." /SD IDCANCEL IDRETRY _morpheus_check_closed
      SetErrorLevel 2
      Quit
    ${endIf}
  !ifndef BUILD_UNINSTALLER
    StrCpy $clawxRollbackDir ""
    StrCpy $R8 0
    _morpheus_backup_name:
      IfFileExists "$INSTDIR._rollback_$R8" 0 _morpheus_prepare
      IntOp $R8 $R8 + 1
      Goto _morpheus_backup_name
    _morpheus_prepare:
      !insertmacro morpheusInstallGuard Prepare "$INSTDIR._rollback_$R8"
      ${if} $R0 != 0
        MessageBox MB_OK|MB_ICONEXCLAMATION "The previous installation has been preserved.$\r$\n$R1$\r$\nChoose a dedicated Morpheus folder or close its running tasks and retry." /SD IDOK
        SetErrorLevel 2
        Quit
      ${endIf}
      IfFileExists "$INSTDIR._rollback_$R8\" 0 _morpheus_prepared
        StrCpy $clawxRollbackDir "$INSTDIR._rollback_$R8"
      _morpheus_prepared:
      CreateDirectory "$INSTDIR"
  !endif
!macroend

!macro customInstall
  ${if} $clawxRollbackDir != ""
    DetailPrint "Previous installation retained for recovery: $clawxRollbackDir"
  ${endIf}
  DetailPrint "Morpheus installation complete. Profiles and provider settings have been preserved."
!macroend

!macro customUnInstall
  ; Multi-user initialization has now resolved the actual removal directory.
  ; Validate product markers again before the inherited recursive binary removal.
  !insertmacro morpheusInstallGuard CheckUninstall "$INSTDIR._rollback_0"
  ${if} $R0 != 0
    MessageBox MB_OK|MB_ICONEXCLAMATION "Cannot safely uninstall Morpheus.$\r$\n$R1$\r$\nNo files have been removed." /SD IDOK
    SetErrorLevel 2
    Quit
  ${endIf}
  ; Only remove the CLI entry associated with this exact installation.
  InitPluginsDir
  File "/oname=$PLUGINSDIR\update-user-path.ps1" "${PROJECT_DIR}\resources\cli\win32\update-user-path.ps1"
  nsExec::ExecToStack '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\update-user-path.ps1" -Action remove -CliDir "$INSTDIR\resources\cli"'
  Pop $0
  Pop $1
  DetailPrint "Morpheus profiles, provider settings, .openclaw and original ClawX profile will be preserved."
  ; AppData is retained; uninstalling binaries never erases personal history.
!macroend
