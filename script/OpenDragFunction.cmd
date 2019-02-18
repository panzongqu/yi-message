@echo off
reg add HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\policies\system /v EnableLUA /t REG_DWORD /d 0x0 /f
echo restart now?(y/n)
set /p=choice: 
if "%choice%" ==  "y" goto yes
if "%choice%" ==  "n" goto no
:yes
::shutdown /r /t 4
echo need restart computor!
pause&exit
:no
pause&exit