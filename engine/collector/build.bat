@echo off
echo Building collector.c ...
gcc -o collector.exe collector.c -lws2_32
if %errorlevel% neq 0 (
    echo Build Failed!
    exit /b %errorlevel%
)
echo Build Succeeded: collector.exe is ready.
