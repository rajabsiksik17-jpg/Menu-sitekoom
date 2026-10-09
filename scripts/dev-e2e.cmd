@echo off
rem End-to-end test server: embedded database in .\data-e2e (prepared by "npm run e2e:setup").
set DATA_DIR=./data-e2e
call "%~dp0dev-local.cmd"
