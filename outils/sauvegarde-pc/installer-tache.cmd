@echo off
rem CASA-ELECT : programme la sauvegarde chaque jour à 20 h et à chaque ouverture de session (si le PC était éteint à 20 h)
set S=%~dp0sauvegarde-casa.ps1
schtasks /Create /F /TN "CASA-ELECT sauvegarde" /SC DAILY /ST 20:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%S%\""
schtasks /Create /F /TN "CASA-ELECT sauvegarde (ouverture)" /SC ONLOGON /DELAY 0010:00 /TR "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%S%\""
echo.
echo Taches programmees. Test immediat :
powershell -NoProfile -ExecutionPolicy Bypass -File "%S%"
type "C:\Sauvegardes\CASA-ELECT\journal.txt"
pause
