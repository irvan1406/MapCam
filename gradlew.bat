@echo off
setlocal
set GRADLE_VERSION=9.5.0
if "%GRADLE_USER_HOME%"=="" set GRADLE_USER_HOME=%USERPROFILE%\.gradle
set WRAPPER_HOME=%GRADLE_USER_HOME%\gps-map-camera-wrapper
set GRADLE_DIR=%WRAPPER_HOME%\gradle-%GRADLE_VERSION%
set ARCHIVE=%WRAPPER_HOME%\gradle-%GRADLE_VERSION%-bin.zip
if not exist "%GRADLE_DIR%\bin\gradle.bat" (
  if not exist "%WRAPPER_HOME%" mkdir "%WRAPPER_HOME%"
  if not exist "%ARCHIVE%" powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -Uri 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%ARCHIVE%'"
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%ARCHIVE%' -DestinationPath '%WRAPPER_HOME%' -Force"
)
call "%GRADLE_DIR%\bin\gradle.bat" %*
endlocal
